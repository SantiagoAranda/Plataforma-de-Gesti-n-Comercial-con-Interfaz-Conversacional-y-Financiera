# F1.2-A — Verificación

## Carrera reproducida antes de modificar transacciones

Base: 16ac7cf, Fase1. Prueba `PublicService / F1.2-A race` en
`backend/src/public/public.service.spec.ts`.

Intercalado determinista con dobles Prisma: `item.findMany` entrega un producto visible;
durante `resolveSelectionsForOrderLine` se simula el commit del negocio activando
`publishWithoutPrice`; después continúa la creación pública. Resultado previo:
la prueba esperaba `PRICE_ON_REQUEST` sin escritura, pero recibió
`{message: "Order created", orderId: "public-token"}` (1 fallida, 33 omitidas).
Esto prueba el orden de operaciones de la aplicación, no bloqueos reales de PostgreSQL.

Solución mínima: la creación pública, con o sin contexto fiscal, usa una transacción;
antes de insertar, lee y bloquea las filas Item con FOR SHARE en orden de id, y
revalida negocio, estado, visibilidad y precio oculto. Los UPDATE normales del negocio
entran en conflicto con ese bloqueo. Si ocultar se confirmó antes, rechaza la orden;
si la orden obtuvo antes el bloqueo, su creación precede al cambio. Sin modificar
SalesService, importes históricos, snapshots existentes o migraciones.

Resultados finales al pie.

La misma ventana se reprodujo en `calculateTaxPreview`: la comprobación inicial
no observó restricciones y el cálculo posterior devolvió un subtotal en lugar de
rechazar (1 fallida, 8 omitidas). Se aplicó el mismo bloqueo y revalidación a la
lectura fiscal pública, pasando la transacción al motor fiscal existente.


## Entrega para revisión — 17/11/2026

Implementado exclusivamente F1.2-A. F1.2-B y fases posteriores no iniciadas.

### Cambios funcionales y contratos

- Precio público nullable: null se presenta como «Consultar precio»; cero numérico conserva su significado. Se ocultan precios anteriores y recargos de opciones cuando el precio base es oculto.
- Carrito visible, oculto o mixto; conserva cantidades, claves de personalización, selecciones y exclusiones. Las líneas retiradas del catálogo permanecen como no disponibles hasta eliminarlas. Un carrito con precios ocultos muestra «Total a consultar», sin confirmación comercial ni cálculo fiscal.
- WhatsApp utiliza phoneWhatsapp del negocio, incluye nombre, cantidades, opciones y exclusiones. No incluye importes ni totales, no exige datos de comprador y no realiza POST ni crea documentos. Abre WhatsApp para que el cliente decida enviar. Sin teléfono válido, acción deshabilitada.
- Antes de consultar o comprar se vuelve a cargar el catálogo. Si cambió, se exige revisar la selección. Refresco al abrir carrito, recuperar foco/visibilidad y cada 30 segundos con carrito abierto. Fallos de actualización bloquean las acciones.
- Respuestas fiscales canceladas/obsoletas se descartan usando abort, identidad de catálogo e identidad de carrito/comprador; no se muestran totales anteriores durante un nuevo cálculo.
- /orden/[token], /reserva/[id] y AppointmentLookupModal aceptan precio null. Las reservas conservan el motor v2, disponibilidad, duración, snapshots internos e idempotencia.
- Mi Tienda usa el contexto comercial public-store y respeta visibleInCatalog/publishWithoutPrice. No se cambiaron Mi Negocio, Inventario ni Ventas.
- Se conserva Item.price obligatorio e interno. Los endpoints y DTO de escritura de F1.1 se mantienen. Extensiones de lectura: business.phoneWhatsapp en catálogo y optionGroups[].options[].priceDelta nullable para opciones de ítems con precio oculto. PublicCatalogItem refleja esta nulabilidad; el tipo interno de opción mantiene precio numérico.
- HTML/precarga de la tienda utiliza fetch no-store. Lecturas públicas pertinentes y vista fiscal envían Cache-Control: no-store. Se mantiene la caché de municipios porque no contiene precios. Una respuesta ya descargada no puede retirarse del navegador; los refrescos y validación previa impiden usarla para nuevas operaciones. No se ha validado una CDN externa que ignore estas cabeceras.

### Archivos de implementación modificados

Backend:
- backend/src/public/public.service.ts
- backend/src/public/public.controller.ts

Frontend:
- frontend/app/tienda/[slug]/PublicStoreClient.tsx
- frontend/app/tienda/[slug]/page.tsx
- frontend/app/(app)/tienda/page.tsx
- frontend/app/orden/[token]/page.tsx
- frontend/app/reserva/[id]/page.tsx
- frontend/src/components/reservations/AppointmentLookupModal.tsx
- frontend/src/components/shared/CartSummary.tsx
- frontend/src/types/item.ts

