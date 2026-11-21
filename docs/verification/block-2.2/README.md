# Bloque 2.2: confirmación automática de reservas y registro comercial al finalizar

Fecha: 12 de noviembre de 2026. Rama `Fase1`, cambios sin commit ni despliegue. Las migraciones sólo se aplicaron en el PostgreSQL 16 efímero del runner (Docker, loopback 55433, tmpfs). La política 2 **no se activó** en ninguna base.

## Contrato

| Estado | Significado (política 2) |
|---|---|
| `CONFIRMED` | Horario reservado. Sin inventario, contabilidad ni factura. |
| `COMPLETED` | Servicio prestado. Se registró la operación comercial una sola vez. |
| `CANCELLED` | Reserva anulada. El horario queda libre. |
| `CANCELLED` + `cancelReason=NO_SHOW` | «No asistió». Se conserva el historial sin venta ficticia. |

No se agregaron enums. `ReservationStatus`, `OrderStatus` y los estados fiscales no cambian.

## Persistencia: `20261113000100_reservation_policy_v2` (aditiva)

- `Business.reservationPolicyV2Enabled BOOLEAN NOT NULL DEFAULT false`. **Obsoleta desde el Bloque 2.2.2:** ningún código la lee. Se conserva para no hacer un cambio destructivo; se podrá eliminar en una migración posterior.
- `Reservation.commercialPolicyVersion INT NOT NULL DEFAULT 1`.
- `Reservation.priceSnapshot DECIMAL(10,2)`: precio pactado al reservar. Sólo para reservas independientes v2; los espejos guardan su precio en `OrderItem`.
- `Reservation.accountingPostedAt`: marca de que la finalización v2 independiente registró sus efectos.
- `Reservation.publicRequestId` (sha256 de `businessId:clave`) y `publicRequestFingerprint`, con índice único `(businessId, publicRequestId)`.

No hay backfill. Las filas existentes quedan en versión 1, con los campos nuevos en NULL. No se inventan precios, fechas ni claves.

### Por qué alcanza un solo `priceSnapshot`

Una reserva independiente nunca tuvo contexto fiscal: el freeze está comentado en `confirmReservation`. Sin contexto fiscal, `postOrderMovements` usa `total` como débito y como ingreso. Así, bruto = neto = total = `item.price`, sin IVA, retenciones ni impoconsumo. El snapshot reproduce exactamente ese contrato fijando el momento del precio. La moneda es única (COP).

Limitación preexistente: las reservas independientes no tienen tratamiento tributario. No se modifica en este bloque.

## Reglas de `commercialPolicyVersion`

- Se decide **una vez**, al crear la fila (`newReservationPolicy`). Desde el Bloque 2.2.2 **toda reserva nueva es versión 2**, en todos los negocios. La versión 1 sólo existe en filas históricas.
- Nunca se deriva de `createdAt` ni de `updatedAt`, y nunca cambia después.
- Rutas de escritura cubiertas:
  - Tienda pública.
  - `POST /reservations`.
  - Venta manual con espejo.
  - `SalesService.create` (rama PUBLIC_STORE).
  - Upsert del espejo durante la edición.
- **Versión 1:** el comportamiento histórico queda intacto (confirmar registra efectos, cancelar revierte).
- **Versión 2:**

  | Situación | Acciones (`allowedActions`; cada endpoint revalida dentro de su transacción) |
  |---|---|
  | CONFIRMED antes del inicio | Editar, reprogramar, cancelar, eliminar |
  | CONFIRMED desde el inicio | Lo anterior y Finalizar |
  | CONFIRMED desde el fin | Lo anterior y No asistió |
  | COMPLETED independiente | Ninguna mutación ordinaria |
  | COMPLETED espejo | Restricciones de su Order (revertir con las reglas fiscales vigentes) |
  | CANCELLED | Eliminar (archivar) |
  | Archivada | Ninguna |

  Confirmar nunca se ofrece. Las rutas antiguas `PATCH /reservations/:id/confirm` y `PATCH /sales/:id/confirm` responden 409 `RESERVATION_USE_COMPLETE` para reservas v2 y sus órdenes espejo, antes de cualquier efecto. Los productos y las reservas v1 no cambian.

