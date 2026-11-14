# Preparación para producción — pruebas, dependencias, runtime y procedimiento

13/11/2026. Rama `Fase1` (base `dbed804`), cambios sin commit. Sin despliegues, sin cambios en Railway, sin migraciones ni escrituras en bases compartidas, sin emisión Factus. Continúa `SACTEC-auditoria-produccion-2026-11-13.md` (NO-GO) y `sharp-remediation-2026-11-13.md`.

## 1. Pruebas oficiales

### Correcciones de fixtures (sin código de producción)

| # | Archivo | Corrección | Evidencia en producción |
|---|---|---|---|
| 1 | `src/accounting/accounting.service.spec.ts:1144` | `nominaSueldos` esperado 0 | El fixture solo registra 519595/219595; la nómina suma 5105/5205 (`accounting.service.ts:1811`). |
| 2 | `src/tax/manual-verification.spec.ts:455` | `txMock` expone `pucCuenta`/`pucSubcuenta` | La contabilización consulta el PUC dentro de la transacción (`accounting.service.ts:803–835`). |
| 3, 4 | `test/sales-flow.e2e-spec.ts` | Producto con receta `RECIPE_BASED`; se siembran 14/1435, 6/61/6135 | Solo `RECIPE_BASED` consume inventario (`sales.service.ts:1932`); el costo usa 1435/6135 (`ORDER_ACCOUNTING_DEFAULTS`). |
| 5 | `test/sales-flow.e2e-spec.ts` | Busca por naturaleza en lugar de `movements[0]`; detalle «rol + ítem»; cliente verificado en la Order vinculada | Ver abajo. |

