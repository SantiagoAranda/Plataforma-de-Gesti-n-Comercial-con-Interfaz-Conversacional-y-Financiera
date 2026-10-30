# Verificación independiente de Etapa 1 — 30 de octubre de 2026

## Actualización: integración con PostgreSQL aislado

El 30 de octubre de 2026 se ejecutó `backend/test/auth-concurrency.e2e-spec.ts` contra PostgreSQL 16 en un contenedor Docker nuevo y desechable. Resultado: **5 pruebas ejecutadas, 5 aprobadas, 0 fallidas y 0 omitidas**. Jest informó 14,463 segundos para la suite; la preparación y ejecución tomaron 23,0 segundos antes de la limpieza, sin incluir la descarga previa de la imagen.

| Caso | Resultado | Tiempo |
|---|---|---:|
| Registro concurrente con el mismo email: un usuario, un negocio y mappings completos | PASS | 647 ms |
| Registros concurrentes con el mismo nombre y slugs distintos | PASS | 297 ms |
| Rollback por fallo al crear el usuario después de escribir mappings | PASS | 186 ms |
| Rollback por fallo durante inicialización contable después de la primera escritura | PASS | 66 ms |
| Rate limiting compartido entre dos instancias del guard: 10 aceptadas y 10 con 429 | PASS | 47 ms |

Antes de escribir se comprobó que Docker utilizaba el motor Linux local, que el nombre del contenedor no existía y que el contenedor recién creado tenía la etiqueta de prueba, imagen `postgres:16`, puerto `127.0.0.1:55432`, almacenamiento `tmpfs`, usuario `auth_stage1`, base `auth_stage1_test` y cero tablas de aplicación. El esquema Prisma se preparó exclusivamente allí con `db push --skip-generate`, usando una URL local construida para esta ejecución; la variable `DATABASE_URL` se sustituyó solo dentro del proceso temporal. No se modificó `.env` ni se conectó Railway o la base habitual. Se usaron únicamente fixtures ficticios.

La primera tentativa se interrumpió antes de crear un contenedor porque PowerShell trató el aviso de imagen no disponible localmente como error. Se comprobó que no había quedado contenedor, se descargó la imagen y se repitió el procedimiento. Tras la suite, el contenedor de esta ejecución se detuvo y eliminó con `--rm`; una comprobación independiente confirmó que el nombre y el puerto de prueba quedaron libres. La imagen descargada permanece en la caché de Docker.

Alcance: los registros se lanzaron en paralelo, pero la prueba no fuerza mediante una barrera que ambos intentos choquen exactamente en el índice de slug. Los dos guards comparten PostgreSQL en un mismo proceso; no se probaron dos procesos HTTP ni los proxies reales. `db push` acredita el esquema usado por estas pruebas, no el recorrido de la migración ni su historial. Siguen pendientes el navegador, staging con varias instancias/proxies y la validación operativa de la migración. No se desplegó, aplicó una migración productiva ni hizo merge.

Las secciones posteriores conservan las comprobaciones históricas; toda referencia a cinco pruebas PostgreSQL omitidas describe la ejecución anterior y queda reemplazada por este resultado.

## Actualización: cierre técnico de proxies y proyectos de pruebas

Se rechazó cualquier prefijo CIDR numérico cero en modo de proxy confiable con el limitador habilitado, con el error explícito `AUTH_TRUSTED_PROXIES must not include CIDR /0`. La validación cubre variantes con ceros iniciales y listas mixtas; no hay respaldo permisivo. Los modos deshabilitado y directo conservan su comportamiento anterior. En particular, deshabilitado no inspecciona la solicitud ni consulta o limpia la tabla del limitador.

Se modificó `tsconfig.spec.json` para incluir pruebas y se configuró ESLint para usar ese proyecto en archivos de pruebas. No se cambió ninguna regla global. Los cuatro tests nuevos se tiparon con mocks explícitos para cumplir las reglas existentes.

