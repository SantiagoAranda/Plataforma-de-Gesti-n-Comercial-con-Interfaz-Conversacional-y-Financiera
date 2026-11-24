# F1.5 — Servicios sin agenda: implementación local

Fecha: 2026-11-24. Rama: `Fase1`, HEAD `1a9de9d7ec7ef0277e7097b26dad337ada85598e`.
`develop` permanece en `bc7401e1831c0f8691140087a9604c7b31a9da75`.
Sin commits, integraciones, despliegues ni migraciones en bases compartidas.

## Contrato

`Item.type` continúa siendo `SERVICE`. La modalidad se determina exclusivamente mediante `requiresAppointment`, nunca por ausencia de franjas.

| Origen | requiresAppointment | allowWalkIn |
|---|---|---|
| Servicios existentes, migración | true | true |
| Alta de servicio por cliente antiguo que omite ambos campos | true | true |
| Servicio nuevo del formulario actualizado | true | false |
| Producto creado/editado mediante API | false | false |
| PATCH sin los campos | Conserva el valor almacenado | Conserva el valor almacenado |

La migración aditiva `backend/prisma/migrations/20261123120000_service_appointment_policy/migration.sql` crea ambos booleanos NOT NULL con DEFAULT true y actualiza los productos existentes a false/false. El valor predeterminado SQL conserva el comportamiento de clientes antiguos; el formulario envía explícitamente false para `allowWalkIn`. Los escritores que eludan ItemsService deben normalizar los productos: el DEFAULT SQL no depende de `type`.

Los DTO rechazan null y valores no booleanos. `allowWalkIn` se persiste pero no gobierna operaciones comerciales todavía. No se expone en la serialización del catálogo público. El flujo retrospectivo existente no consulta ese campo en F1.5.

## Formulario y precio

Debajo del nombre aparece un switch accesible y animado «Requiere agenda». Al apagarlo se muestran «Servicio sin cita» y «No se pedirá fecha ni horario al cliente y no ocupa un horario»; se ocultan precio, duración y disponibilidad semanal sin borrar sus estados.

El precio interno sigue siendo obligatorio. No se inventa un importe ni se asigna cero. En una creación sin precio válido, Guardar muestra una explicación en el bloque visible: activar agenda, cargar el precio usando el campo existente y volver a desactivarla. No se abre otro diálogo. El formulario mantiene su validación de precio mayor a cero; la API conserva el contrato de precio no negativo explícito. `publishWithoutPrice` continúa controlando la publicación del precio, independientemente de la modalidad.

Se conservan fotos, catálogo/categorías, cotización, visibilidad, importes, duración exacta y horarios. Una duración previamente nula no se reemplaza por el valor visual inicial del editor al guardar sin agenda. F1.8 tiene su ubicación documentada en el componente; no hay un toggle habilitado sin integración comercial.

## Reservas, transiciones y comercio

- Toda nueva reserva pasa por `AvailabilityService.reserveSlot`, que bloquea la configuración del ítem y rechaza servicios sin agenda. La disponibilidad pública, interna y retrospectiva devuelve cero opciones para ellos.
- Al desactivar agenda, ItemsService bloquea la fila del ítem y rechaza reservas PENDING/CONFIRMED cuyo final no haya pasado en la zona horaria ya utilizada por Reservas v2 (America/Bogota). No cancela ni reprograma reservas.
- Las reservas pasadas conservan sus acciones existentes de cancelación/finalización, snapshots y registros históricos. Las nuevas asignaciones de turno y los cambios de turno se rechazan mientras el servicio esté sin agenda. Una edición administrativa que no mueve el turno conserva los valores históricos.
- Al reactivar se valida duración y disponibilidad efectiva (franjas propias o generales del negocio). No se crean reservas a partir de órdenes comerciales anteriores.
- Tienda y Ventas admiten productos y servicios sin agenda en la misma orden. No generan reserva espejo ni campos de fecha/hora. Los servicios agendables siguen utilizando el flujo de reserva separado.
- El tipo fiscal de la línea sigue siendo SERVICE. No se alteraron cálculo de impuestos, RUT, IVA, contabilización ni generación de snapshots.
- Los carritos con precio a consultar mantienen WhatsApp sin crear órdenes ni revelar el precio. Una línea cuyo servicio pasa a requerir agenda se marca no disponible al refrescar el catálogo; el backend vuelve a validar dentro de la transacción.
- Se conserva la idempotencia existente: claves en órdenes públicas y reservas/atenciones, y contabilización idempotente. No se agregó una nueva clave de creación a ventas manuales comerciales, cuyo contrato previo no la utilizaba.