**Contrato del detalle contable (#5).** El commit `2072105` (24/06/2026, «Se agrego Gastos en Contabilidad») eliminó deliberadamente `customerName` del detalle y añadió pruebas unitarias con los textos exactos (`accounting.service.spec.ts`, p. ej. `'Contrapartida venta mixta'`, `'Ingreso por venta de producto - Producto A'`). No se encontró en `docs/` ni en los READMEs un requisito que exija el cliente en el detalle. La prueba e2e se alinea con ese contrato existente; no se inventó uno nuevo. El cliente sigue siendo trazable mediante `originId → Order.customerName`, y la prueba lo verifica. Si producto decide que el cliente debe figurar en el libro, es un cambio funcional nuevo, no una corrección de pruebas.

### Resultados

| Suite | Entorno | Resultado |
|---|---|---|
| Backend unitaria completa | Host Windows, Node 24.13.0, Jest serial | **1007/1007**, 58/58 suites (antes 1005/1007) |
| PostgreSQL aislado (`run-reservations-isolated.cjs`) | PostgreSQL 16 efímero, loopback, tmpfs, `America/Bogota` | **85/85**: reservas 76/76, sales-flow 9/9 (antes 82/85). 92 migraciones con `migrate deploy`, `migrate diff` vacío, compatibilidad histórica 2.1/2.2 aprobada |
| `npm ci` + `prisma generate` + `npm run build` | Docker `node:22.23.4-trixie`, copia limpia sin `.env`/`node_modules`/`dist` | Aprobado: 828 paquetes, `dist/main.js` emitido |
| `npm install` sobre el árbol de `npm ci` | Mismo contenedor | «up to date»: el lockfile está sincronizado |
| Frontend | — | Sin cambios desde 183/183; no se repitió |

Una ejecución completa de la suite unitaria dentro del contenedor Linux dio 1000/1007: 2 ENOENT porque la copia omitió `frontend/src/lib/payroll/api.ts` (los tests de nómina leen archivos del frontend) y 5 timeouts/ECONNRESET mientras el motor Docker colapsaba. Son fallos del entorno de la prueba; la misma suite pasó 1007/1007 en el host.

## 2. Dependencias: `npm audit --omit=dev` (7 altas, 2 bajas)

Ninguna es de explotación demostrada en SACTEC. Cuatro cadenas:

| Entradas | Instalada → corregida | Tipo | ¿Runtime? | Ruta de entrada | Decisión |
|---|---|---|---|---|---|
| `multer` (alta) GHSA-q7qp-rjg7-q26m; `@nestjs/platform-express` (alta, solo por arrastrar multer) | multer 2.4.0 → 2.5.0; platform-express 11.2.8 → 11.2.10 | multer transitiva; platform-express directa | Sí | El DoS exige un `fileFilter` asíncrono. Los dos `FileInterceptor` (`items.controller.ts:99`, `businesses.controller.ts:107`) no usan `fileFilter` ni hay `MulterModule` con opciones. No alcanzable con la configuración actual. | **Aceptar temporalmente**; actualizar `@nestjs/*` 11.2.x en conjunto en un cambio separado y probado. Revalidar si se añade `fileFilter`. |
| `prisma` y `@prisma/config` (altas, directas), `deepmerge-ts` (alta, GHSA-ggr8-5vv4-36mx), `effect` (alta, GHSA-38f7-945m-qr2g) | Corrección solo con Prisma 7.10.1 (**mayor**) | `prisma` CLI 6.19.2; `@prisma/config` 7.4.1 directa | No: las carga la CLI (`generate`, `migrate`). La app usa el cliente generado. No existe `prisma.config.*` y ningún archivo de `src` importa `@prisma/config`. | Recursión de objetos de configuración y contexto de `effect` bajo RPC concurrente: entradas controladas por el equipo, en tiempo de build/migración. | **Aceptar temporalmente.** Migrar a Prisma 7 es un proyecto aparte. `@prisma/config` 7.4.1 parece innecesaria como dependencia directa: confirmar y retirarla en otro cambio. |
| `defu` (alta, GHSA-737v-mqg7-c878) | 6.1.4 → 6.1.7 | Transitiva vía `@prisma/config` → `c12` | No (solo CLI Prisma) | Contaminación de prototipo por `__proto__` en defaults de configuración: no recibe datos de usuarios. | **Aceptar temporalmente**; se resuelve al retirar `@prisma/config` o al actualizar el lock sin cambio mayor. |
| `fast-xml-parser` (baja, GHSA-474x-hrwr-fgx4), `@aws-sdk/xml-builder` (baja) | 5.7.3 → ≥5.11.3; xml-builder 3.972.28 → 3.972.43 | Transitivas de `@aws-sdk/client-s3` | Sí (almacenamiento R2) | CPU cuadrática con XML malformado: solo procesa respuestas de R2, un endpoint de confianza. | **Aceptar**; actualizar `@aws-sdk/client-s3` en el próximo mantenimiento. |

No se modificó el lockfile. `npm audit fix --omit=dev` no es utilizable: la simulación eliminaba del lock todas las dependencias de desarrollo.

## 3. Runtime productivo y sharp 0.35.5

| Requisito sharp 0.35.5 (linux-x64 precompilado) | Producción (Railway) | Estado |
|---|---|---|
| Node ≥ 20.9.0 | 22.23.4 | Cumple |
| glibc ≥ 2.28 | Debian Trixie, glibc 2.41 (`ldd` en `node:22.23.4-trixie`) | Cumple. Debian 13 publica glibc 2.41 en todas sus revisiones; la imagen Railpack no es la misma imagen, pero sí la misma versión de Debian. |
| CPU x86-64 con SSE4.2 | amd64; CPU del host Railway no verificada | **Sin verificar.** Todo x86-64 de servidor desde 2008 (Nehalem / AMD Bulldozer) la tiene; el riesgo es teórico. |
| Binarios opcionales instalados | `npm ci` en Trixie instaló el árbol sin errores | Cumple (build aprobado) |

**Pendiente:** cargar sharp y ejecutar las 17 pruebas de imagen en `node:22.23.4-trixie`. Docker Desktop dejó de responder durante esta sesión y no se recuperó. Comando para completar la verificación:

```sh
# desde una copia limpia (git ls-files -co --exclude-standard) en $SRC
docker run --rm -v "$SRC:/src:ro" node:22.23.4-trixie bash -c 'cp -r /src/backend /w && cd /w && npm ci --no-audit --no-fund >/dev/null && node -e "console.log(require(\"sharp\").versions)" && node --test test/sharp-image-compat.test.cjs'
```

Verificación de solo lectura en el contenedor productivo (requiere tu autorización; no modifica nada):

```sh
railway ssh --service Plataforma-de-Gesti-n-Comercial-con-Interfaz-Con --environment production -- sh -c 'ldd --version | head -1; grep -m1 -o sse4_2 /proc/cpuinfo'
```

Si fallara, se detecta en el arranque: `items.service.ts` y `businesses.service.ts` importan sharp estáticamente y el proceso no inicia. Falla antes de recibir tráfico y antes de cualquier escritura v2.

### Build y start de Railway (recomendación; no se modificó nada)

- **Build:** cambiar `npm install && npx prisma generate && npm run build` por `npm ci && npm run build`. `npm run build` ya ejecuta `prisma generate`. `npm ci` instala exactamente el lockfile y falla si `package.json` y el lock divergen; el build quedó verificado con ese comando en Trixie. Revisar en los logs de build si Railpack ya ejecuta `npm ci` en su fase de instalación; en ese caso basta `npm run build`.
- **Start:** `npm run build && npm run start:prod` recompila en cada arranque y reinicio, en el contenedor de runtime. Recomendado: `npm run start:prod`. Así arranca más rápido y ejecuta exactamente el artefacto construido.

## 4. Procedimiento de despliegue y recuperación (no ejecutado)

Hechos de partida:

- Producción ejecuta `3d450b4` (06/11/2026), ancestro directo de `Fase1`.
- Respecto de ese commit, el repositorio agrega **exactamente 4 migraciones**: `20261108120000_reservation_active_slot_unique`, `20261112000100_reservation_completed`, `20261112000200_reservation_audit` y `20261113000100_reservation_policy_v2`. Todas son aditivas. La primera reemplaza el índice único completo por uno parcial (solo estados no cancelados): como el índice anterior ya era único sobre todas las filas, no puede haber duplicados que bloqueen la creación.
- Las migraciones **no** se aplican en build ni en start: hay que ejecutarlas a mano.
- Escritores del backend: API HTTP, `FiscalDocumentRecoveryService` (`@Cron` cada minuto, llama a Factus) y `AuthRateLimitGuard` (`@Interval` 60 s). Todos viven en el mismo proceso: detener el servicio los detiene a todos.
- **Por qué no puede haber convivencia:** con el esquema migrado, el código anterior crea reservas con `commercialPolicyVersion` por defecto 1 (reglas v1), lo que rompe la política universal v2. El cron fiscal duplicado también competiría por los mismos documentos.

### Paso 0 — Consultas de solo lectura (antes del día del corte)

Con `DATABASE_PUBLIC_URL` (la URL interna no resuelve fuera de Railway), usando un rol de solo lectura si existe:

```sql
SELECT version();
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
  FROM "_prisma_migrations" ORDER BY started_at;          -- esperado: 88 terminadas, ninguna fallida
SELECT indexname FROM pg_indexes WHERE tablename = 'Reservation';   -- esperado: Reservation_itemId_date_startMinute_key
SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;  -- esperado 0
-- PUC que usa el cierre comercial (ORDER_ACCOUNTING_DEFAULTS) y el inventario:
SELECT code, active FROM "PucSubcuenta" WHERE code IN ('110505','111005','413595');   -- 3 filas activas
SELECT code FROM "PucCuenta" WHERE code IN ('1435','6135','1105','1110');             -- 4 filas
-- Solo si hay negocios con impuestos activos:
SELECT code FROM "PucSubcuenta" WHERE code = '135515';
SELECT code FROM "PucCuenta" WHERE code = '2408';
```

`npx prisma migrate status` con la misma URL también es de solo lectura y debe listar las 4 migraciones como pendientes. Para comparar checksums, Prisma usa el SHA-256 de cada `migration.sql`:
`for d in prisma/migrations/*/; do printf '%s %s\n' "$(basename $d)" "$(sha256sum $d/migration.sql | cut -c1-64)"; done`.
Cualquier diferencia o migración extra es un **alto**. Si falta alguna cuenta PUC, cargar solo esas filas desde `prisma/seed-data/puc_*.csv`, nunca un seed global. Nota: la auditoría anterior mencionaba 417095; el código actual registra servicios en 413595 (`ORDER_ACCOUNTING_DEFAULTS`) y no referencia 417095.

En Railway, comprobar que el servicio backend tiene **una sola réplica**, que no hay otros servicios con la misma `DATABASE_URL` (workers, cron jobs) y la configuración de solapamiento entre deployments: Railway mantiene el deployment anterior activo mientras arranca el nuevo.

### Paso 1 — Ensayo con respaldo restaurado (antes del corte)

```sh
pg_dump --format=custom --no-owner --file=sactec-ensayo.dump "$DATABASE_PUBLIC_URL"   # pg_dump >= versión del servidor
docker run -d --name sactec-restore --tmpfs /var/lib/postgresql/data -p 127.0.0.1:55440:5432 \
  -e POSTGRES_PASSWORD=$PW postgres:<misma mayor>
pg_restore --no-owner --dbname=postgresql://postgres:$PW@127.0.0.1:55440/postgres sactec-ensayo.dump
```

Verificar el respaldo comparando conteos de `Reservation`, `Order`, `AccountingMovement`, `InventoryMovement` y `_prisma_migrations` contra producción. Después, **sobre la copia**: `DATABASE_URL=<copia> npx prisma migrate deploy` desde un checkout limpio del commit a desplegar. Comprobar que solo aplica las 4, que `migrate diff` queda vacío, que los conteos y los estados de reservas no cambian, y que `SELECT count(*) FROM "Reservation" WHERE "commercialPolicyVersion" <> 1` da 0. Medir la duración (define la ventana). Arrancar el backend nuevo contra la copia (sin credenciales Factus reales, R2 o push) y recorrer el checklist posterior de la auditoría con un negocio QA. La copia contiene datos reales: mantenerla local, sobre tmpfs, y destruirla al terminar.

### Paso 2 — Corte (ventana de mantenimiento)

1. Anunciar la ventana y poner el frontend en mantenimiento, o aceptar errores durante el corte.
2. **Detener el deployment activo del backend** en Railway y confirmar que no queda ninguno en ejecución (ni logs nuevos del cron fiscal).
3. Verificar que no hay sesiones de la app: `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();` (descontar las tuyas).
4. **Respaldo final consistente**, con escritores detenidos: `pg_dump --format=custom ...`. Verificar con `pg_restore --list` y guardarlo fuera de Railway. Es el punto de recuperación.
5. Un único ejecutor: `DATABASE_URL=$DATABASE_PUBLIC_URL npx prisma migrate deploy` desde el checkout del commit liberado. Repetir las consultas del Paso 0: 92 terminadas, índice parcial `Reservation_active_slot_key` presente, ninguna fila con política distinta de 1.
6. Desplegar el backend (commit exacto, lockfile incluido) con solapamiento irrelevante, porque el anterior ya está detenido. Comprobar el arranque (sharp cargó) y `GET /`.
7. Desplegar el frontend compatible. El frontend anterior frente al backend nuevo se rechaza sin efectos (D3 del bloque 2.2), así que el orden backend → frontend es seguro.
8. Checklist posterior de la auditoría con negocio QA autorizado, sin emisión Factus real. Reabrir tráfico.

### Recuperación

- **Puerta de rollback de código:** volver a `3d450b4` es seguro solo mientras se cumpla
  `SELECT count(*) FROM "Reservation" WHERE "commercialPolicyVersion" = 2 OR status = 'COMPLETED'` = 0.
  El código anterior tolera las columnas e índices aditivos, pero no conoce `COMPLETED` ni la política v2. Así se resuelven fallos de arranque (por ejemplo, sharp) o de migración detectados antes de abrir tráfico.
- **Con reservas v2 existentes:** no volver a código v1 ni usar `reservationPolicyV2Enabled` como interruptor (ya no se lee). La recuperación es una corrección hacia adelante sobre `Fase1`, o un artefacto de recuperación basado en este commit.
- **No revertir migraciones** ni borrar columnas, precios o asientos para que arranque código anterior.
- **Restaurar el respaldo final** solo ante corrupción demostrada, primero en un entorno separado. Conciliar las escrituras posteriores al respaldo y los documentos ya aceptados por Factus (restaurar la base no deshace una aceptación externa) antes de tocar producción.
- Una migración fallida a mitad queda registrada en `_prisma_migrations`: no reintentar a ciegas. Diagnosticar y usar `prisma migrate resolve` solo tras revisar el estado real del esquema.

## 5. Pendientes por criticidad

| Criticidad | Pendiente | Cierre |
|---|---|---|
| Bloqueante | Preflight de producción no ejecutado: migraciones/checksums reales, PUC, réplicas y servicios con la misma BD | Paso 0 (solo lectura) |
| Bloqueante | Respaldo restaurable y ensayo de migración sobre la copia no realizados | Paso 1 |
| Alta | sharp 0.35.5 no cargado ni probado en Node 22/Trixie (Docker cayó); SSE4.2 de Railway no verificada | Comando de la sección 3; `railway ssh` de solo lectura |
| Alta | Revisión visual escritorio/móvil del selector y formulario (F4) | Requiere navegador |
| Media | Fallo intermitente «Reservas contra Ventas manual» sin traza (F3) | Capturar código Prisma/SQLSTATE si reaparece; no modificar `toBookingConflict` sin evidencia |
| Media | Horario general no amplía servicios con ventanas propias (F2) | Decisión de producto; existe solución operativa |
| Media | Build/start de Railway: `npm install` y recompilación en el start | Recomendación de la sección 3, con tu autorización |
| Baja | multer, Prisma CLI, defu, fast-xml-parser (sección 2) | Actualizaciones separadas |
| Baja | HEIC/HEVC no soportado por el binario precompilado; citas manuales gratuitas con espejo de total cero (F6) | Documentado, preexistente |
| Decisión de producto | ¿El cliente debe figurar en el detalle contable? | Hoy no, por diseño (`2072105`) |

## 6. Decisión

**NO-GO para desplegar hoy. GO condicionado** una vez completados los dos bloqueantes operativos y la verificación de sharp en Trixie.

Los bloqueantes técnicos de código de la auditoría quedaron cerrados con evidencia: B1 (sharp actualizado), B2 (build limpio con `npm ci` en Node 22.23.4/Trixie) y F1 (suites oficiales en verde: 1007/1007 y 85/85). Lo que falta no requiere cambiar código. Requiere datos de producción (Paso 0), un respaldo restaurado y ensayado (Paso 1), y una ejecución de sharp en el runtime equivalente. Si los tres resultan conformes, el despliegue puede seguir el Paso 2.