**Corrección de evidencia anterior:** la configuración temporal mencionada más abajo no incluía los tests de `src/auth`, porque el patrón absoluto con barras invertidas no los seleccionaba. Por lo tanto, su PASS no acreditaba esos tests. En esta ejecución, el proyecto permanente corregido se verificó con `--listFilesOnly`: cada uno de `auth-rate-limit.guard.spec.ts`, `auth.service.spec.ts`, `jwt-compatibility.spec.ts` y `auth-concurrency.e2e-spec.ts` aparece exactamente una vez. El proyecto `tsconfig.build.json` incluye cero archivos de pruebas; tampoco se encontraron artefactos de pruebas compilados en `dist`.

Resultados reales de esta actualización:

- Builds backend y frontend: PASS. TypeScript backend de build, backend de tests y frontend: PASS.
- Jest backend de autenticación y negocios: 5 suites y 31 pruebas PASS. Los logs de fallo de firma y degradación del limitador provienen de fallos ficticios inyectados.
- Frontend: 13 pruebas de sesión y caché PASS.
- ESLint dirigido sin `--fix`: guard y cuatro archivos de tests nuevos PASS sin warnings; archivos relacionados de frontend PASS.
- Suite PostgreSQL: 5 pruebas SKIPPED con `RUN_AUTH_DB_TESTS=0`; no se conectó una base ni se ejecutaron escrituras. Browser, proxy y varias instancias de staging siguen pendientes.
- El lint global backend sigue pendiente de una ejecución completa; la ejecución previa superó diez minutos. El lint global frontend presentaba errores preexistentes. No se alteró código ajeno para resolverlos.

Archivos cambiados en este cierre: `backend/src/auth/auth-rate-limit.guard.ts`, `backend/src/auth/auth-rate-limit.guard.spec.ts`, `backend/src/auth/auth.service.spec.ts`, `backend/src/auth/jwt-compatibility.spec.ts`, `backend/test/auth-concurrency.e2e-spec.ts`, `backend/tsconfig.spec.json`, `backend/eslint.config.mjs` y este informe. No se modificaron contraseñas, hashes, secretos, cuentas o datos; no se ejecutaron migraciones, despliegues ni merge.

Las secciones siguientes conservan la evidencia histórica de la revisión inicial; sus hallazgos sobre `/0` y sobre la configuración de pruebas quedan superados por esta actualización. La etapa aún requiere las pruebas SQL y el recorrido de navegador/staging antes de aprobar producción.

## Revisión inicial (sin cambios de aplicación)

Se leyó AUTH_STAGE1_IMPLEMENTATION.md y se contrastó con git status, diff, diff --cached, archivos nuevos, migración y tests. Hay 25 archivos rastreados modificados y 13 nuevos iniciales; el índice está vacío. Los cambios de Etapa 1 todavía no están en un commit. No se descartaron cambios existentes.

JWT centralizado, bcrypt sin cambios, transacción compartida, resultado post-commit, separación de caché, listener storage, limitador opt-in y respaldo local están presentes en el código. Esto no acredita ejecución real en PostgreSQL ni comportamiento visual del navegador.

## Diferencias y límites detectados antes de ampliar pruebas

1. `backend/test/auth-concurrency.e2e-spec.ts`: el caso de rollback existente inyecta fallo en createBusinessUser, después de la configuración contable. No prueba un fallo dentro de esa inicialización. Cambio mínimo previsto: añadir un caso que haga fallar la segunda comprobación contable, tras la primera escritura, y verificar ausencia de negocio, usuario y mappings.
2. El test de registro concurrente solo exige más de cero mappings. Cambio mínimo previsto: exigir la cantidad completa de la plantilla.
3. El test frontend de storage simula el evento en un único contexto JavaScript. No es una prueba real con dos pestañas ni de ausencia de destellos visuales. Se debe mantener explícita esa limitación.
4. La respuesta ACCOUNT_CREATED_LOGIN_REQUIRED cubre firma/construcción del objeto de respuesta después del commit. No puede garantizar entregar HTTP 201 si la conexión ya se perdió; el frontend conserva correctamente un estado de resultado incierto.
5. `authProxyTrust` permite CIDR `/0`: una configuración así volvería a confiar en cualquier origen de cabeceras. No se observó una configuración efectiva de ese tipo. Propuesta mínima pendiente: rechazar `0.0.0.0/0` y `::/0`; mientras tanto, prohibirlos operativamente y verificar rangos reales en staging.
6. `backend/tsconfig.spec.json` hereda las exclusiones de `tsconfig.json` (`test`, `**/*.spec.ts`, `**/*.test.ts`). Por eso ejecutar únicamente tsc con ese proyecto no acredita los archivos de prueba. Es una configuración preexistente; se comprobarán los tests de auth con una configuración temporal que quite esas exclusiones, sin modificar los tsconfig del repositorio. La corrección mínima futura es definir exclusiones apropiadas en el proyecto de tests y su integración ESLint.