## Finalización (`POST /reservations/:id/complete`, `{ "serviceProvided": true }`)

Corre en una transacción `Serializable` (la `runSerializableTransaction` existente). Orden de bloqueos: Order → Reservation → bloqueos comerciales existentes.

- **Independiente:**
  - Revalida negocio activo, archivo, CONFIRMED, inicio (America/Bogota) y ausencia de efectos.
  - Valida el método de pago: sólo `CASH` (Caja 110505) o `BANK_TRANSFER` (Banco 111005). Otro valor da 409 `INVALID_PAYMENT_METHOD`, sin fallback.
  - Ejecuta `applyInventoryConsumptionForReservation` con la receta vigente y `postOrderMovements` con el precio pactado.
  - Guarda `accountingPostedAt`, `COMPLETED` y `completedAt`.
- **Espejo:** ejecuta el mismo cierre comercial de `confirmOrder`, extraído sin cambios a `postOrderCommercialEffects`: claim, tax freeze, inventario, contabilidad y `captureInvoiceCloseSnapshot`, que no emite documentos. La Order pasa a `COMPLETED` y la reserva a `COMPLETED`.
- **Gratuita** (independiente con `priceSnapshot = 0`):
  - Consume la receta vigente.
  - Si el consumo tiene valor, registra sólo el costo balanceado (6135 débito / 1435 crédito) con `postInventoryCostMovements`. Es el bloque de costos de `postOrderMovements` extraído tal cual; los snapshots de `accounting-posting-golden.spec.ts` se grabaron antes del refactor y siguen idénticos.
  - Nunca registra ingreso ni Caja/Banco.
  - Si no hay receta, queda COMPLETED sin asientos, y ese resultado se reconoce como válido al reintentar.
- **Espejo de importe cero:** bloqueo seguro con 409 `ZERO_AMOUNT_NOT_POSTABLE` antes de cualquier efecto. Habilitarlo exigiría cambiar reglas contables y fiscales de órdenes; queda como tarea pendiente.
- **Stock insuficiente:** 409 `INSUFFICIENT_STOCK_FOR_COMPLETION` («regularizá el inventario»). Se revierte todo y la reserva sigue CONFIRMED.
- **Idempotencia:** una segunda finalización revalida la evidencia y devuelve `alreadyCompleted`, sin movimientos nuevos y con el mismo `completedAt`. La evidencia incompleta o incompatible da un error estructurado y no se repara automáticamente.
- No se emite factura electrónica.

## Trazabilidad contable

Se conserva `businessId`, `originType=ORDER` y `originId=Reservation.id`. No hay órdenes ficticias ni asientos adicionales de cobro. Contabilidad no resolvía `originId` ni siquiera para órdenes. El único agregado es de búsqueda: el buscador de Contabilidad ahora encuentra los movimientos por la referencia `#xxxxxxxx` que muestra Ventas, y por «reserva»/«servicio». No cambian importes ni reglas.

## Cancelación, ausencia y eliminación

- **Ventas** (`PATCH /sales/:id/cancel`) sobre una v2 CONFIRMED: queda CANCELLED con auditoría y el horario se libera, sin devoluciones ni contraasientos. Los espejos se cancelan a través de su Order, en la misma transacción.
- **Pública:** sólo reservas independientes v2, con token, antes del inicio y sin efectos. Es idempotente. `GET /public/reservations/:id` expone `canCancel`, calculado en el servidor. La respuesta de la cancelación sólo incluye `{id, status, cancelledAt}`.
- **Ausencia:** `POST /reservations/:id/no-show` con `{ "confirmed": true }`. Exige v2, CONFIRMED, el fin del turno alcanzado (Bogotá) y ausencia de efectos. Escribe `CANCELLED` y `cancelReason=NO_SHOW`; en un espejo, la Order pasa a CANCELLED. No genera inventario, ingreso, pago, devolución, penalidad ni factura.
- **Motivos reservados:** `NO_SHOW` y `MIRROR_DETACHED_BY_EDIT` se rechazan con 400 `RESERVED_CANCEL_REASON` en toda entrada de usuario (Ventas, agenda, pública).
- **Eliminar** una v2 CONFIRMED sin efectos cancela, libera y archiva en la misma transacción. Una COMPLETED no se archiva.

