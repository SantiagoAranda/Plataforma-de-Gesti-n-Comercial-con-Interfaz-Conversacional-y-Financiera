# Etapa 1 — Validación funcional en navegador (30 de octubre de 2026)

Sin cambios en código de aplicación, migraciones productivas, despliegue ni merge. **No aprueba producción por sí sola** (ver "No ejecutadas").

## Entorno aislado

- Chrome instalado, visible (`headless: false`), controlado con `playwright-core` (instalado fuera del repo; sin cambios en `package.json` ni lockfiles), contexto/perfil temporal por prueba.
- PostgreSQL 16 desechable en Docker (`auth-browser-pg-test`, `127.0.0.1:55433`, tmpfs, 0 tablas al inicio), esquema por `db push` y seed (PUC y ADMIN ficticio). Eliminado al terminar.
- Backend compilado (`dist`) en `:3101`; frontend en modo dev en `:3100` desde una copia fuera del repo, con `NEXT_PUBLIC_API_URL=http://127.0.0.1:3101`.
- Servicios externos: el backend se lanzó con un entorno construido desde cero y valores ficticios para `DATABASE_URL`, `JWT_SECRET` (descartable, no el real), R2, Factus, VAPID y OCR. dotenv no pisa variables ya definidas; un chequeo previo simulaba la carga de `backend/.env` y abortaba ante cualquier filtración. Al final, las únicas conexiones TCP establecidas del backend eran a `127.0.0.1:55433` (una instantánea, no monitoreo continuo).
- Datos: `ZZ-A-Negocio` y `ZZ-B-Negocio` con producto, insumo y venta marcados `ZZ-A-…`/`ZZ-B-…`.
- Evidencia (fuera del repo, JWT enmascarados, sin contraseñas): logs `t04_api`, `t567`, `t123_8`, `t9`, `t10` y capturas en el directorio temporal de la sesión.

## Resultados

**UI** = ejecutado en Chrome sobre la interfaz. **API** = solo HTTP; no cuenta como prueba visual.

### Aprobadas

| Req. | Prueba | Tipo | Ref. |
|---|---|---|---|
| 3 | Login ADMIN → `/admin`, rol ADMIN, lista A y B | UI | T1.admin* |
| 3 | Login BUSINESS → `/home`; clave incorrecta: sigue en `/login`, "Credenciales incorrectas", sin token | UI | T1.business, T1.bad |
| 4 | Registro: éxito (1 POST, sesión y negocio visibles), email duplicado ("Este email ya se encuentra registrado"), validaciones de clave | UI | T2.* |
| 5 | JWT con formato anterior (sub, role, businessId; HS256; 24 h) firmado con el secreto de prueba: válido conserva acceso y muestra el negocio real aun con metadato ajeno previo; vencido y firma incorrecta → `/login`. `alg=none` → 401 | UI; `alg=none` solo API | T3.*, t04_api |
| 6 | Con token de B: GET/PATCH/cancel/kardex sobre IDs de A → 404; listados sin `ZZ-A`; sin token 401; BUSINESS en endpoints admin 401/403; dato de A intacto | API (21/21) | t04_api |
| 6/7 | A→logout→B: DOM de home/venta/inventario/insumos/perfil sin `ZZ-A`; storage de B sin metadatos de A; observador DOM (25 ms + mutaciones) sin destellos; botón Atrás sin A | UI | T5.1–6 |
| 8 | 33 solicitudes de A retenidas al cerrar sesión; liberadas como 200 tardío y como 401 tardío: B sigue autenticado y sin datos de A | UI | T6.* |
| 9 | Dos pestañas, mismo perfil: sin `ZZ-A` ni destellos en logout solo, logout+login rápido y cambio A→B; token de B compartido | UI | T7.0, a2, a3, b, c, d |
| 10 | Cuenta creada sin token y corte de red (respuesta simulada en red): mensaje correcto, sin sesión, 1 POST, enlace a login con email precargado. Almacenamiento bloqueado (backend real): mensaje de cuenta creada, sin sesión, 1 POST. Contraseña no persistida | UI | T8.* |
| 11 | Limitador deshabilitado y tabla `AuthRateLimit` eliminada: login y registro por UI funcionan; 75 s después (ciclo de limpieza) sin errores; log "storage is not accessed" | UI | t9 |
| 12 | Tabla creada con `20261029120000_auth_rate_limit/migration.sql` (columnas e índices coinciden con `schema.prisma`), `AUTH_RATE_LIMIT_ENABLED=true`, `AUTH_CLIENT_IP_MODE=direct`. Mismo email/IP: 10×401 y 11.º 429 (política 10/5 min); `Retry-After: 297` = `retryAfterSeconds`; mensaje con plazo; formulario conserva valores y deshabilita envío; contadores hasheados; registro: 5 procesados y 6.º 429 (5/h) | UI | t10 (6/6) |
| 12 | Vencimiento: con `expiresAt` forzado al pasado en la BD desechable, el login correcto vuelve a funcionar | UI | T10.expiry |

### Fallidas

| Prueba | Resultado |
|---|---|
| T7.a: tras logout+login de B en pestaña 1, la pestaña 2 (sin recargar) debía quedar autenticada como B | Terminó en `/login` sin datos de A. **Causa no investigada**: no verifiqué si el token de B ya estaba en storage ni si es intencional (el logout previo de la pestaña 2 la envía a `/login`). Sin fuga de datos observada. Requiere decisión: ¿esperado o defecto de sincronización? |

### No ejecutadas

- Proxies reales, `X-Forwarded-For` falsificado, ruta directa, IPs distintas con el mismo email (solo loopback).
- Dos procesos backend tras proxy con contadores compartidos.
- Recorrido de migraciones sobre el historial de staging (se aplicó solo el SQL aislado).
- Móvil real, teclado, foco, accesibilidad; pestaña realmente en segundo plano (se usó `bringToFront`, sin throttling real).
- Fallo real de firma tras commit (no forzable sin tocar código; solo la reacción del frontend con respuesta simulada).
- Reloj controlado real: el vencimiento se probó adelantando `expiresAt` en PostgreSQL; no se esperó el plazo de 5 min ni se manipuló el reloj.
- Descarga fiscal, push, subida de logo/imágenes (R2/Factus/VAPID inertes a propósito).
- Build de producción del frontend aislado: falló por el junction de `node_modules` de mi copia; se usó modo dev.

## Hallazgos y observaciones (sin corregir; requieren autorización)

1. **T7.a** (arriba): pestaña 2 queda en `/login` tras el cambio de cuenta desde pestaña 1; causa sin determinar.
2. **BUSINESS en `/admin`**: la URL no redirige. Solo comprobé que no apareció el listado de negocios (la API responde 401/403); la prueba no distingue entre redirección y pantalla vacía.
3. El backend escucha en `0.0.0.0` (`main.ts:40`).
4. En modo dev el portal de Next cubre el botón de logout; solo dev, se usó click por DOM.
5. **Contacto fuera del entorno aislado** (declaración): mi primer `curl` de comprobación (`admin@test.com`/`x`, ficticio) llegó al backend de desarrollo del usuario en `:3001` (401, sin escritura), y cargué con GET `http://127.0.0.1:3000/login` en Chrome para comparar render. Ambos sin escritura ni credenciales reales. Luego todo pasó a `:3101/:3100`.

## Limpieza

Backend y frontend aislados detenidos; contenedor `auth-browser-pg-test` eliminado; copia temporal del frontend eliminada; `git status` sin cambios (40 entradas, igual que al inicio) salvo este documento. No se tocaron `GestionMVP` ni otras bases.