No se modificará lógica de aplicación en esta continuación. Las ampliaciones se limitan a tests y documentación.

## Infraestructura observada

- AUTH_TEST_DATABASE_URL ausente; RUN_AUTH_DB_TESTS no habilitado.
- Sin listeners observados en 5432, 5433 ni 55432; no se encontró servicio PostgreSQL local ni psql/pg_isready en PATH.
- Docker CLI instalado; motor Docker Desktop Linux inaccesible y servicio com.docker.service detenido. No se inició ni provisionó Docker.
- Sin Playwright/Cypress configurados en el repositorio ni instalación local de Playwright/navegadores en las ubicaciones revisadas.
- No se abrió conexión con DATABASE_URL habitual ni se inició la aplicación contra su base. Los comandos Prisma de generación/validación cargan `.env`, pero no conectan para estas operaciones. No se ejecutaron escrituras contra PostgreSQL.

La ausencia de un proceso local no prueba que no exista una base remota de testing; no hay identificación suficiente para utilizar una con seguridad.

## Funcionalidades contrastadas contra código

| Función | Evidencia | Alcance comprobado |
|---|---|---|
| Secreto y duración JWT | `backend/src/auth/jwt.config.ts:3`, `auth.module.ts:23`, `jwt.strategy/jwt.strategy.ts:19` | Firma y estrategia usan el mismo helper; secreto obligatorio sin trim del valor y duración 24h. No se incorporan claims obligatorios. |
| Login compatible | `backend/src/auth/auth.service.ts:119`, `backend/src/users/users.service.ts:10` | bcrypt.compare sin normalización ni escrituras; rol ADMIN/BUSINESS y relación existente conservados. |
| Registro atómico | `backend/src/auth/auth.service.ts:32`, `:68`; `backend/src/businesses/businesses.service.ts:425`, `:456` | Hash coste 10 antes de transacción; negocio, mappings y usuario usan TransactionClient; retries limitados a slug/P2034. Atomicidad SQL pendiente de integración. |
| Resultado post-commit | `backend/src/auth/auth.service.ts:55`, `frontend/src/lib/auth/registration.ts:27` | Cuenta creada sin token devuelve estado especial; frontend ofrece login; pérdida de respuesta queda incierta y no reintenta POST. Tests de servicio/cliente; falta recorrido HTTP/UI. |
| Sesión histórica | `frontend/src/lib/auth/session.ts:41` | Conserva accessToken, deriva identidad de claims y descarta metadatos sin propietario comprobable. Decodificación local solo particiona estado; autorización sigue en backend. |
| Cachés y tardíos | `frontend/src/lib/cache.ts:15`, `frontend/src/lib/api.ts:57` | Claves por identidad/generación, versión por entrada, deduplicación y TTL. Assert de contexto antes de procesar 401. |
| Perfil y árbol privado | `frontend/src/lib/businessLogo.ts:33`, `frontend/src/components/auth/SessionBoundary.tsx:5` | Escritura de perfil con identidad comprobada; remount de árbol privado al cambiar generación. Los Maps de venta revisados son locales a componentes. |
| Pestañas e historial | `frontend/src/lib/auth/session.ts:145`, `frontend/src/components/inventory/ConsumptionHistoryTab.tsx:55` | Listener storage, historial usa caché común. Dos contextos simulados verificados; navegador real pendiente. |
| Peticiones directas y push | `frontend/src/services/fiscalDocuments.ts`, `frontend/src/hooks/usePushNotifications.ts:71`, `:818` | Descarga comprueba contexto tras respuesta; coordinación push se reinicia y un finally antiguo no elimina promesa nueva. Ciclo de suscripción real pendiente en navegador. |
| Limitador opt-in | `backend/src/auth/auth-rate-limit.guard.ts:88`, `:186` | Con flag distinto de true omite contexto, IP, queries y limpieza. El constructor sigue exigiendo JWT_SECRET como todo el backend. |
| Fallback y límites | `backend/src/auth/auth-rate-limit.guard.ts:72`, `:136` | Map local acotado, ventanas fijas, HMAC y aviso de degradación/recuperación; 429 con Retry-After. Distribución real pendiente. |
| Migración | `backend/prisma/migrations/20261029120000_auth_rate_limit/migration.sql:2` | Solo crea AuthRateLimit e índice. No altera User/Business. Preparada y no aplicada. |

