# Etapa 2: correo de recuperación por SMTP (Brevo Free)

Estado: **configuración preparada y verificada sin credenciales; envío real NO probado** (no hay credenciales ni remitente verificado). Sin despliegue, migraciones ni merge.

## Auditoría del servicio existente (sin reescritura)
- `RecoveryMailService`: Nodemailer; en 587 usa `secure:false` + `requireTLS:true` (STARTTLS obligatorio) y deja la verificación de certificados por defecto; timeouts de 10 s. Solo texto plano (recuperación y aviso de cambio). El enlace usa `FRONTEND_PUBLIC_URL` (https; http solo localhost fuera de producción) en el fragmento `#token=`.
- Cuotas, enfriamiento, reserva de avisos, ADMIN excluido, respuesta genérica y expiración: sin cambios.
- Los errores de configuración siguen devolviendo 503 (no se simula éxito). Un fallo de envío no cambia la respuesta genérica de `forgot-password`.
- Único cambio de código: los logs de fallo SMTP ahora incluyen solo un código corto (`EAUTH`, `ETIMEDOUT`, `ECONNECTION`…; `mailErrorCode`), nunca mensaje, destinatario, token ni enlace. Pruebas añadidas (TLS 587 y código seguro).

## Variables (Railway / `.env`; ver `backend/.env.example`)
| Variable | Valor |
|---|---|
| `MAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | login SMTP de Brevo (Brevo → SMTP & API → SMTP; no el correo de la cuenta) |
| `SMTP_PASSWORD` | **clave SMTP** generada ahí (no una API key `xkeysib-…`) |
| `MAIL_FROM` | remitente verificado en Brevo (Senders & IP; idealmente dominio con SPF/DKIM/DMARC) |
| `FRONTEND_PUBLIC_URL` | URL pública https del frontend del entorno probado |
| `AUTH_RATE_LIMIT_ENABLED`, `AUTH_PASSWORD_POLICY_V2_ENABLED` | `true` |
| `RECOVERY_MAIL_DAILY_LIMIT` / `RECOVERY_MAIL_NOTICE_RESERVE` / `RECOVERY_COOLDOWN_MINUTES` | opcionales (80 / 20 / 3); fijar el límite por debajo de la cuota real del plan (confirmar la de Brevo Free en la cuenta). |

No poner credenciales en el repo ni en chat. Railway: cargarlas como variables del servicio y **redeplegar** para que el plan Pro habilite SMTP saliente.

## Verificación realizada
- Conexión controlada sin autenticación a `smtp-relay.brevo.com:587` desde la red de desarrollo: TCP, banner 220, EHLO, STARTTLS ofrecido, actualización TLS 1.3 con certificado válido (`authorized=true`). No se autenticó ni se envió nada. (La red de Railway debe verificarse aparte.)
- Unitarias backend de auth: 52/52; integración PostgreSQL aislada: 18/18 (correo simulado con `jsonTransport`); `tsc` y ESLint de los archivos tocados sin errores.

## Pendiente cuando haya credenciales autorizadas (distinguir tres niveles)
1. **Conexión + autenticación SMTP** (sin enviar): `transport.verify()` con las variables reales. Un `EAUTH` indica login/clave incorrectos o clave que no es SMTP.
2. **Aceptado por Brevo**: contador `mail-accepted-v1:<día>` y panel de Brevo (Transactional → Logs). No equivale a entrega.
3. **Recibido en el buzón**: confirmar a mano en un buzón propio (revisar spam).

Flujo con cuentas ficticias y buzones propios (no cuentas comerciales): solicitud → recepción → dominio del enlace → reset → reutilización rechazada → login nuevo → JWT anterior revocado → aviso de cambio → push deshabilitado y reautorización por dispositivo.

## Condiciones para staging
Credenciales y remitente verificado; cuota real de Brevo confirmada; correo recibido en buzón; recuperación completa en navegador; `SHOW timezone`; proxies/`X-Forwarded-For`; migraciones aplicadas con respaldo y autorización. **La Etapa 2 no es apta para producción** hasta validar navegador, migraciones y proxies.