### Motivo de los cambios en transacciones de SalesService

1. La creación comercial toma `FOR SHARE` de ítems ordenados por ID y vuelve a comprobar modalidad y negocio antes de insertar la orden. Evita que una validación externa obsoleta permita comprar sin reserva un servicio recién reactivado.
2. Agregar líneas y editar órdenes comerciales valida las nuevas líneas con el mismo bloqueo. No se recalculan las líneas históricas por un cambio de modalidad.
3. Una edición con fecha/hora exige una reserva espejo previa; una orden comercial pura no se convierte en reserva. Se preserva el flujo de desprendimiento y reactivación controlados de espejos ya existente en Reservas v2.

No se cambió la implementación de confirmación, contabilización, impuestos ni idempotencia. Los cambios están cubiertos por carreras reales sobre PostgreSQL y regresiones de Ventas/Reservas.

## Verificación ejecutada

Las bases se crearon mediante `backend/test/run-public-catalog-isolated.cjs`: PostgreSQL 16, contenedor nuevo, puerto loopback, datos tmpfs, contraseña aleatoria, marcador de aislamiento y eliminación del contenedor al terminar. Se aplicaron 95 migraciones en esa base descartable; `migrate diff` no encontró diferencias respecto del schema.

Comandos reproducibles desde sus respectivos directorios:

```text
# backend
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.build.json
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.spec.json
node node_modules/jest/bin/jest.js --runInBand --no-cache --silent
node test/run-public-catalog-isolated.cjs test/service-appointment-policy.e2e-spec.ts test/public-catalog-visibility.e2e-spec.ts test/reservations-concurrency.e2e-spec.ts test/sales-flow.e2e-spec.ts

# frontend
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test src/hooks/useItemForm.test.cjs src/components/sales/SalesChatComposer.test.cjs src/lib/sales/serviceAgenda.test.ts "app/tienda/*/PublicStoreClient.test.cjs"
```

El glob de Tienda usa `*` deliberadamente: Node interpreta los corchetes de `[slug]` como patrón y puede omitir silenciosamente ese archivo con una ruta literal.

Resultados finales de esta intervención:

| Verificación | Resultado |
|---|---|
| TypeScript backend, producción y pruebas | Ambos comandos exit 0 |
| TypeScript frontend, configuración estándar | Exit 0 |
| Unitarias backend | 62 suites, 1.067 pruebas y 4 snapshots aprobados; 0 fallos |
| Integración PostgreSQL | 4 suites, 118 pruebas aprobadas; 0 fallos, 0 omitidas |
| Frontend formulario, Ventas, agenda y Tienda | 46 aprobadas; 0 fallos, 0 omitidas |
| Migraciones en base aislada | 95 aplicadas, diff contra schema vacío |
| git diff --check | Sin errores |

Pruebas cubren valores iniciales y PATCH, DTO/serialización, migración con filas antiguas, conservación del formulario, precio obligatorio/oculto, carrito mixto, WhatsApp, tenant, reservas públicas/directas, transiciones futuras/en curso/pasadas, reactivación, finalización histórica, carreras de modalidad y confirmación comercial concurrente. El contenedor descartable se eliminó al terminar.

En ejecuciones intermedias se corrigieron mocks que perdían identidad transaccional, el orden del error retrospectivo y la compatibilidad con desprendimiento de espejos; no se presentan esos intentos como exitosos. Un nuevo test de contabilización usó inicialmente `orderId` en lugar de `originId`; TypeScript lo rechazó y se corrigió el test.