## Pruebas y resultados de esta ejecución

Comandos ejecutados dentro del proyecto correspondiente, sin instalaciones y sin ESLint --fix:

| Comprobación | Resultado |
|---|---|
| Backend `npm run build` (Prisma generate + tsc) | PASS |
| Backend `npx --no-install tsc --noEmit --incremental false -p tsconfig.build.json` | PASS |
| Backend tsc con tsconfig.spec.json | PASS, pero excluye tests; no usar como evidencia de éstos |
| Backend tsc con configuración temporal en TEMP | PASS para los archivos efectivamente incluidos; se comprobó posteriormente que no incluía los tests de `src/auth`. Ver actualización inicial para el resultado corregido. |
| Frontend `npm run build` | PASS, 26 páginas generadas |
| Frontend `npx --no-install tsc --noEmit --incremental false` | PASS |
| Backend `npx --no-install jest --runInBand --no-cache src/auth src/businesses/businesses.service.spec.ts` | PASS: 5 suites, 24 tests |
| Frontend `node --test src/lib/auth/session.test.cjs` | PASS: 13 tests |
| Backend `npx --no-install prisma validate` | PASS; aviso de deprecación de package.json#prisma para Prisma 7, no fallo |
| Integración `npx --no-install jest --config test/jest-e2e.json --runInBand --no-cache auth-concurrency.e2e-spec.ts` | 5 SKIPPED; 0 ejecutados contra PostgreSQL |
| ESLint dirigido backend | PASS: auth-rate-limit.guard.ts, jwt.config.ts, auth.service.ts, auth.module.ts, auth.controller.ts, users.service.ts |
| ESLint dirigido frontend | PASS: session.ts, registration.ts, session.test.cjs, cache.ts, SessionBoundary.tsx, useAuthRetry.ts |
| git diff --check | PASS; avisos de conversión CRLF de Git, sin errores de whitespace |
| Comprobación local de authProxyTrust con configuración ficticia /0 | Acepta esos rangos; riesgo de configuración confirmado, no prueba de exposición en Railway |

Los logs de error de firma JWT y fallback durante Jest son fallos inyectados esperados. No significan errores del servidor real. No se ejecutó la suite unitaria global ajena a autenticación/negocios.

### Lint global y comparación con HEAD

Se ejecutó ESLint por API con fix:false sobre `src/**/*.ts` y `test/**/*.ts` del backend y `.` del frontend. La ejecución global frontend terminó; la global backend no terminó dentro de diez minutos y se detuvo el proceso propio de verificación, después de un intento anterior también interrumpido. Se completó por separado la revisión incremental de los 13 archivos TypeScript nuevos/modificados del backend. Se comparó el contenido de HEAD mediante lintText bajo la configuración actual. No se hizo checkout ni se descartó código. Es una comparación de contenido con las dependencias actuales, no una certificación de un build antiguo independiente.

