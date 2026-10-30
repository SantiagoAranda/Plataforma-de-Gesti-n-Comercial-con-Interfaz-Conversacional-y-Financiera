# Etapa 1 — Implementación y validación

Fecha: 29 de octubre de 2026.

Actualización de verificación (30/10/2026): consultar [AUTH_STAGE1_VERIFICATION.md](AUTH_STAGE1_VERIFICATION.md) para los resultados actuales y las limitaciones contrastadas contra código. La suite frontend ahora contiene 13 pruebas y la suite PostgreSQL 5 casos pendientes (se añadió fallo dentro de la inicialización contable). Este documento conserva los resultados de la ejecución original.

Estado: código implementado y comprobaciones locales realizadas. **No constituye aprobación de producción**: faltan pruebas PostgreSQL reales y recorrido en navegador/staging. No se ejecutaron migraciones, despliegues, merge ni operaciones contra datos reales. No se instalaron dependencias ni se modificaron archivos de entorno.

## Cambios y compatibilidad

| Área | Implementación |
| --- | --- |
| JWT | Se eliminó el literal de respaldo. `jwtSecret()` valida presencia y conserva exactamente el secreto; firma y verificación lo comparten. La duración sigue siendo 24 horas. Sin nuevas restricciones sobre claims históricos. |
| Registro | Hash fuera de transacción; negocio, configuración contable y usuario dentro del mismo TransactionClient. Unicidad real de email y slug; hasta tres intentos ante conflicto de slug/P2034. La creación independiente de negocios conserva su wrapper. |
| Después del commit | Fallo al firmar/preparar respuesta: HTTP 201 con `accountCreated: true`, `code: ACCOUNT_CREATED_LOGIN_REQUIRED` y mensaje español. El frontend ofrece login y no vuelve a enviar automáticamente el registro. |
| Respuesta perdida | No se puede determinar desde el navegador si hubo commit. Se muestra resultado no confirmado y se recomienda login antes de reintentar. La unicidad y el rollback impiden negocios huérfanos por email duplicado. |
| Sesión | Se conserva el JWT local histórico. Se reconstruye identidad y se descartan metadatos comerciales sin propietario comprobable. Login/registro usan el mismo establecimiento de sesión. No se cambia a cookies ni se revocan tokens. |
| Cachés | Contexto por usuario/negocio/generación. Limpieza de datos e inflight, versiones por entrada e invalidación de respuestas anteriores. TTL y deduplicación conservados. Incluye historial de consumos, datos de perfil, catálogos y detalles. |
| Cambio de cuenta | Árbol privado se desmonta por contexto; sincronización por storage entre pestañas; respuestas y 401 anteriores no escriben ni cierran la nueva sesión. Peticiones directas de tienda pasan al cliente común y descargas fiscales verifican contexto. |
| Push | Se reinicia la coordinación temporal por sesión y las operaciones comprueban el contexto del dispositivo. Se conservan identificadores/preferencias persistentes ya separados por usuario. |
| Rate limiting | Guard exclusivo de auth, PostgreSQL compartido, HMAC de identificadores, ventanas no prolongadas por rechazos, 429 español y Retry-After. Respaldo local acotado ante fallo del almacenamiento y avisos de degradación/recuperación. |

**Intactos:** hashes/contraseñas existentes, bcrypt y coste 10, validadores de contraseña, normalización histórica, emails, IDs y asociaciones existentes, secreto JWT y duración. Los JWT ficticios firmados con la configuración anterior se aceptan en las pruebas. No se accedió a cuentas reales para comprobarlas.

La limpieza de sesión es local. El logout no revoca JWT en servidor; esa política no forma parte de esta etapa.

## Rate limiting: contrato y activación

`AUTH_RATE_LIMIT_ENABLED` solo habilita con el texto exacto `true`; ausente o `false` permanece deshabilitado. En ese estado no se consulta la tabla, no se resuelve IP en el guard y la limpieza periódica no ejecuta SQL. El cliente Prisma puede generarse antes de aplicar la migración.

| Ruta | Dimensión | Límite |
| --- | --- | --- |
| Login | Email + IP | 10 / 5 minutos |
| Login | Email | 50 / 15 minutos |
| Login | IP | 200 / 15 minutos |
| Registro | Email | 5 / hora |
| Registro | IP | 30 / hora |

