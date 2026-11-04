# Etapa 2: correcciones posteriores a la auditoría

> **Actualización de política (2026-11-03, solicitud del cliente):** la política de contraseñas nuevas vigente es mínimo 8 caracteres con mayúscula, número y símbolo, sin HIBP ni bloqueo de contraseñas comunes. Ver `AUTH_PASSWORD_POLICY_CLIENT_CHANGE.md`. Los pasajes marcados *[Histórico]* describen la decisión anterior (15+ caracteres, lista local y HIBP) y **ya no están vigentes**; se conservan como registro.


Complementa `AUTH_STAGE2_IMPLEMENTATION.md`. No se desplegó, no se hizo merge, no se ejecutaron migraciones productivas ni se usaron credenciales o datos reales. La Etapa 2 **no** es apta para producción hasta validar correo real, recuperación en navegador y migraciones en staging.

## Cambios

### Push: revocación y reautorización por dispositivo
- El reset deshabilita **todas** las suscripciones push del usuario afectado, en la misma transacción (con el usuario bloqueado `FOR UPDATE`). No toca a otros usuarios ni negocios.
- Migración aditiva `20261104000000_push_device_authorization`: `PushSubscription.authorizedSessionVersion INTEGER NOT NULL DEFAULT 0`.
- Regla de registro, con `v = User.sessionVersion`: se permite si `v = 0` (nunca hubo reset; cuentas existentes sin cambios), o si la fila `(userId, deviceId)` ya tiene `authorizedSessionVersion = v`, o si se presenta una prueba de autorización válida para ese usuario, negocio, dispositivo y `v`. Si no, `403 PUSH_AUTHORIZATION_REQUIRED` sin tocar filas. Un `deviceId` o `endpoint` nuevo no elude la regla.
- `POST /notifications/push/authorize { deviceId, password }`: exige sesión vigente y la contraseña actual (bcrypt histórico o Argon2id), con límite de intentos por usuario (5/10 min) e IP (20/10 min) en PostgreSQL. Devuelve una prueba sin estado de 5 minutos (HMAC-SHA256 con clave derivada de `JWT_SECRET` y la etiqueta `push-authorization-v1`; el secreto no se rota). Un error de contraseña responde 403, nunca 401, para no cerrar la sesión.
- `register` y `authorize` leen `sessionVersion` con `FOR SHARE`, que se serializa con el `FOR UPDATE` del reset. `authorize` verifica la contraseña contra la versión leída antes y rechaza si el reset se confirmó entremedio.
- Frontend: con `requiresAuthorization` la reconciliación no registra nada y quita la intención local; la tarjeta de notificaciones pide la contraseña y reactiva solo ese dispositivo (el permiso del navegador se conserva).
- **Límite conocido:** quien obtenga las credenciales nuevas puede autorizar su propio dispositivo. La protección cubre dispositivos anteriores y reactivaciones automáticas, no un compromiso nuevo de la cuenta. La prueba es reutilizable durante sus 5 minutos, solo para ese dispositivo y esa sesión; si se quiere un solo uso, habría que persistirla.

### ADMIN
La recuperación por correo no emite token ni correo para cuentas ADMIN, y `reset()` rechaza tokens de ADMIN con el error genérico. La respuesta de `forgot-password` no cambia. El login de ADMIN no cambia. **Procedimiento manual pendiente de diseño** para recuperar un ADMIN.

### Abuso de correo
- Las claves del rate limit de recuperación se normalizan (NFKC, `trim`, minúsculas) solo para el contador; el email almacenado no se toca.
- En una sola transacción bajo el bloqueo del usuario se comprueban: enfriamiento (`RECOVERY_COOLDOWN_MINUTES`, 2-5, por defecto 3), tope de 3 enlaces vivos, cuota global y creación del token. N solicitudes concurrentes producen un token y una unidad de cuota.
- Una solicitud nueva **ya no invalida** los enlaces vigentes (cambio respecto a la versión anterior). Cada token es de un solo uso y un reset exitoso invalida todos los del usuario.
- `reset()` comprueba el token en la base **antes** de validar la contraseña nueva. *[Histórico: también era antes de consultar HIBP, fail-closed con 503; HIBP fue eliminado.]* Un rechazo por política no consume el token. Residual: el tiempo de respuesta difiere entre un token válido y uno inválido.

