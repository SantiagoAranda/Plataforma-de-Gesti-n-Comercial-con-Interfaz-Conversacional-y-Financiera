# PostgreSQL desechable para validar Etapa 1

Estas son instrucciones para ejecutar después de iniciar Docker Desktop con contenedores Linux. **No fueron ejecutadas durante la verificación.** No usan la conexión habitual, no aplican migraciones productivas y no requieren nuevas dependencias npm. PostgreSQL se ejecuta localmente dentro de un contenedor dedicado; no se reutiliza una instalación con datos reales.

## 1. Crear y comprobar aislamiento

Desde PowerShell, dentro de `backend`. Usar una terminal nueva; no imprimir ni copiar las variables de contraseña/URL en informes.

```powershell
docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) { throw 'Iniciar Docker Desktop Linux antes de continuar' }

$authTestPassword = [guid]::NewGuid().ToString('N')
docker run --detach --rm --name auth-stage1-pg-test `
  --label purpose=auth-stage1-disposable-test `
  --publish 127.0.0.1:55432:5432 `
  --tmpfs /var/lib/postgresql/data `
  --env POSTGRES_USER=auth_stage1 `
  --env "POSTGRES_PASSWORD=$authTestPassword" `
  --env POSTGRES_DB=auth_stage1_test postgres:16
if ($LASTEXITCODE -ne 0) { throw 'No continuar: no se creó el contenedor nuevo' }

docker inspect --format '{{.Name}} {{.Config.Image}} {{json .Config.Labels}} {{json .HostConfig.PortBindings}}' auth-stage1-pg-test
docker exec auth-stage1-pg-test pg_isready -U auth_stage1 -d auth_stage1_test
```

Confirmar nombre `/auth-stage1-pg-test`, imagen `postgres:16`, etiqueta `auth-stage1-disposable-test`, enlace exclusivo `127.0.0.1:55432` y estado listo. Si aún no está listo, repetir únicamente pg_isready. Si cualquier dato difiere, detenerse. No reutilizar un contenedor previo que haya impedido la creación.

Antes de escribir el esquema:

```powershell
docker exec auth-stage1-pg-test psql -U auth_stage1 -d auth_stage1_test -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user; SELECT count(*) AS application_tables FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el aislamiento' }
```

Debe devolver `auth_stage1_test`, `auth_stage1` y **0 tablas de aplicación**. La combinación de creación nueva, etiqueta, puerto local y base vacía acredita que es desechable; un nombre terminado en `_test` por sí solo no lo acredita.

## 2. Preparar el esquema, sin usar DATABASE_URL habitual

Solo tras verificar lo anterior:

```powershell
$env:AUTH_TEST_DATABASE_URL = "postgresql://auth_stage1:${authTestPassword}@127.0.0.1:55432/auth_stage1_test?schema=auth_stage1_test"
@'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const raw = process.env.AUTH_TEST_DATABASE_URL;
if (!raw) throw new Error('Falta AUTH_TEST_DATABASE_URL');
const url = new URL(raw);
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
    url.port !== '55432' || url.pathname !== '/auth_stage1_test' ||
    url.searchParams.get('schema') !== 'auth_stage1_test') {
  throw new Error('Destino de prueba no permitido');
}
const result = spawnSync(process.execPath, [
  path.resolve('node_modules/prisma/build/index.js'),
  'db', 'push', '--skip-generate'
], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: raw } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'No ejecutar pruebas: preparación incompleta' }
```

El override de DATABASE_URL existe únicamente en el proceso hijo y apunta al destino validado. No se modifica `.env`, ni la variable de la terminal, ni se ejecuta el seed general. `db push` se permite aquí exclusivamente para crear el esquema completo de esta base nueva; **no es el procedimiento de despliegue**. La suite crea sus propios catálogos ficticios. Los flags se verificaron con Prisma CLI 6.19.2 instalado.

Para acreditar específicamente la migración nueva, en esta misma base aislada y antes de los tests: comprobar que AuthRateLimit coincide con `20261029120000_auth_rate_limit/migration.sql`. En una segunda base desechable, validar también el recorrido de migraciones; `db push` no acredita el historial de migraciones de staging.

## 3. Ejecutar las cinco pruebas

```powershell
$env:RUN_AUTH_DB_TESTS = '1'
try {
  npx --no-install jest --config test/jest-e2e.json --runInBand --no-cache auth-concurrency.e2e-spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'Hay fallos de integración pendientes' }
} finally {
  Remove-Item Env:RUN_AUTH_DB_TESTS -ErrorAction SilentlyContinue
  Remove-Item Env:AUTH_TEST_DATABASE_URL -ErrorAction SilentlyContinue
}
```

Casos: mismo email concurrente; mismo slug concurrente; fallo al crear usuario después de mappings; fallo dentro de la inicialización contable; contadores PostgreSQL compartidos por dos instancias del guard.

No contar `skipped` como éxito. La concurrencia usa promesas y dos instancias del guard en un proceso; después se requieren pruebas HTTP con dos procesos backend reales detrás del proxy de staging. La limpieza del test elimina sus usuarios/negocios; pueden quedar catálogos y contadores ficticios dentro de esta base desechable.

## 4. Finalizar el entorno de prueba

Volver a comprobar nombre y etiqueta con el inspect restringido del paso 1. **Solo para ese contenedor de prueba recién creado**, `docker stop auth-stage1-pg-test` lo detiene y `--rm` lo elimina. El almacenamiento tmpfs es efímero. No borrar volúmenes, directorios ni bases ajenas. Cerrar la terminal de prueba para descartar sus variables temporales.

## Si se prefiere PostgreSQL nativo local

Un administrador debe crear una base nueva `auth_stage1_test`, un rol exclusivo sin permisos sobre otras bases y el esquema `auth_stage1_test`. Verificar proceso/puerto local, ausencia de túneles o conexiones productivas, identidad SQL y base vacía antes de adaptar el validador de puerto anterior. No apuntar la suite a una base existente solo porque su nombre termine en `_test`. No había una instancia nativa identificable disponible en esta revisión.