Se cuentan solicitudes, exista o no la cuenta. Emails exactos; no se altera su capitalización. Sin email string se aplica el límite IP y después actúa el DTO. Los contadores no contienen email ni IP en claro. La clave HMAC utiliza el secreto existente con separación de propósito, sin rotarlo.

Respuesta 429: `statusCode`, `code: AUTH_RATE_LIMITED`, `message`, `retryAfterSeconds`; cabecera `Retry-After` expuesta por CORS. Los formularios conservan valores y deshabilitan envío durante el plazo.

En PostgreSQL se incrementa mediante INSERT/ON CONFLICT atómico con reloj de la base. Se borran hasta 1.000 entradas vencidas por minuto. El respaldo local tiene capacidad acotada; al saturarse utiliza un contador de desbordamiento conservador. Puede ser más restrictivo y no coordina réplicas. Los límites pueden reiniciarse o variar al entrar/salir del modo degradado: no equivale a protección distribuida intacta.

## Variables a verificar

| Entorno | Variable | Requisito |
| --- | --- | --- |
| Railway | `JWT_SECRET` | El mismo valor existente, en todas las réplicas. Obligatorio; no imprimir, recortar, regenerar ni rotar. |
| Railway | `DATABASE_URL` | Base habitual, compartida entre réplicas. No utilizar para pruebas con escrituras. |
| Railway | `AUTH_RATE_LIMIT_ENABLED` | `false` hasta migración y validación de proxies completadas. |
| Railway | `AUTH_CLIENT_IP_MODE` | Si se habilita: `direct` para conexión real sin proxy, o `trusted-proxy` con rangos verificados. Railway normalmente requiere verificar su proxy; no asumir modo directo. |
| Railway | `AUTH_TRUSTED_PROXIES` | Para `trusted-proxy`: lista separada por comas de IP/CIDR explícitos. No admite `true`, nombres arbitrarios ni saltos numéricos. Confirmar cadena efectiva y bypasses antes de activar. |
| Vercel | `NEXT_PUBLIC_API_URL` | Backend HTTPS del entorno correcto; sin redirigir previews a datos productivos para pruebas. |
| Pruebas locales | `RUN_AUTH_DB_TESTS` | `1` solamente para habilitar la suite PostgreSQL aislada. |
| Pruebas locales | `AUTH_TEST_DATABASE_URL` | Host loopback, nombre de base terminado en `_test`, parámetro `schema=auth_stage1_test`. No hay fallback a DATABASE_URL. |

Si Railway no tiene JWT_SECRET, la versión nueva no arranca. Detener el despliegue y verificar la configuración histórica; no resolverlo generando un secreto. La topología real de proxies no fue comprobada y continúa siendo condición de activación.

## Pruebas realizadas

| Comprobación | Resultado |
| --- | --- |
| Backend: `npx --no-install tsc --noEmit --incremental false -p tsconfig.build.json` | OK |
| Backend: `npx --no-install tsc --noEmit --incremental false -p tsconfig.spec.json` | OK; no sustituye Jest (la configuración heredada excluye archivos spec del proyecto principal). |
| Frontend: `npx --no-install tsc --noEmit --incremental false` | OK |
| Backend: `npm run build` | OK. Ejecuta prisma generate y TypeScript; no aplica migraciones. |
| Frontend: `npm run build` | OK, generación de 26 páginas completada. |
| Backend: `npx --no-install jest --runInBand --no-cache src/auth src/businesses/businesses.service.spec.ts` | 5 suites, 24 pruebas aprobadas. |
| Frontend: `node --test src/lib/auth/session.test.cjs` | 12 pruebas aprobadas. |
| Prisma: `npx --no-install prisma validate` | OK |
| Backend: `npx --no-install jest --config test/jest-e2e.json --runInBand --no-cache auth-concurrency.e2e-spec.ts` | 4 pruebas omitidas intencionalmente: no hay base dedicada configurada. |
| ESLint global, ambos proyectos, sin --fix | No pasa. Hay errores anteriores, entre ellos any, reglas React/formatting y exclusión de specs del servicio de proyectos TypeScript. No se modificaron archivos ajenos para solucionarlos. |
| ESLint dirigido a implementación auth backend y nuevas utilidades frontend | OK; comandos debajo. |
| `git diff --check` | OK |

