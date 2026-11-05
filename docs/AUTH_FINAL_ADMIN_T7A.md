# Autenticación: `/admin`, T7.a y estado final de las Etapas 1 y 2

Sin despliegue, merge, migraciones ni cambios de esquema, política de contraseñas, JWT, SMTP o contratos HTTP.

## Causas raíz y correcciones
| Problema | Causa | Corrección |
|---|---|---|
| `/admin` accesible a anónimos y BUSINESS | `app/admin/layout.tsx` solo usaba `SessionBoundary`, sin comprobar token ni rol; las pantallas se montaban y pedían datos (el backend respondía 403). | `SessionBoundary` acepta `require` (`"auth"` o `"ADMIN"`): no monta hijos (ni peticiones) y redirige con `router.replace`: sin token → `/login` (sin aviso de expiración); BUSINESS → `/home` conservando la sesión. |
| T7.a: pestaña en `/login` no reacciona | `session.ts` ya sincroniza por el evento `storage`, pero `/login` no tenía suscriptor que navegara. | `LoginSessionSync` (en `app/(auth)/login/page.tsx`) navega a `homePath(sesión)` cuando aparece una sesión distinta a la vista al montar. Sin BroadcastChannel ni polling. |
| Aviso falso "Tu sesión ha finalizado" | `app/(app)/layout.tsx` llamaba `handleSessionExpired()` ante cualquier ausencia de token (logout en otra pestaña, o entrada anónima) y montaba hijos un instante. | `(app)` usa `require="auth"`: no monta y redirige a `/login` sin aviso. El aviso real queda solo para un 401 autenticado (`api.ts`). |

Archivos: `frontend/src/components/auth/SessionBoundary.tsx`, `LoginSessionSync.tsx` (nuevo), `frontend/src/lib/auth/session.ts` (`homePath`, usado también por `LoginForm.tsx`), `frontend/app/admin/layout.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/(auth)/login/page.tsx`. Tests: `SessionBoundary.test.cjs` (nuevo), `backend/src/businesses/businesses.controller.spec.ts` (ampliado).

## Auditoría sin cambios necesarios
- **Backend `/admin`:** `GET businesses/admin/active|inactive|:id`, `PATCH :id/inactivate|activate` y `admin/:id/factus` usan `JwtAuthGuard + RolesGuard + @Roles('ADMIN')`; nómina global (`config/global`) ADMIN-only. Probado: ADMIN 200, BUSINESS 403, anónimo 401, sin llamar al servicio. `RolesGuard` distingue el rol global ADMIN; los demás roles/permisos no se tocaron.
- `ProductsController` y `UsersController` no tienen guard, pero `ProductsModule` no está en `AppModule` (stub sin datos) y `UsersController` está vacío. Recomendación: eliminarlos o protegerlos si se activan.
- **Aislamiento entre cuentas (Etapa 1, ya probado):** respuestas atrasadas descartadas por `assertCurrentSession`, cachés con clave por sesión, perfil de negocio en `localStorage` ligado al propietario, propietario push con marca monotónica (IndexedDB) y fail-closed.
- **Web Push:** sin cambios. El logout conserva la baja antes de limpiar la sesión; `lifecycle.test.cjs` cubre rotación, autorización tras reset y propietario.

## Pruebas
- Frontend: 71/71 (`SessionBoundary` 7 nuevas, formularios, `session`, `lifecycle`), `tsc` y `next build` correctos. ESLint: 0 errores en los archivos nuevos/tocados; `LoginForm.tsx` conserva 5 errores previos.
- Backend: 753 aprobadas, 2 fallidas ajenas (`accounting.service.spec`, `tax/manual-verification.spec`); integración PostgreSQL desechable 18/18 (reset, revocación JWT/push, bcrypt/Argon2id, rate limit, aislamiento).
- Escenarios cubiertos automáticamente: ADMIN en `/admin`; BUSINESS → `/home` con sesión intacta y sin montar contenido; anónimo → `/login` sin aviso; logout remoto; A→B con remonte; `/login` que recibe sesión (BUSINESS y ADMIN) sin navegar al montar ni duplicar; respuesta tardía de A y 401 tardío (`session.test.cjs`).

## No verificado (requiere navegador real)
Chrome no estaba conectado: parpadeos, bucles de redirección, consola, dos pestañas reales y `/admin` visual quedan **pendientes**. JSDOM no replica el evento `storage` entre pestañas reales (se simula con `dispatchEvent`).

## Riesgos pendientes
- En el login de la misma pestaña, `LoginSessionSync` y `router.push` apuntan al mismo destino (doble navegación idempotente).
- Dos pestañas con sesión A abiertas y login de B en una: la otra remonta bajo B (diseño de Etapa 1); formularios de A no se conservan.
- `app/(app)/home/layout.tsx` conserva su redirección redundante.

## Estado de las Etapas
- **Etapa 1:** implementada y probada (registro transaccional, bcrypt/Argon2id, rate limit, aislamiento, push).
- **Etapa 2:** recuperación, `sessionVersion`, revocación push por dispositivo y política de 8 caracteres implementadas y probadas con correo simulado. **No apta para producción**: faltan SMTP/Brevo real y dominio verificado, validación en navegador, migraciones en staging (`20261029120000`, `20261103000000`, `20261104000000`), proxies/`X-Forwarded-For`, `SHOW timezone`, y decisiones sobre recuperación de ADMIN, Prisma 7 y `sharp`.

## Recomendaciones para staging
Aplicar migraciones con respaldo; probar dos pestañas reales (login/logout/A→B, `/admin` con ADMIN y BUSINESS); cargar variables de correo en Railway (pendiente de acceso) y validar envío hasta el buzón; revisar la consola y notificaciones push entre cuentas.