TypeScript del frontend falló inicialmente por tipos generados de rutas ausentes de Fase1 (`cotizacion/[token]`, `dev-documentos`). Se regeneraron los tipos con Next y se preservó la antigua carpeta `.next/dev/types` en `C:/Users/Viko/AppData/Local/Temp/sactec-f15-next-dev-types-9fa35ecd-ee43-45e1-a311-7edbeeb34e71`. No se modificaron rutas ni configuración para ocultar errores.

No hubo navegador disponible: las pruebas JSDOM verifican comportamiento, no apariencia real en móvil/escritorio. La revisión visual sigue pendiente.

## Archivos de implementación y pruebas

- Persistencia: `backend/prisma/schema.prisma`, la migración indicada arriba.
- Contrato/ítems: `backend/src/items/item-service-policy.ts`, `dto/create-item.dto.ts`, `dto/update-item.dto.ts`, `item-public-view.ts`, `items.service.ts`.
- Consumidores: `backend/src/availability/availability.service.ts`, `backend/src/public/public.service.ts`, `backend/src/reservations/reservation-lifecycle.ts`, `backend/src/sales/sales.service.ts`.
- Backend tests: `backend/src/items/item-service-policy.spec.ts`, `backend/src/items/items.service.spec.ts`, `backend/src/sales/sales.service.spec.ts`, `backend/test/service-appointment-policy.e2e-spec.ts`, `backend/test/reservations-concurrency.e2e-spec.ts`.
- Formulario/tipos: `frontend/src/hooks/useItemForm.ts`, `frontend/src/components/mi-negocio/ItemFormContent.tsx`, `frontend/src/types/item.ts`, `frontend/src/lib/itemAppointment.ts`.
- Presentación/consumidores: `frontend/src/components/mi-negocio/ItemCard.tsx`, `ItemDetailModal.tsx`, `frontend/src/components/sales/SalesChatComposer.tsx`, `frontend/src/lib/sales/serviceAgenda.ts`, `frontend/src/lib/publicCatalog.ts`, `frontend/app/tienda/[slug]/PublicStoreClient.tsx`, `frontend/app/orden/[token]/page.tsx`.
- Frontend tests: `frontend/src/hooks/useItemForm.test.cjs`, `frontend/src/components/sales/SalesChatComposer.test.cjs`, `frontend/src/lib/sales/serviceAgenda.test.ts`, `frontend/app/tienda/[slug]/PublicStoreClient.test.cjs`.
- Este informe y salidas/cachés de Graphify regeneradas según AGENTS.md. `graphify-out/cache/last_query_stamp` ya estaba modificado antes de la intervención; no se descartó.

## Pendientes y F1.8

Antes de desplegar, revisar la apariencia en navegador y aplicar la migración mediante el procedimiento autorizado de despliegue (no realizado aquí). Las consultas a reservas abiertas durante la transición usan el comportamiento horario actual de Reservas v2; no se introdujo un sistema nuevo de zonas horarias.

F1.8 debe conectar `allowWalkIn` con las autorizaciones reales de Ventas y del backend, activar recién entonces el control y sus textos, probar llamadas directas, permisos, registro retrospectivo, idempotencia, snapshots e impuestos, y definir el tratamiento de clientes antiguos con true. Los servicios sin agenda siguen siendo ventas comerciales sin reserva; no equivalen a una reserva retrospectiva.

F1.6, F1.7, Fase 3, códigos de barras/QR y cambios fiscales no se implementaron.

## Estado final y dictamen

F1.5 implementada y verificada funcionalmente en el entorno local, con revisión visual real pendiente. `allowWalkIn` preparado; F1.8 no implementada funcionalmente.

HEAD y develop permanecen en los hashes iniciales. Los cambios están sin commit y sin staging. Graphify se actualizó mediante AST sin uso de API; sus archivos generados y cachés quedan modificados. Su extractor advirtió que falta `tree_sitter_sql`; la migración sí se verificó ejecutándola en PostgreSQL, independientemente del grafo.
