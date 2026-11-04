# Etapa 2 — Recuperación y contraseñas

> **Actualización de política (2026-11-03, solicitud del cliente):** la política de contraseñas nuevas vigente es mínimo 8 caracteres con mayúscula, número y símbolo, sin HIBP ni bloqueo de contraseñas comunes. Ver `AUTH_PASSWORD_POLICY_CLIENT_CHANGE.md`. Los pasajes marcados *[Histórico]* describen la decisión anterior (15+ caracteres, lista local y HIBP) y **ya no están vigentes**; se conservan como registro.


## Estado y compatibilidad

La implementación está preparada para revisión y pruebas de staging. No se desplegó, no se hizo merge y no se modificaron credenciales, cuentas ni datos reales. La migración aditiva solo se ejecutó contra PostgreSQL local desechable. La entrega por un servidor SMTP real y los recorridos de navegador/staging siguen pendientes.

El login conserva `bcrypt.compare` para hashes bcrypt históricos, sin rehash automático, normalización ni recorte. También permite contraseñas históricas compuestas por espacios en la pantalla de login. Las contraseñas de altas y restablecimientos nuevos usan Argon2id (19 MiB, dos iteraciones, paralelismo 1). No se alteran identificadores, emails ni asociaciones. La versión de sesión inicial es 0: los JWT anteriores sin el nuevo claim se aceptan como versión 0 mientras el usuario no haya restablecido su contraseña. Un reset incrementa la versión exclusivamente de ese usuario en la misma transacción que actualiza el hash; la estrategia verifica la versión contra PostgreSQL en cada petición autenticada.

No se rota JWT_SECRET. Las solicitudes que ya pasaron el guard antes del reset pueden terminar; el rechazo se aplica al comprobar el token en peticiones posteriores. La validación de JWT ahora depende de una lectura de base por petición y falla si no puede acceder a ella.

## Archivos de esta etapa

- Datos: `backend/prisma/schema.prisma` y `backend/prisma/migrations/20261103000000_password_reset/migration.sql`.
- Backend: `backend/src/auth/auth.controller.ts`, `auth.module.ts`, `auth.service.ts`, `auth-rate-limit.guard.ts`, `jwt.strategy/jwt.strategy.ts`, `dto/register-business.dto.ts`, `dto/forgot-password.dto.ts`, `dto/reset-password.dto.ts`, `password-policy.ts`, `password-rollout.ts`, `password-recovery.service.ts`, `recovery-mail.service.ts`, `recovery-rate-limit.guard.ts`, ~~`common-password-hashes.ts` y `common-passwords-LICENSE.txt`~~ *[Histórico: eliminados]*.
- Pruebas backend: `auth.service.spec.ts`, `jwt-compatibility.spec.ts`, `jwt.strategy/jwt.strategy.spec.ts`, `password-policy.spec.ts`, `recovery-mail.service.spec.ts`, `recovery-rate-limit.guard.spec.ts`, `backend/test/auth-concurrency.e2e-spec.ts`, `password-recovery.e2e-spec.ts`, `proxy-address-security.test.cjs` y `run-auth-stage2-isolated.cjs`.
- Frontend: `frontend/app/(auth)/forgot-password/page.tsx`, `reset-password/page.tsx`, `frontend/src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`, `RecoveryForms.tsx`, `RecoveryForms.test.cjs`, `frontend/src/lib/auth/registration.ts` y `session.test.cjs`.
- Dependencias: `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` y `frontend/package-lock.json`. Este informe: `docs/AUTH_STAGE2_IMPLEMENTATION.md`.

## Activación segura

`AUTH_PASSWORD_POLICY_V2_ENABLED` está **deshabilitado por defecto**. En ese estado el login sigue disponible, mientras registro y recuperación devuelven 503 controlado. Para activar la política nueva se requiere además `AUTH_RATE_LIMIT_ENABLED=true`; esto evita activar recuperación sin el limitador de autenticación y su configuración explícita de proxies. La presencia del flag no demuestra que la IP observada sea correcta: verificar la topología y `X-Forwarded-For` en staging.

La pausa de registro es deliberada para desplegar primero un backend que pueda leer tanto bcrypt como Argon2id en todas las réplicas. Mientras haya réplicas antiguas conviviendo, no activar la política nueva: una réplica anterior no puede verificar hashes Argon2id ni aplicar la revocación por versión. La migración debe existir antes de arrancar el backend nuevo, incluso con el flag deshabilitado; sin la columna nueva, las consultas de usuario y el login fallarán.

## Política y endpoints

