# Contrato de cotizaciones

Fase 3 · 19/11/2026 · Rama `Fase3`. Implementado en `backend/src/quotations/`.

## Regla de oro
Una cotización **nunca** tiene efectos comerciales: no toca `Order`, inventario, contabilidad, impuestos fiscales (`SaleTaxLine`, `TaxCalculationSnapshot`) ni Factus. Solo la **conversión a venta** (pendiente, ítem 6) crea una `Order`, usando las reglas comerciales vigentes.

## Decisiones tomadas
| Tema | Decisión |
|---|---|
| Modelo | `Quotation` y `QuotationItem` propios. No se agrega ningún estado a `OrderStatus` |
| Estados | `OPEN`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `CONVERTED` |
| «Enviada» | No es un estado: es la marca `sentAt` sobre una cotización `OPEN` |
| «Vencida» | No es un estado: se calcula al leer (`OPEN` y `validUntil` pasada). No hay proceso programado |
| Vigencia | 15 días por defecto (1 a 90), contados desde la creación o desde la última edición de la vigencia |
| Numeración | Consecutivo por negocio (`COT-0001`), asignado dentro de la transacción de creación bajo un candado por negocio, con restricción única `(businessId, number)` |
| Productos | Entran los productos activos del negocio. La descripción del catálogo (`quotationDescription`) solo se agrega si el producto tiene `includeInQuotation` |
| Precio oculto | Si el producto tiene `publishWithoutPrice`, la línea va sin precio («Consultar precio») y **no suma**. Se puede fijar un precio explícito en la línea. El precio interno nunca se usa |
| Impuestos | IVA e impoconsumo **estimados** con `TaxService.calculateTaxPreview` como consumidor final, congelados en `taxTotal`. Si el cálculo falla o no hay configuración fiscal, queda en 0: nunca bloquea la cotización |
| Servicios con agenda | No se cotizan desde la tienda. Tampoco generan reserva al cotizar |
| Idempotencia | `idempotencyKey` (UUID) opcional: la clave se guarda como hash por negocio, con la huella del contenido. Mismo contenido → misma cotización; otro contenido → `IDEMPOTENCY_KEY_REUSED` |

## Transiciones
```
OPEN ──accept──▶ ACCEPTED ──convert──▶ CONVERTED   (pendiente)
 │  └──reject──▶ REJECTED
 └─────cancel──▶ CANCELLED ◀──cancel── ACCEPTED
```
- `send` pone `sentAt` (si no existe) y deja el estado en `OPEN`.
- `send` y `accept` exigen una cotización **no vencida** (`QUOTATION_EXPIRED`). Se puede rechazar o cancelar una vencida.
- Repetir la acción ya aplicada devuelve el estado actual sin escribir (idempotente).
- Cualquier otra combinación → `QUOTATION_INVALID_TRANSITION`.
- Editar (`PATCH`) solo en `OPEN` (`QUOTATION_NOT_EDITABLE`). Editar devuelve la cotización a «no enviada» (`sentAt = null`). Editar la vigencia reactiva una vencida.
- Cada acción bloquea la fila (`SELECT … FOR UPDATE`) antes de leerla.

## Endpoints (autenticados, por negocio)
| Método | Ruta | Acción |
|---|---|---|
| POST | `/quotations` | Crear |
| GET | `/quotations?status=` | Listar (máx. 200, más recientes primero) |
| GET | `/quotations/:id` | Detalle |
| PATCH | `/quotations/:id` | Editar datos, vigencia y líneas (reemplaza todas) |
| POST | `/quotations/:id/send` · `accept` · `reject` · `cancel` | Transiciones |

Errores con `code`: `QUOTATION_NOT_FOUND` (404, también para cotizaciones de otro negocio), `QUOTATION_ITEM_NOT_FOUND`, `QUOTATION_LINE_NAME_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `QUOTATION_EXPIRED`, `QUOTATION_INVALID_TRANSITION`, `QUOTATION_NOT_EDITABLE`.

La respuesta nunca incluye la clave ni la huella de idempotencia. Trae `displayNumber`, `expired`, `subtotal`, `taxTotal`, `total` y las líneas con `unitPrice` y `lineTotal` (`null` = «Consultar precio»).

## Qué queda fuera de esta entrega
1. **Endpoint público de la tienda** (ítem 2): reutilizará `create` con `origin = PUBLIC_STORE`, `idempotencyKey` obligatoria, límite de frecuencia y aviso al dueño. `assertNoHiddenPrices` (Victoria) rechaza un *pedido* con productos de precio oculto; la cotización es el camino para ellos.
2. **Lista de Ventas y menú por estado** (ítem 1, parte visible) y reemplazar el número provisional `COT-XXXXXX` de los documentos por `displayNumber`.
3. **Conversión a venta** (ítem 6): `QuotationStatus.CONVERTED`, `convertedAt`, enlace a la `Order` creada, revalidación de inventario y las opciones «mantener» / «actualizar precio». Exigirá transacción, bloqueo e idempotencia.
4. **Referencia a la `Order` convertida:** se agrega en la migración de la conversión, no antes.

## Cómo se probó
- `quotations.service.spec.ts`: 20 pruebas unitarias con Prisma en memoria (numeración, precios ocultos, descripciones, IVA, idempotencia, transiciones, vencimiento, edición, aislamiento por negocio).
- Prueba de integración manual contra PostgreSQL local: 12 creaciones simultáneas (consecutivos 1 a 12), 6 solicitudes simultáneas con la misma clave (una sola cotización), envíos y aceptaciones simultáneos, vencimiento, y cero pedidos, movimientos de inventario o asientos nuevos.