- Frontend: 173 errores, 205 warnings; contenido HEAD: 173 errores, 206 warnings. Los tres mensajes de set-state-in-effect en tienda tienen líneas distintas, pero los mismos efectos ya están en HEAD; se verificaron directamente. No se detectaron nuevos errores por esta etapa en esa comparación.
- Backend, revisión incremental: 0 errores en auth.controller/module/service, users.service, main, jwt.config y auth-rate-limit.guard. jwt.strategy mantiene 1 error require-await, BusinessesService mantiene 28 errores y 1 warning, main mantiene 1 warning; las cantidades coinciden con HEAD. Los 4 tests nuevos presentan 1 error de parser cada uno por no pertenecer al proyecto TypeScript de ESLint. Esos cuatro errores son nuevos en el listado por los nuevos archivos, aunque la causa de configuración ya existía; **no se atribuyen todos los fallos a deuda preexistente**.
- El reporte global anterior tenía 2064 errores/267 warnings. Sustituir los resultados de los archivos nuevos/modificados por su revisión actual produce un resumen incremental de 1958 errores/267 warnings. Esa cifra es una reconstrucción a partir del reporte anterior, **no un resultado de una ejecución global nueva completada**. La comprobación global backend fresca sigue pendiente; no se repite indefinidamente ni se cambian reglas ajenas para hacerla pasar.

Los informes JSON disponibles de esta ejecución se guardan en TEMP como `auth-stage1-verify-backend-incremental.json` y `auth-stage1-verify-frontend-lint.json`. No se generó un reporte global backend completo nuevo. No se corrigieron archivos ajenos por deuda de lint. La configuración temporal de comprobación de tests queda en TEMP como `auth-stage1-test-types.json`.

## Compatibilidad: evidencia y límites

No hay cambios de DTOs, hashes almacenados, contraseñas, emails, IDs, coste bcrypt ni algoritmo. Se conserva bcrypt.compare, incluidos espacios significativos, Unicode y su comportamiento histórico sobre más de 72 bytes. No se escribió ninguna cuenta real. Los tests usan fixtures ficticios; los hashes se generan en los tests con bcrypt, no se extrajeron hashes de producción. Las pruebas JWT reproducen claims y firma históricos, prueban secreto con espacios y rechazan tokens vencidos o firmados con otra clave.

Esto aporta evidencia de compatibilidad de código y formato; no afirma que se haya iniciado sesión con cuentas reales antiguas. La verificación real de ADMIN/BUSINESS y JWT emitidos por la versión previa debe hacerse en staging con fixtures creados por esa versión. Si Railway no tiene JWT_SECRET, el nuevo backend no arranca. No generar, rotar ni sustituir un secreto para eludir ese fallo: revisar configuración y detener ese despliegue.

## Validaciones pendientes y casos manuales

1. Los cinco casos se ejecutaron en PostgreSQL aislado como se describe en la actualización inicial. Los tests paralelos no obligan al scheduler a producir una colisión; complementar con ejecuciones controladas bajo carga en staging. Los retries específicos sí se ejercitan con mocks.
2. Navegador: con datos ficticios distinguibles A/B, cargar dashboard, ventas, inventario, historial y perfil en A. Dejar solicitudes de esos módulos pendientes; logout, login B y resolver las solicitudes anteriores. No debe aparecer texto, filas, totales, metadatos ni descargas de A, ni siquiera brevemente. Confirmar también al volver atrás y al reabrir módulos.
3. Repetir con dos pestañas: A en ambas, cambio a B desde una, pestaña restante inicialmente en segundo plano. Probar logout solo, logout+login rápido, regreso al primer plano y un 401 tardío. B debe seguir autenticado; verificar DOM, navegación y caché, no solo almacenamiento. La nueva prueba de dos contextos VM no monta React ni simula la planificación real de eventos del navegador.
4. Abrir la versión nueva con un JWT válido de la versión anterior: conservar token y acceso, recargar perfil; confirmar roles y asociaciones sin cambios. Repetir con JWT vencido y firma incorrecta.
5. Registro: éxito; fallo de firma posterior a commit; fallo de almacenamiento del navegador; pérdida de conexión antes/después de recibir respuesta. Verificar aviso correcto, email temporal hacia login, ausencia de contraseña persistida y de reintentos automáticos.
6. HTTP real con tabla ausente y limitador deshabilitado: arranque, login, registro y scheduler no dependen de AuthRateLimit. Después crear tabla en staging autorizado y probar límites, vencimiento, fallo/recuperación de almacenamiento y dos procesos reales.
7. Proxies de staging: clientes conocidos, IP compartida, X-Forwarded-For manipulado y posible ruta directa. Comprobar que IP no sea siempre la del proxy ni un valor controlable por el cliente. Prohibir rangos /0. No activar hasta verificar topología.
8. Móvil: 429 conserva campos y muestra plazo comprensible, habilita reintento; estados de cuenta creada/incierta ofrecen login. Revisar teclado, foco, accesibilidad y rendimiento del dashboard.