### Contabilidad de la cuota de correo
Contadores diarios (día UTC, reloj de PostgreSQL) en `AuthRateLimit`, compartidos entre instancias:

| Contador | Significado | Se usa para decidir |
|---|---|---|
| `mail-reserved-v1:<día>` | Unidades reservadas: una por token emitido (en la misma transacción) y una por aviso de cambio, justo antes de enviarlo | Sí |
| `mail-accepted-v1:<día>` | Envíos que el proveedor aceptó | No (diagnóstico) |
| `mail-failed-v1:<día>` | Envíos con error o timeout | No (diagnóstico) |

- Los correos de recuperación solo pueden usar hasta `RECOVERY_MAIL_DAILY_LIMIT − RECOVERY_MAIL_NOTICE_RESERVE`; los avisos de seguridad pueden usar hasta el límite. Por defecto 80 y 20; ambos se configuran por variable de entorno y se validan al arrancar si la política v2 está habilitada. Ajustar el límite por debajo de la cuota real del plan gratuito (confirmar la de Brevo Free en staging).
- Las fallas **no devuelven cupo**: un timeout puede haber entregado el mensaje. Se cumple `reservado ≥ aceptado + fallido`; la diferencia son envíos en curso o procesos reiniciados antes de registrar el resultado.
- Si PostgreSQL falla al reservar, no se envía (fail-closed). Si se agota el cupo, no se emite el token; un aviso sin cupo se omite y se registra, y el reset no se revierte.

### Datos y compatibilidad
- Zona horaria: las comparaciones y escrituras SQL de vencimiento/consumo de `PasswordResetToken` usan `CURRENT_TIMESTAMP AT TIME ZONE 'UTC'` (las columnas son `timestamp(3)` sin zona y Prisma escribe UTC). La integración se ejecuta contra una base configurada en `America/Bogota`. Verificar `SHOW timezone` en staging.
- Emails con distinta capitalización: la búsqueda sigue siendo exacta (login y recuperación). No se implementó búsqueda insensible. `backend/scripts/check-email-case-collisions.ts` (solo lectura, enmascara direcciones) cuenta colisiones; **debe ejecutarse en staging con autorización antes de decidir**. No se fusiona ni modifica ninguna cuenta.
- Límites de tamaño: `@MaxLength(2048)` en la contraseña de registro (el máximo nuevo es 1024 puntos de código) y en el reset. **El login no tiene límite**: antes no lo tenía (solo `@IsString`) y cualquier tope podría rechazar una contraseña histórica válida. Riesgo residual: cuerpos de hasta 10 MB, acotados por el rate limit; bcrypt solo usa 72 bytes.
- Limpieza acotada: con probabilidad 1/200 por token emitido se borran hasta 500 tokens vencidos hace más de 1 día.
- Las guards identifican la acción por metadata (`@AuthAction`) y no por el nombre del método.

### SMTP
Sin cambios de transporte: Nodemailer con `MAIL_PROVIDER=smtp`, compatible con Brevo Free por SMTP (puerto 587/STARTTLS). El cliente confirmó Railway Pro, que admite SMTP saliente; si el plan se actualizó recientemente, verificar que se haya **redeplegado** para habilitarlo. En staging probar conectividad, TLS, autenticación y entrega real con buzones autorizados. Sin cola persistente (no hay evidencia de necesidad); los fallos quedan en `mail-failed-v1`.

Variables nuevas (todas opcionales): `RECOVERY_COOLDOWN_MINUTES`, `RECOVERY_MAIL_DAILY_LIMIT`, `RECOVERY_MAIL_NOTICE_RESERVE`.