- *[Histórico, reemplazado]* Nuevas contraseñas: entre 15 y 1024 puntos de código, hasta 4096 bytes UTF-8. Se aceptan espacios, símbolos y Unicode sin reglas obligatorias de composición. El backend es autoritativo. El frontend muestra los requisitos y permite gestores de contraseñas.
- *[Histórico, eliminado]* Una lista local contiene hashes de las 205 entradas de al menos 15 caracteres del listado público `Pwdb_top-100000` de SecLists, revisión `68bcd12457978649d41ae4f56e3b5d2db2b72560`; su licencia se incluye junto al código. Es una lista parcial de contraseñas comunes, no un inventario completo de filtraciones.
- *[Histórico, eliminado]* Se consulta [Pwned Passwords](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange) únicamente al enviar una contraseña nueva: se envían los primeros cinco caracteres del SHA-1 con `Add-Padding: true`, nunca la contraseña ni el hash completo. El proveedor ve la IP del servidor y el prefijo. La respuesta se compara localmente; un error o respuesta inválida bloquea la operación con 503, sin fallar abierto. El registro distingue ese 503 de una respuesta perdida posterior a un posible commit.
- `POST /auth/forgot-password`, cuerpo `{ "email": "..." }`: devuelve la misma respuesta genérica para cuentas existentes e inexistentes. Si la funcionalidad o el correo no están configurados responde 503 para ambos casos.
- `POST /auth/reset-password`, cuerpo `{ "token": "...", "password": "..." }`: devuelve confirmación sin iniciar sesión. Un enlace inválido, vencido o consumido devuelve un error genérico y permite solicitar otro.
- El token es de 32 bytes aleatorios, representado en base64url; se guarda solo su SHA-256. Por defecto vence en 30 minutos. Una solicitud nueva invalida enlaces anteriores del usuario; el consumo, la contraseña, la versión de sesión y la invalidación de los demás enlaces se confirman en una transacción con bloqueo de usuario. Un mismo token solo puede consumirse una vez, incluso bajo concurrencia.
- Los enlaces usan el fragmento `#token=...`, que no se envía al servidor web al abrir la página; el formulario lo retira de la barra y lo mantiene en memoria. Si se recarga esa página, debe volver a abrirse el enlace original del correo.
- El límite de recuperación es 30 solicitudes por IP y 5 por email o token por 15 minutos. Los identificadores se almacenan como HMAC en la tabla aditiva `AuthRateLimit`; si falla ese almacenamiento, existe un respaldo local acotado por proceso. En modo degradado no hay cuota global entre réplicas. La limpieza de contadores vencidos es acotada y oportunista.