## Cambios realizados exclusivamente en esta continuación

- `backend/test/auth-concurrency.e2e-spec.ts`: comprobación del número completo de mappings y nuevo fallo contable tras primera escritura; las cuatro pruebas anteriores se conservan.
- `frontend/src/lib/auth/session.test.cjs`: harness con almacenamiento compartible y nuevo caso de dos contextos aislados más 401 tardío. No incorpora dependencias.
- `docs/AUTH_STAGE1_VERIFICATION.md`: este informe.
- `docs/AUTH_STAGE1_TEST_ENVIRONMENT.md`: preparación y ejecución aisladas, no ejecutadas aquí.
- `docs/AUTH_STAGE1_IMPLEMENTATION.md`: enlace a la verificación actual y aclaración de cantidades nuevas; conserva el registro de la ejecución anterior.

## Riesgos y operaciones de staging/producción

La implementación principal está presente y sus comprobaciones locales de aplicación e integración PostgreSQL pasan. **Etapa 1 todavía no está completamente validada; no es apta para aprobar producción con esta evidencia sola.** Se recomienda avanzar a una validación controlada de staging; no se hizo deploy ni merge.

- Railway: comprobar presencia y continuidad exacta de JWT_SECRET; DATABASE_URL del entorno correcto; `AUTH_RATE_LIMIT_ENABLED=false` hasta verificar tabla y proxies. Al activar: `AUTH_CLIENT_IP_MODE=direct` solo para conexiones realmente directas, o `trusted-proxy` con `AUTH_TRUSTED_PROXIES` explícitos y comprobados. No asumir número de saltos. Revisar que release/start commands no apliquen migraciones inesperadas.
- Vercel: comprobar NEXT_PUBLIC_API_URL del backend correspondiente. No exponer JWT_SECRET en ninguna variable pública. Publicar primero frontend compatible cuando exista autorización de despliegue; comprobar continuidad de localStorage y mensajes de registro antes de backend.
- El limitador deshabilitado no brinda protección contra abuso. El fallback habilitado es por proceso; al fallar PostgreSQL no garantiza cuota global, y no rescata una autenticación cuyo propio acceso a BD también esté caído. Monitorizar degradación, latencia, 429 y falsos positivos por redes compartidas.
- Persisten por alcance: JWT en localStorage, sin revocación al logout, reglas antiguas de contraseña/bcrypt, enumeración por email duplicado y ciclo independiente de push. No se implementó Etapa 2.

Antes de producción: verificar migración aditiva e historial pendiente en staging, completar recorridos de navegador y doble instancia/proxy, completar lint global backend en CI con recursos/tiempo adecuados, acordar tratamiento de lint preexistente, revisar resultados y obtener aprobación separada de despliegue/migración. La activación del limitador debe ser uniforme entre réplicas y posterior a la tabla verificada.

Rollback operativo propuesto: deshabilitar limitador en todas las réplicas, mantener secreto/contraseñas/datos y tabla aditiva; revertir versiones solo si hace falta. Conservar preferentemente frontend corregido: volver al anterior puede reintroducir la fuga de caché y perder el estado de cuenta creada. No ejecutar una reversión destructiva de la tabla. Nada de esto se ejecutó en esta revisión.