## Dependencias
| | Antes | Después |
|---|---|---|
| Backend `npm audit --omit=dev` | 0 críticos, 13 altos, 3 moderados | 0 críticos, 8 altos, 0 moderados |
| Frontend | 2 críticos, 5 altos, 2 moderados | 0 vulnerabilidades |

Actualizado (mismo major, sin `npm audit fix`): backend `@nestjs/common|core|platform-express|testing` 11.2.8 y `@nestjs/config` 4.0.4 más transitivas (`body-parser`, `qs`, `lodash`, `path-to-regexp`, `file-type`); frontend `next` 16.4.4 y `eslint-config-next` 16.4.4 (versiones exactas, como antes), `jspdf` 4.2.1, `dompurify`, `fflate`, `source-map-js`. `jspdf` solo se usa con `doc.save` y `jspdf-autotable`.

Pendiente en el backend (8 altos):
- `prisma` / `@prisma/config` / `effect` / `deepmerge-ts` / `defu`: solo se corrige con Prisma 7 (major). Son herramientas de CLI/generación; **decisión pendiente** (cambia el cliente y las migraciones).
- `sharp` 0.34.5: la corrección es 0.35.x (major); aplica si se procesan imágenes subidas por usuarios. **Decisión pendiente**, con prueba de imágenes reales.
- `multer` 2.4.0 (DoS por un archivo asíncrono pendiente, corregido en 2.5.0): lo fija `@nestjs/platform-express` 11.2.8. Esperar una versión de Nest que lo incluya; aplica a las rutas autenticadas de subida de archivos.

## Pruebas
- Backend unitarias: 741 aprobadas, 2 fallidas ajenas a esta etapa (`accounting.service.spec`, `tax/manual-verification.spec`; archivos sin modificar, ya fallaban antes).
- Integración en PostgreSQL 16 desechable (contenedor nuevo, loopback, tmpfs, base en `America/Bogota`): **18/18 aprobadas, 0 omitidas**, incluida la migración `push_device_authorization` sobre un esquema anterior. Cobertura: reset y push (A/B/C), prueba por dispositivo, carreras reset/register/authorize, dos pestañas, ADMIN, token antes de la política (*[Histórico: HIBP]*), zona horaria, purga, cooldown/cuota/avisos con dos instancias, límites compartidos, DTOs y compatibilidad bcrypt. Una mutación manual (quitar `AT TIME ZONE 'UTC'`) hizo fallar 2 pruebas, lo que confirma que detectan el problema.
- Frontend: 35/35 (`lifecycle`, `session`, `RecoveryForms`), `tsc` y `next build` correctos. Las pruebas del hook son estáticas (no hay un entorno de navegador): el recorrido real queda para staging.
- ESLint: archivos nuevos del backend sin errores. En `usePushNotifications.ts` (línea previa, `setState` dentro de un efecto) la nueva `eslint-config-next` 16.4.4 marca 2 errores de una regla más estricta sobre código anterior; no se modificó.

## Condiciones antes de staging
1. Aplicar en orden `20261029120000_auth_rate_limit`, `20261103000000_password_reset` y `20261104000000_push_device_authorization` antes de arrancar el backend nuevo (con respaldo y autorización). Desplegar todas las réplicas con `AUTH_PASSWORD_POLICY_V2_ENABLED=false`.
2. SMTP real, TLS, autenticación y correo de recuperación y de aviso con buzones autorizados; confirmar límites del plan gratuito y ajustar `RECOVERY_MAIL_DAILY_LIMIT`.
3. Recuperación completa en navegador: enlace, reset, login, tarjeta de notificaciones y reactivación por dispositivo con contraseña.
4. `SHOW timezone` de la base, topología de IP/proxies (`X-Forwarded-For`) y dos instancias reales.
5. Ejecutar el script de colisiones de email (solo lectura).
6. Decidir el procedimiento manual de recuperación de ADMIN, Prisma 7 y `sharp` 0.35.