## Edición y espejos

- `buildMirrorReservationData.update` ya no escribe `status` ni `origin`. Antes, una reprogramación devolvía el espejo a PENDING.
- Una reserva v2 editada o reprogramada conserva el estado, la versión, `confirmedAt` y `priceSnapshot`.
- Cuando la orden deja de ser un servicio único, el espejo se cancela con el código de sistema `MIRROR_DETACHED_BY_EDIT`; ese camino es su único escritor.
- Un espejo v2 sólo se reactiva si cumple **todo** esto:
  - tiene ese código;
  - no está archivado;
  - la Order está en SENT y sin postear;
  - no hay evidencia comercial.

  Cualquier otra cancelación (Ventas, pública, ausencia, archivo) da 409 `MIRROR_REACTIVATION_NOT_ALLOWED`.

## Idempotencia pública

- La clave es un UUID (`@IsUUID`), obligatoria siempre (400 `IDEMPOTENCY_KEY_REQUIRED`). La tienda (`ReservationDrawer`) y `/orden/[token]` ya la envían.
- Se guarda sólo `sha256(businessId:clave)`, acotado al negocio del slug.
- La búsqueda previa, la búsqueda dentro de la transacción y la relectura posterior a cualquier fallo (P2002 o «horario no disponible» tras esperar el lock de agenda) aplican la misma regla, `resolvePublicReservationReplay`:
  - **Huella distinta:** 409 `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`, sin datos.
  - **Más de 15 minutos desde la creación:** 409 `IDEMPOTENCY_KEY_EXPIRED`, sin datos y sin crear nada.
  - **En otro caso:** `{id, publicToken, status, date, startMinute, endMinute, createdAt}` con el estado actual.
- La respuesta usa un `select` explícito: ni la clave, ni su hash, ni la huella aparecen en respuestas ni en logs.
- En el frontend, la clave vive en un `useRef` por intento, nunca en storage ni en la URL. Se descarta tras el éxito o un 409.
- Las reservas públicas conservan `paymentMethod=CASH` por defecto, porque la tienda no tiene un paso de pago. El negocio puede corregirlo con «Editar» antes de finalizar.

## Puesta en marcha (comportamiento universal, Bloque 2.2.2)

No hay activación por negocio: el código nuevo crea toda reserva como v2 apenas se despliega.

1. Aplicar las migraciones en orden: `20261112000100`, `20261112000200` y `20261113000100`. No hace falta ninguna migración nueva.
2. Desplegar este código en **todas** las instancias: backend, frontend y procesos de fondo.
3. Retirar las instancias antiguas y esperar a que terminen sus solicitudes en curso. Un escritor antiguo seguiría creando reservas v1, y una instancia anterior al 2.2 podría confirmar una reserva v2 por la ruta vieja y registrar efectos con el precio de catálogo.
4. Verificar:

   ```sql
   SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name LIKE '202611%' ORDER BY 1;
   SELECT count(*) FROM pg_indexes WHERE indexname = 'Reservation_businessId_publicRequestId_key'; -- 1
   ```

   Además, confirmar en el balanceador que no queden versiones previas sirviendo tráfico.
5. Las reservas históricas no se tocan: siguen en `commercialPolicyVersion = 1` con sus reglas (confirmar registra efectos, cancelar revierte). No se recalculan precios ni se revierten asientos.
6. **No hacer rollback** a código anterior a este bloque mientras existan filas con `commercialPolicyVersion = 2`:

   ```sql
   SELECT count(*) FROM "Reservation" WHERE "commercialPolicyVersion" = 2;
   ```

## Verificación