La política de longitud y la comprobación de contraseñas filtradas siguen las recomendaciones de [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html); Argon2id evita el límite de 72 bytes de bcrypt para contraseñas nuevas, de acuerdo con [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Correo y configuración

No se necesitan credenciales para las pruebas: `MAIL_PROVIDER=test` solo se admite con `NODE_ENV=test` y usa transporte JSON sin entrega. Para staging/producción, configurar en el backend, sin escribir valores reales en el repositorio:

| Variable | Uso |
|---|---|
| `JWT_SECRET` | Mantener exactamente el secreto existente; no rotar. |
| `DATABASE_URL` | Base del entorno correspondiente, después de verificar migraciones. |
| `AUTH_PASSWORD_POLICY_V2_ENABLED` | `false` durante la transición; `true` solo cuando todas las réplicas compatibles estén listas. |
| `AUTH_RATE_LIMIT_ENABLED` | Debe ser `true` para habilitar registro y recuperación v2. |
| `AUTH_CLIENT_IP_MODE`, `AUTH_TRUSTED_PROXIES` | Configuración explícita, probada con la topología real; no confiar en `/0`. |
| `MAIL_PROVIDER` | `smtp` para envío real; `test` solo en pruebas. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Credenciales y servidor del proveedor transaccional elegido. Puerto 465 usa TLS implícito; otros puertos exigen STARTTLS. |
| `MAIL_FROM` | Remitente autorizado por el proveedor. |
| `FRONTEND_PUBLIC_URL` | Origen confiable HTTPS del frontend del entorno, sin credenciales, query ni fragmento. HTTP solo se permite para localhost fuera de producción. |
| `PASSWORD_RESET_TTL_MINUTES` | Opcional; entero de 1 a 1440, por defecto 30. |
| `NEXT_PUBLIC_API_URL` | URL HTTPS del backend correcto en Vercel; nunca incluir JWT_SECRET. |

Configurar un proveedor SMTP y dominio remitente verificados, luego probar entrega y notificación en staging con buzones ficticios autorizados. El envío inicial se procesa en el mismo proceso después de devolver la respuesta genérica; no existe una cola persistente. Si el proceso se detiene o el proveedor falla, el correo puede perderse y se registra un error sin dirección ni enlace. La notificación posterior al cambio también se intenta una vez: un fallo se registra sin revertir una contraseña ya cambiada. Se requiere definir monitoreo y una estrategia de reintento antes de producción.

Las suscripciones push del usuario permanecen activas tras un reset; no forman parte de la revocación JWT. Esto preserva su funcionamiento, pero un dispositivo anterior puede seguir recibiendo notificaciones. Definir y probar una política de revocación de dispositivos push antes de producción.

## Migración y validación

`backend/prisma/migrations/20261103000000_password_reset/migration.sql` agrega `User.sessionVersion` con valor 0 y la tabla `PasswordResetToken` con hash único, fechas, relación e índices. No modifica hashes ni elimina registros existentes. En PostgreSQL desechable se aplicó el SQL sobre un esquema anterior simulado con una cuenta bcrypt ficticia; después del cambio, el hash seguía verificando y la versión era 0. No se validó el historial completo de migraciones de staging.

Pruebas ejecutadas: 44 unitarias backend de auth/negocios; 11 de integración PostgreSQL con correo y HIBP simulados (*[Histórico]*; luego 18 sin HIBP); sin omitidas; 20 pruebas frontend de formularios/sesiones; y una prueba específica de confianza de IP. La integración verifica ADMIN y BUSINESS, tokens inválidos/vencidos/usados, dos resets concurrentes, revocación específica, notificaciones push conservadas y límites compartidos entre dos guards. No reemplaza pruebas con procesos separados, proxies reales ni un navegador real.

El build frontend pasó. El build backend en el workspace falló al regenerar el motor Prisma porque otro proceso de Windows mantenía abierto el archivo; no se interrumpió ese proceso. El mismo build pasó en una copia temporal aislada con el código actual y `proxy-addr` 2.0.8. ESLint dirigido se ejecutó sobre archivos nuevos; los formularios previos conservan errores/warnings anteriores. Prisma advierte de la futura eliminación de su configuración en package.json.

`npm audit --omit=dev` mostró originalmente 1 crítico, 13 altos y 3 moderados, las mismas cantidades que HEAD antes de esta etapa. El crítico [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) afectaba a `proxy-addr` 2.0.7 y podía permitir suplantación de IP con ciertas subredes IPv6 confiables; se actualizó únicamente esa dependencia transitiva a 2.0.8 y pasó una prueba dirigida. El audit posterior muestra 0 críticos, 13 altos y 3 moderados. Su aplicabilidad y remediación siguen pendientes; no se ejecutó `npm audit fix` ni se cambiaron otras funciones.

El mismo audit de dependencias de producción del frontend informa 2 críticos, 5 altos y 2 moderados, con los mismos conteos al evaluar el lockfile de HEAD. Los paquetes con hallazgos críticos incluyen `next` y `jspdf`; no se evaluó todavía la aplicabilidad de cada advisory ni se actualizaron esos paquetes fuera del alcance de autenticación. La revisión y remediación o aceptación informada de estos avisos es necesaria antes de producción.

## Despliegue y rollback propuestos — no ejecutados

1. Revisar el diff y el lockfile; resolver o aceptar explícitamente los avisos de seguridad pendientes. Probar en staging SMTP real, recuperación en navegador, correo de aviso, sesiones existentes, push, IPs compartidas y proxies con dos procesos separados.
2. En staging autorizado, verificar y aplicar las migraciones pendientes en orden. Antes de cualquier producción, disponer de respaldo y autorización específica; no ejecutar migraciones desde este trabajo. La tabla de rate limiting de Etapa 1 y esta migración deben estar presentes antes del backend nuevo.
3. Desplegar primero todas las réplicas del backend compatible con `AUTH_PASSWORD_POLICY_V2_ENABLED=false`. Confirmar que no queda tráfico dirigido a binarios anteriores y que ADMIN/BUSINESS con bcrypt y JWT históricos siguen accediendo. Registro estará temporalmente pausado.
4. Configurar y probar correo, origen HTTPS y proxies. Activar el limitador existente y después el flag v2 en las réplicas compatibles; desplegar el frontend nuevo y validar registro y recuperación. No habilitar v2 si no se puede garantizar que el tráfico ya no llega a réplicas antiguas.
5. Ante problemas, poner el flag v2 en `false` en todas las réplicas: pausa registro y recuperación, pero el backend compatible sigue verificando bcrypt, Argon2id y versiones de sesión. Resolver mediante una versión compatible o roll-forward, manteniendo JWT_SECRET, cuentas y esquema aditivo.

**No volver al backend anterior a Etapa 2 después de emitir hashes Argon2id o completar resets:** ese código no verifica Argon2id y tampoco respeta la revocación por versión. No existe un rollback seguro a ese binario sin preparar antes un backend puente que conserve ambas capacidades. No borrar la tabla ni revertir la columna de forma destructiva.