Nuevo: frontend/src/lib/publicCatalog.ts.

### Pruebas y evidencia

Modificados:
- backend/src/public/public.service.spec.ts
- backend/src/public/public-catalog-visibility.spec.ts

Nuevos:
- backend/test/public-catalog-visibility.e2e-spec.ts
- backend/test/run-public-catalog-isolated.cjs
- frontend/app/tienda/[slug]/PublicStoreClient.test.cjs
- frontend/src/components/shared/CartSummary.test.cjs
- frontend/src/lib/publicCatalog.test.cjs
- docs/verification/f1.2-a/README.md
- docs/verification/f1.2-a/frontend-lint.json
- docs/verification/f1.2-a/backend-lint.json

Resultados:
- TypeScript frontend y backend (tsconfig.build.json), noEmit e incremental false: aprobado.
- Jest backend completo: 61 suites, 1.059 pruebas y 4 snapshots aprobados.
- Pruebas focalizadas frontend: 11/11 aprobadas. Incluyen carrito normal/oculto/mixto, cantidades/claves, teléfono ausente, consulta sin POST, cambio de visibilidad y respuesta fiscal tardía.
- Ejecución general node --test de frontend: 202/202 aprobadas. Se ejecutó adicionalmente el patrón app/tienda/*/PublicStoreClient.test.cjs para asegurar inclusión de la ruta con corchetes; los conteos de las ejecuciones se solapan.
- PostgreSQL 16 real descartable: 98/98 regresiones existentes de Ventas y Reservas aprobadas. Suite pública nueva final: 5/5 aprobadas (JSON/caché/precio interno; rechazo sin efectos; compra normal/idempotencia; bloqueo real FOR SHARE; reserva oculta con snapshot, duración, idempotencia y consultas públicas).
- Primer ensayo PostgreSQL: 101/102; una expectativa nueva usaba items en vez del contrato data. Se corrigió únicamente la expectativa y se repitió la suite afectada, agregando compra normal: 5/5.
- Base nueva en tmpfs, puerto 127.0.0.1:55437, credenciales efímeras y marcador de propiedad; 94 migraciones existentes aplicadas, drift vacío. Contenedor eliminado al terminar. Ninguna base compartida ni archivo de migración modificado.
- ESLint ejecutado sin --fix global. No está limpio: comparación por archivo y regla en los JSON adjuntos. El frontend reduce los errores de PublicStoreClient (11→9) y warnings (15→12); los demás archivos existentes conservan su deuda. Los mocks Jest del backend amplían diagnósticos de acceso inseguro siguiendo el patrón preexistente any; no se ocultan con desactivaciones de reglas. No equivale a un gate de lint aprobado.
- git diff --check aprobado.
- graphify update . ejecutado (AST, sin API): se conservan los artefactos regenerados en graphify-out/. Avisó dependencias opcionales ausentes para extracción SQL/PDF; el grafo de código sí se actualizó.

Comandos reproducibles desde frontend:
    node node_modules/typescript/bin/tsc --noEmit --incremental false
    node --test "src/lib/publicCatalog.test.cjs" "src/components/shared/CartSummary.test.cjs" "app/tienda/*/PublicStoreClient.test.cjs"

Desde backend:
    node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.build.json
    node node_modules/jest/bin/jest.js --runInBand --silent
    node test/run-public-catalog-isolated.cjs

### Riesgos pendientes y dictamen

Pendiente revisión visual real de escritorio/móvil: el host de Computer Use no estuvo disponible. JSDOM verifica comportamiento, no sustituye esa revisión. También queda el gate de lint pendiente por deuda existente y tipado de mocks. No se ejecutó despliegue ni validación de caché de infraestructura externa.

La protección transaccional serializa el cambio de visibilidad con creación/cálculo fiscal: una operación que obtuvo el bloqueo antes que el cambio puede terminar antes de ese cambio. No altera operaciones históricas ni requiere reestructurar SalesService. Un cambio de configuración no puede borrar información que el cliente ya recibió.

Dictamen: F1.2-A lista para revisión funcional y de código; se puede preparar F1.2-B sobre estos contratos. Antes de dar aprobación final de integración, completar revisión visual y acordar el tratamiento del lint. No se habilitó el nuevo formulario ni se integró automáticamente nada.

### Estado de Git

Inicio limpio, rama Fase1, HEAD y develop:
16ac7cf698795b088d87a20500daaef072df22dd (integración F1.1).

Al cierre, misma rama y mismos hashes; cambios sin stage/commit en los archivos detallados y artefactos graphify-out regenerados. No se realizaron commits, push, merge, rebase, despliegues ni modificaciones a develop.