Un intento intermedio de Jest coincidió con la regeneración de Prisma y falló al leer tipos transitorios. Se repitió después de terminar el build: 24/24 aprobadas. En CI ejecutar build/generate antes de tests, no en paralelo sobre el mismo node_modules.

Lint dirigido backend:

```text
npx --no-install eslint src/auth/auth-rate-limit.guard.ts src/auth/jwt.config.ts src/auth/auth.service.ts src/auth/auth.module.ts src/auth/auth.controller.ts src/users/users.service.ts
```

Lint dirigido frontend:

```text
npx --no-install eslint src/lib/auth/session.ts src/lib/auth/registration.ts src/lib/auth/session.test.cjs src/lib/cache.ts src/components/auth/SessionBoundary.tsx src/hooks/useAuthRetry.ts
```

Se compararon mensajes de archivos modificados con HEAD sin modificar la copia original. No se presenta el lint dirigido como aprobación del lint global; la estrategia JWT y módulos comerciales conservan advertencias/errores anteriores. Los nuevos archivos spec también encuentran la limitación del tsconfig en el lint global.

## Pruebas pendientes y aceptación en staging

Preparar una base PostgreSQL **local desechable** con el esquema Prisma actual, incluida AuthRateLimit, antes de habilitar RUN_AUTH_DB_TESTS. La suite no crea esquema ni aplica migraciones. Inserta catálogo contable ficticio necesario, crea fixtures con sufijo único y limpia sus usuarios/negocios. Los catálogos de prueba y contadores vencidos pueden permanecer en esa base desechable; nunca reutilizarla para datos reales.

La suite pendiente cubre: misma cuenta concurrente (una sola alta), dos emails con mismo slug, rollback después de escrituras contables y límite real compartido entre dos instancias. Las pruebas unitarias con mocks no demuestran estas propiedades de PostgreSQL.

Antes de aprobar staging:

1. Ejecutar la suite PostgreSQL y confirmar los cuatro casos.
2. Recorrido de navegador: sesión histórica -> actualización conserva acceso; A -> logout -> B -> dashboard/ventas/inventario/perfil, sin datos anteriores ni destellos.
3. Dos pestañas y respuestas lentas: resultado viejo y 401 no alteran la sesión nueva; verificar consola y ausencia de actualizaciones obsoletas.
4. Registro con firma fallida tras commit -> aviso de cuenta creada -> login funcional. Corte de red -> mensaje de resultado incierto, sin POST automático.
5. Tabla ausente + limitador deshabilitado -> backend arranca y login/registro funcionan.
6. Tabla presente + limitador activado -> 429, expiración y recuperación; dos procesos con contadores compartidos.
7. Identificar IP mediante conexiones conocidas; falsificar X-Forwarded-For; probar rutas directas y proxies adicionales. No activar si todas las solicitudes se identifican como el proxy o una cabecera controlable.
8. Verificar respuesta y accesibilidad del mensaje 429 en móvil y redes compartidas.

## Despliegue seguro (no ejecutado)

1. Revisar resultados y ejecutar pendientes en desarrollo/staging. No hacer merge a main todavía.
2. Desplegar primero frontend compatible con backend actual y el nuevo resultado ACCOUNT_CREATED_LOGIN_REQUIRED.
3. Confirmar el mismo JWT_SECRET sin exponerlo. Revisar que los comandos automáticos de Railway no apliquen migraciones inadvertidamente.
4. Desplegar backend con AUTH_RATE_LIMIT_ENABLED=false; verificar salud, JWT anterior y login. No requiere tabla nueva.
5. Revisar estado de migraciones y SQL aditivo `20261029120000_auth_rate_limit`. No ejecutar indiscriminadamente todas las migraciones pendientes. Aplicación en producción requiere una operación separada y autorización; no se realizó aquí.
6. Aplicar/verificar tabla en staging, validar proxies y contadores. Configurar rangos explícitos y activar solo allí primero.
7. Tras aprobación operativa, preparar aplicación de la migración productiva y activación gradual por configuración; no mezclar réplicas habilitadas/deshabilitadas como si todas estuvieran protegidas.
8. Observar latencia, 429, errores de alta, avisos de modo degradado y salud. Las alertas de producción deben recoger los logs de degradación; esta tarea no provisiona servicios de monitoreo.

