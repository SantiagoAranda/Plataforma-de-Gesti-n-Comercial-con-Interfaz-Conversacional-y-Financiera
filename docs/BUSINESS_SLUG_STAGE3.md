# Etapa 3: dirección pública durante el registro

Implementación local del 6 de noviembre de 2026. No agrega edición posterior,
redirecciones, cambios de esquema ni migraciones. Requiere la migración de Etapa 2
antes de habilitar este backend contra una base determinada.

## Contratos y flujo

- `POST /auth/register-business` mantiene los campos anteriores. `slug` es opcional:
  ausente conserva generación automática; presente debe ser una cadena válida exacta.
  `null`, vacío, mayúsculas, espacios, formato incorrecto y palabras reservadas dan 400.
  La validación DTO reutiliza `validateCustomBusinessSlug` de Etapa 2; no transforma
  el valor personalizado. El ValidationPipe existente rechaza campos adicionales.
- `GET /auth/business-slug-availability?slug=tecnogames-sf` devuelve
  `{ "mode": "custom", "slug": "tecnogames-sf", "available": true }`.
- `GET /auth/business-slug-availability?name=TecnoGames` devuelve la sugerencia del
  generador existente, incluyendo sufijo si corresponde, con `mode: "automatic"`.
  Se exige exactamente uno de los dos parámetros. La consulta de nombre acepta
  hasta 200 caracteres; esto no cambia el contrato anterior de registro.
- Las consultas no crean negocios ni reservan identificadores; solo proyectan slug
  y disponibilidad. Consideran reservas históricas e inactivas y comparan sin
  distinguir mayúsculas. Respuesta `Cache-Control: no-store`.
- El guard existente limita las consultas a 60/minuto/IP, con ámbito independiente
  de login/registro y el mismo almacenamiento distribuido y fallback local acotado.
  Este nuevo ámbito permanece activo aun con el flag de registro deshabilitado.
  La limpieza periódica también se activa al utilizarlo. Con el flag deshabilitado
  se conserva el modo IP directo del proyecto; detrás de proxy se debe configurar
  correctamente la política existente al habilitar el registro.
- Negocio, reserva, configuración inicial y usuario permanecen en la misma
  transacción. Automático conserva sus cinco intentos. Personalizado conserva el
  valor exacto: reserva ocupada o carrera P2002 da 409 con código
  `BUSINESS_SLUG_TAKEN`. P2034 reintenta la transacción sin sustituir ese valor.
  El correo duplicado conserva su manejo independiente.
- El formulario usa automático por defecto, vista previa del servidor, debounce
  de 400 ms, AbortController y descarte de respuestas antiguas. Los resultados se
  vinculan al modo/valor/intento vigente. Un error de red nunca muestra disponible;
  se ofrece reintentar y se permite registrar con formato local válido.
  Solo personalizado envía `slug`; un 409 conserva todos los campos y muestra el
  conflicto junto al identificador. Durante el envío se bloquea la nueva sección.

## Archivos

Backend:

- `src/auth/auth-action.decorator.ts`, `auth-rate-limit.guard.ts`,
  `auth.controller.ts`, `auth.service.ts`.
- `src/auth/dto/register-business.dto.ts`, nuevo `business-slug.dto.ts`.
- `src/businesses/businesses.service.ts`, `src/common/utils/business-slug.ts`.
- Pruebas: `src/auth/auth-rate-limit.guard.spec.ts`, nuevos
  `business-slug-registration.spec.ts` y `business-slug-http.spec.ts`;
  `test/business-slugs.e2e-spec.ts`.

Frontend:

- `src/components/auth/RegisterForm.tsx`, nuevo `BusinessSlugField.tsx`.
- `src/lib/auth/registration.ts`, `src/components/auth/RecoveryForms.test.cjs`.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Jest: business-slug, auth-rate-limit, auth.service, businesses, business-profile | 128 aprobadas, 9 suites |
| PostgreSQL: business-slugs y business-name | 10 aprobadas, 2 suites |
| Node: RecoveryForms, auth/session, businessProfile | 63 aprobadas |
| TypeScript backend y frontend, sin emitir | Aprobado |
| Compilación backend con tsconfig.build a directorio temporal | Aprobada |
| Build Next.js | Aprobado, 29 páginas estáticas |
| Prisma validate | Aprobado; advertencia preexistente sobre package.json#prisma |
| git diff --check | Sin errores |

Las pruebas cubren DTO/HTTP, validación estricta, privacidad de respuesta, rate
limit, sugerencia, registro antiguo, personalizado, nombre repetido, colisión
forzada, 409, rollback tras fallo del usuario, reservas históricas en mayúsculas,
conservación del backfill, Restrict, activación/desactivación, login, consulta del
catálogo público por slug y persistencia del nombre comercial de Etapa 1.
Frontend cubre estados de consulta, reintento, error de red, formato exacto,
respuestas tardías, cambio de modo, payload y conservación ante conflicto.

Un primer fallo de integración provenía del conteo de fixtures por nombre:
la nueva prueba agregaba legítimamente un tercer negocio con ese nombre. Se
acotó el conteo a los slugs de la carrera automática. Los mocks del guard con flag
deshabilitado se adaptaron para proporcionar el handler de Nest, ahora necesario
para distinguir el ámbito público. Las ejecuciones finales pasaron.

## Base utilizada y límites

Únicamente se inició el contenedor de pruebas existente `sactec-slug-stage2`,
ID `91c14a54aa3d4c34837a14757c76d0f1f0ceb07eac0654fa200a72e01724daa0`,
etiqueta `sactec.test=slug-stage2`, enlace `127.0.0.1:55441`, base
`sactec_slug_stage2_test`, esquema `public`. Se verificó por SQL la marca
`slug-stage2-91c14a54` antes de escribir. Las ejecuciones fijaron explícitamente
DATABASE_URL y las URL de pruebas; no dependieron de la conexión de .env.
Esta base ya tenía Etapa 2 aplicada. **No se ejecutó ninguna migración**.
La comprobación final encontró cero negocios sin su reserva principal.
El contenedor quedó detenido, conservando los datos ficticios para inspección.
No se operó Railway ni se modificó la base principal de desarrollo.

El build frontend fijó la API a un puerto local sin servicio para impedir consultas
remotas durante la compilación. Ese build es un artefacto de verificación: antes de
usarlo se debe recompilar con la URL del backend local compatible.

La implementación está terminada y las comprobaciones automatizadas indicadas
pasaron. **La revisión visual responsive sigue pendiente**: el host de acceso a
navegadores devolvió `The browser access host is unavailable`. JSDOM no demuestra
disposición visual ni reemplaza la revisión móvil/escritorio. El catálogo público
se verificó mediante su servicio real contra PostgreSQL, no mediante navegación.
No se declara preparación productiva. La base principal sigue pendiente de la
migración de Etapa 2 mediante un procedimiento autorizado y auditado separado.