| Suite | Línea base (antes) | Después |
|---|---|---|
| Backend `jest --runInBand` | 982 ok, 2 fallos previos (`manual-verification` #9, panel régimen simple) | 1004 ok, los mismos 2 fallos previos |
| PostgreSQL aislado, `reservations-concurrency` | ok | 76/76 ok (incluye 35 casos del Bloque 2.2) |
| PostgreSQL aislado, `sales-flow` | 3 fallos previos | Mismos 3 fallos previos |
| Compatibilidad de migración 2.2 | — | ok (históricos intactos, versión 1, flag apagado, índice presente) |
| Frontend `node --test` | 167/167 | 172/172 |
| Frontend `tsc` | ok | ok |

La revisión visual en Chrome no se realizó: requiere levantar la aplicación contra una base con la migración aplicada. No se aplicaron migraciones en bases compartidas.

## Bloque 2.2.1: validación funcional (12/11/2026)

Entorno: PostgreSQL 16 efímero (Docker, loopback 55434, tmpfs), con todas las migraciones aplicadas en orden y el seed del proyecto. Backend en el puerto 3101 y frontend en el 3100 (copia aislada). La política 2 se activó sólo en el negocio de prueba `qa-peluqueria-22`. La base de desarrollo `GestionMVP` y tu servidor en el 3000 no se tocaron. Al terminar, el contenedor y la copia se eliminaron.

Para alcanzar el inicio o el fin de un turno se movió la fecha y la hora de la reserva en la base QA, porque la app no permite reservar en el pasado.

Defectos encontrados y corregidos:

- **D1:** «Transacciones realizadas» contaba turnos v2 no realizados (confirmados, cancelados o ausencias). Ahora sólo cuenta ventas realizadas.
- **D2:** el editor mostraba «Pendiente» en un turno v2 confirmado, aunque no lo enviaba. El selector se oculta en los turnos v2.
- **D3:** una venta manual con turno marcada «Confirmado» llamaba a la confirmación antigua. El backend la rechazaba sin efectos, pero la UI mostraba error con la venta ya creada, con riesgo de duplicarla al reintentar. Ahora la creación devuelve `commercialPolicyVersion`; en v2 no se intenta el cierre anticipado y se informa «Turno reservado». Se agregó una aserción e2e.
- **D4:** el buscador de Contabilidad sólo indexaba la referencia del detalle (`#` + últimos 8). Ahora también indexa la de la tarjeta (`#` + primeros 4). Funciona en el modo «Textos».
- **D5:** el filtro «Ausencias» no pedía las ventas canceladas al backend y quedaba vacío. Ahora las pide.

Pendiente (O1): el panel lateral de agenda del inicio no se refresca tras finalizar o registrar ausencia hasta recargar. Es menor y no afecta datos.

Regresiones finales: frontend 172/172. Backend 1004 ok, con los mismos 2 fallos previos. PostgreSQL aislado 82 ok, con los mismos 3 fallos previos de `sales-flow`.

## Bloque 2.2.2: política v2 universal (13/11/2026)

- **Política central:** `newReservationPolicy` ya no lee `Business.reservationPolicyV2Enabled`. Toda reserva nueva (pública, interna, espejo de venta manual; negocios nuevos y existentes) nace `CONFIRMED`, versión 2, con `confirmedAt` y `priceSnapshot` (null en espejos).
- **Flag:** la columna queda obsoleta y sin lectores. No hay migración nueva ni cambios destructivos.
- **Tienda pública:** la clave de idempotencia es obligatoria siempre.
- **Pruebas:**
  - Los tests de los Bloques 0 a 2.1 que verifican reglas históricas convierten la fila recién creada en una v1 histórica (`asHistoricalV1`), así que la cobertura de v1 se conserva.
  - Los tests que no dependen de la política esperan ahora CONFIRMED.
  - El describe 2.2 usa un negocio recién creado sin flag. Un test nuevo comprueba que, con el flag apagado o encendido, la reserva nueva es v2 sin efectos.
- **Resultados** (iguales a la línea base del 2.2.1):

  | Suite | Resultado |
  |---|---|
  | Backend jest | 1004 aprobadas, 2 fallos preexistentes |
  | Snapshots contables | 4/4 idénticos |
  | PostgreSQL aislado | 82 aprobadas, los mismos 3 fallos de `sales-flow` |
  | Frontend `node --test` | 172/172 |
  | `tsc` y builds | OK |

- **Observación:** en una de cuatro corridas, la carrera «Reservas contra Ventas manual» rechazó una solicitud con un error de Prisma en lugar de un 409. No se reprodujo en las otras tres. La hipótesis es un timeout de transacción (P2028), que `toBookingConflict` no traduce, bajo contención. Queda pendiente de evaluar.