## Rollback

- Problemas del limitador: volver AUTH_RATE_LIMIT_ENABLED=false en todas las réplicas. El código no necesita consultar ni limpiar la tabla al estar deshabilitado.
- Si hace falta, revertir versiones de aplicación manteniendo JWT_SECRET, base y credenciales. No cambiar contraseñas ni borrar cuentas creadas correctamente.
- Conservar la tabla aditiva: el código anterior no la utiliza. No ejecutar down migration destructiva.
- Preferir conservar el frontend compatible. Revertirlo reintroduce riesgo de caché y pierde manejo del resultado post-commit.
- Confirmar que login histórico sigue funcionando después del rollback.

## Riesgos residuales

- Protección distribuida no activa hasta la habilitación; fallback local tiene límites por réplica.
- La política de seis caracteres, discrepancia UI/API y truncamiento bcrypt permanecen por restricción de compatibilidad.
- JWT continúa en localStorage; logout no revoca tokens; recuperación de contraseña sigue ausente.
- Enumeración previa por email duplicado y diferencia temporal de login no se cambiaron.
- Los mensajes push enviados por el servidor y las suscripciones del navegador tienen un ciclo independiente: esta etapa aísla coordinación de sesión, no rediseña revocación/entrega de notificaciones tras logout.
- No se certificaron infraestructura, IP real, tiempos de transacción bajo carga, sesiones reales ni experiencia visual de staging.

## Inventario de archivos

Backend:

- `backend/src/auth/jwt.config.ts`: configuración compartida.
- `backend/src/auth/auth.module.ts`, `jwt.strategy/jwt.strategy.ts`: adopción del secreto obligatorio y duración común.
- `backend/src/auth/auth.controller.ts`, `auth-rate-limit.guard.ts`, `backend/src/main.ts`: limitador, configuración explícita de proxies y Retry-After.
- `backend/src/auth/auth.service.ts`, `backend/src/users/users.service.ts`, `backend/src/businesses/businesses.service.ts`: transacción compartida y resultado post-commit.
- `backend/prisma/schema.prisma` y `backend/prisma/migrations/20261029120000_auth_rate_limit/migration.sql`: tabla independiente.
- `backend/src/auth/auth.service.spec.ts`, `auth-rate-limit.guard.spec.ts`, `jwt-compatibility.spec.ts`, `backend/test/auth-concurrency.e2e-spec.ts`: regresión y suite PostgreSQL opcional.

Frontend:

- `frontend/src/lib/auth/session.ts`, `registration.ts`, `logout.ts`, `frontend/src/lib/auth.ts`, `api.ts`, `cache.ts`: contexto, registro, limpieza, respuestas tardías y cachés.
- `frontend/src/components/auth/SessionBoundary.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`, `frontend/src/hooks/useAuthRetry.ts`: integración de sesión y estados de registro/429.
- `frontend/app/(app)/layout.tsx`, `frontend/app/admin/layout.tsx`, `frontend/app/layout.tsx`: límites de sesión privados y listeners; se conserva render público.
- `frontend/src/components/inventory/ConsumptionHistoryTab.tsx`: caché de historial aislada.
- `frontend/src/hooks/usePushNotifications.ts`: coordinación por sesión.
- `frontend/app/(app)/tienda/page.tsx`, `frontend/src/services/fiscalDocuments.ts`: peticiones directas protegidas contra respuestas anteriores.
- `frontend/src/lib/businessProfile.ts`, `businessLogo.ts`, `frontend/app/(app)/home/page.tsx`, `frontend/src/components/layout/DesktopModulePanel.tsx`: recarga segura de metadatos históricos y actualización del nombre visible.
- `frontend/src/lib/auth/session.test.cjs`: pruebas aisladas sin dependencias nuevas.

Este documento: `docs/AUTH_STAGE1_IMPLEMENTATION.md`.
