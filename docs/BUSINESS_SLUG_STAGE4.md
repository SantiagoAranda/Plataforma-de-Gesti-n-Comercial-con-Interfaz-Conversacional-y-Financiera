# Etapa 4: cambio único de identificador y redirecciones permanentes

Implementación local del 6 de noviembre de 2026. Requiere las migraciones de Etapa 2
(`20261106120000_business_slug_registry`) y Etapa 4 (`20261107120000_business_slug_change`).
**La base principal de desarrollo no fue migrada.** No se conectó a Railway.

## Datos

- `Business.slugChangedAt DateTime?`: nulo para negocios existentes y nuevos; se fija con el único cambio.
- Migración aditiva: `ALTER TABLE "Business" ADD COLUMN "slugChangedAt" TIMESTAMP(3)`.
- `BusinessSlug` no cambia: el identificador anterior queda reservado para el mismo `businessId`
  (PK + FK `RESTRICT`). No hay eliminación ni reasignación.

## Backend

`PATCH /businesses/profile/slug` con `{ "slug": "nuevo" }` (JwtAuthGuard + BusinessActiveGuard).

- `businessId` sale del JWT; el ValidationPipe rechaza campos extra como `businessId` (400).
- El usuario debe pertenecer al negocio (403). Negocio inexistente 404, inactivo 403.
- Formato y palabras reservadas: `validateCustomBusinessSlug` de Etapa 2 (400 con el motivo).
- Disponibilidad contra todo `BusinessSlug`, sin distinguir mayúsculas.
- Transacción: verifica estado y cambio no usado → disponibilidad →
  `updateMany({ where: { id, slugChangedAt: null } })` con `count === 1` → crea la reserva.
  El `updateMany` bloquea la fila: un segundo cambio simultáneo del mismo negocio obtiene `count 0`.
  Dos negocios que piden el mismo slug chocan en la PK de `BusinessSlug` o en `Business_slug_key`.
  `retryBusinessSlugTransaction` traduce P2002 a 409 y reintenta P2034.
- 409 `BUSINESS_SLUG_TAKEN` («El identificador dejó de estar disponible. Elegí otro.») o
  `BUSINESS_SLUG_CHANGE_USED` («Ya utilizaste el cambio de dirección de tu tienda.»).
  Volver al slug original también es 409.
- 200 devuelve el perfil. Todas las respuestas de perfil, incluidas las de logo, usan
  `BUSINESS_PROFILE_SELECT` con `slugChangedAt`.

### Resolución pública

`PublicService.resolveActiveBusinessId` es el único resolvedor para todas las rutas `/public/:slug/*`:
catálogo, disponibilidad, calendario, reservas, búsqueda por teléfono, pedidos, configuración
fiscal, municipios y vista previa tributaria. Busca `Business.slug` o un alias de `BusinessSlug`,
exacto y después con la normalización heredada, siempre con `status: 'ACTIVE'` del propietario.
Un alias de un negocio inactivo no resuelve. Los pedidos y reservas abiertos con el enlace anterior
quedan asociados al mismo `businessId`.

`GET /public/:slug/resolve` devuelve `{ slug, name, logoUrl }` canónicos o 404 (`no-store`).

## Frontend

- `app/tienda/[slug]/page.tsx`: si el slug solicitado no es el vigente, `permanentRedirect`
  (308 en el servidor) a `/tienda/<vigente>`, conservando todos los parámetros de consulta.
  La ruta es relativa y se construye con el slug del servidor: un solo salto y sin dominios externos.
  404 si no existe o el negocio está inactivo. Si el backend no responde, se renderiza como antes.
  Metadatos: nombre, logo y `canonical` absoluto con el slug vigente (host de la solicitud).
- `/perfil`, sección «Dirección de tu tienda pública» (`StoreSlugEditor`): URL actual, «Cambiar
  dirección» solo si `slugChangedAt` es nulo, campo con disponibilidad (reutiliza `BusinessSlugField`
  en modo `editOnly`, con debounce y descarte de respuestas tardías), confirmación explícita con el
  texto requerido, «Cancelar» sin solicitud. Un error conserva URL, almacenamiento y la opción de cambio.
- Sincronización: `updateBusinessSlug` → `syncBusinessProfile` (verifica la sesión vigente y escribe
  `localStorage.businessSlug` solo tras el 200) e invalida la caché `business-profile` de Venta.
  Home, Tienda y Perfil vuelven a leer el perfil al montar; el login devuelve `Business.slug` vigente.
  El enlace de producto compartido usa el slug de la ruta, que ya es el canónico tras el 308.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| PostgreSQL aislado (runner): business-slugs + business-name | 15 aprobadas (5 nuevas de Etapa 4) |
| `prisma migrate deploy` de las 87 migraciones en base vacía nueva | Aplicadas; `migrate diff` contra schema.prisma vacío |
| Jest backend completo | 831 aprobadas; 2 fallos en accounting/tax ajenos a esta etapa (no comparados con HEAD) |
| HTTP controlador: JWT, `businessId` del cliente rechazado, 401, tipo | Aprobado |
| Node frontend (9 archivos) | 100 aprobadas |
| TypeScript backend/frontend, build backend y Next.js | Aprobados |

El runner (`backend/scripts/test-business-slugs-local.ps1`) ahora también excluye `slugChangedAt`
del esquema previo, ejecuta el SQL real de Etapa 4 tras la de Etapa 2, comprueba que ningún negocio
existente tenga `slugChangedAt`, repite la auditoría del backfill y prueba la cadena completa en
`sactec_slug_chain_test` dentro del mismo contenedor desechable.

No hubo verificación visual en navegador: la extensión no estaba disponible.

## Integración posterior en la base principal local (no ejecutado)

1. Confirmar `DATABASE_URL` (host, puerto, base) y hacer un respaldo con `pg_dump`.
2. `npx prisma migrate status` para listar las migraciones pendientes; deben ser solo las esperadas.
3. Auditoría previa: `BUSINESS_SLUG_AUDIT_URL=<url> npx ts-node scripts/audit-business-slugs.ts --snapshot antes.json`.
4. Con el backend detenido: `npx prisma migrate deploy` (aplica Etapa 2 y Etapa 4 en orden).
   No usar `db push`, `migrate reset` ni `migrate dev`.
5. `--verify --snapshot antes.json` y comprobar que `slugChangedAt` sea nulo en todos los negocios.
6. Iniciar el backend actualizado.

Esto no acredita preparación productiva: no se inspeccionó la configuración de Railway. Para el
despliegue aplica el procedimiento de Etapa 2, con `migrate deploy` aplicando ambas migraciones.
