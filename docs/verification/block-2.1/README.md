# Bloque 2.1 — implementación y verificación

Fecha: 12 de noviembre de 2026. Base comparativa: `e005caa`. Cambios sin commit ni despliegue. No se ejecutaron migraciones sobre bases externas: el runner crea y elimina PostgreSQL 16 en Docker, loopback 55433 y almacenamiento tmpfs. No se inició el Bloque 2.2.

## Persistencia y compatibilidad

- `20261112000100_reservation_completed`: agrega `ReservationStatus.COMPLETED` en una migración independiente.
- `20261112000200_reservation_audit`: agrega `confirmedAt`, `completedAt`, `cancelledAt`, `cancelReason` y `walkIn=false`. No habilita atención sin cita.
- Sin cambios a `OrderStatus` ni estados fiscales. Sin backfill de estados o fechas. Confirmadas históricas permanecen confirmadas; las fechas desconocidas siguen nulas.
- El índice parcial y las consultas de ocupación conservan `status <> CANCELLED`. Finalizadas permanecen en el historial y ocupan su intervalo incluso ante datos futuros incorrectos.

## Operaciones

`POST /reservations/:id/complete` requiere `{ "serviceProvided": true }`. Ausencia, falso o texto producen `SERVICE_PROVISION_CONFIRMATION_REQUIRED`. La fecha la registra el servidor; ningún dato temporal del cliente se usa para finalizar.

La interfaz presenta cliente, servicio y horario, casilla desmarcada y botón «Finalizar atención». Incluye prevención de doble envío, foco y navegación por teclado. Aplica a históricos y espejos. Un conflicto refresca datos y cierra la decisión anterior, sin reintento automático.

| Operación | Comportamiento |
|---|---|
| Confirmar PENDING | CONFIRMED; conserva inventario y contabilidad actuales; registra confirmedAt |
| Confirmar CONFIRMED | Conserva idempotencia comercial existente |
| Confirmar CANCELLED/COMPLETED | Rechazado |
| Finalizar CONFIRMED | COMPLETED y completedAt, sólo con declaración, horario iniciado y evidencia válida |
| Repetir finalización | Revalida propietario, archivo, horario y evidencia; sin escrituras ni cambio de fecha |
| Cancelar PENDING | Canales existentes; CANCELLED y auditoría |
| Cancelar CONFIRMED | Sólo Ventas, con contrapartidas existentes |
| Cancelar CANCELLED | Idempotente; no cambia fecha ni motivo originales |
| Cancelar/archivar COMPLETED independiente | Rechazado; sin reversión independiente en este bloque |
| Revertir Order | Flujo vigente; el espejo pasa a CANCELLED y conserva completedAt |

`SalesService` coordina las operaciones y `reservation-lifecycle.ts` concentra políticas compartidas. Las acciones del DTO no autorizan una petición: las mutaciones revalidan propietario y estado bajo sus bloqueos; finalizar vuelve a cargar la evidencia dentro de la transacción y verifica negocio activo. Se mantienen guards, aislamiento por businessId y token para cancelación pública PENDING.

Orden de bloqueos: Order cuando existe → Reservation → agendas ordenadas cuando corresponde → bloqueos comerciales existentes. Las operaciones independientes rechazan espejos y no adquieren después un lock de Order. Finalizar no requiere modificar la agenda ni registrar movimientos.

## Evidencia de finalización

Se exige inventoryPostedAt; para órdenes, también accountingPostedAt y estado comercial COMPLETED. Se verifican asientos efectivos, naturalezas válidas, importes no negativos, débito/crédito y balance con tolerancia vigente de 1. Los importes cero no se rechazan. Se rechazan contrapartidas de reversión y SALE_RETURN. Cuando hay valor de consumo registrado, se comprueban las contrapartidas de costo e inventario del contrato actual (6135/1435); nunca se reconstruye una receta histórica.

Servicios sin consumo pueden tener marca sin movimientos de inventario. Una marca no reemplaza los asientos ni permite ignorar pruebas de reversión o inconsistencia. No se usa updatedAt como prueba contable. La evidencia comercial habilita finalizar, pero nunca implica que se prestó el servicio.

Un espejo sólo finaliza con su Order COMPLETED, no archivada y con evidencia compatible. Finalizar modifica exclusivamente Reservation. No vuelve a confirmar ni modifica Order, stock, asientos o documentos fiscales. El estado fiscal no condiciona finalizar.

## allowedActions y archivo

Se incluyen `allowedActions`, `blockedActions` con `{code,message}`, `reservationStatus` y auditoría en el DTO unificado y en la respuesta de finalización. La evidencia se carga por lotes: consultas de movimientos contables, inventario y documentos fiscales por conjunto de IDs, sin consultas por fila. Las reglas se evalúan independientemente: un bloqueo para finalizar no suprime cancelar cuando sigue permitido.

| Registro | Acciones anunciadas |
|---|---|
| Reserva PENDING | confirm, cancel, edit, reschedule; delete si no hay efectos comerciales inexplicados |
| Reserva CONFIRMED | cancel; complete si horario y evidencia lo permiten |
| Reserva COMPLETED | Ninguna mutación comercial |
| Reserva CANCELLED | delete si no quedan efectos pendientes; no se ofrece repetir cancelación |
| Order DRAFT/SENT | confirm, cancel, edit según marcas; reschedule si tiene espejo editable; delete según política vigente |
| Order COMPLETED | reverse según estado, inventario y restricciones fiscales existentes; complete si espejo elegible; delete sólo cuando ya lo permite la política de archivo |
| Order CANCELLED | delete según política de archivo |
| Archivado | Ninguna |

Se conservan «Eliminar» y «Venta eliminada». Excepción funcional aprobada: archivar una reserva pendiente también la cancela para liberar el horario. No se aplica a una atención finalizada. Archivar no ejecuta reversión fiscal o contable. Se mantiene la prohibición vigente de archivar una orden COMPLETED con inventoryPostedAt; no se introdujo una prohibición general para todas las órdenes COMPLETED. La reserva independiente cancelada con movimientos debe tener evidencia de reversión y saldos netos consistentes para archivarse.

Códigos principales: `RESERVATION_STATE_CONFLICT`, `ORDER_STATE_CONFLICT`, `RECORD_ARCHIVED`, `MIRROR_ORDER_NOT_COMPLETED`, `RESERVATION_NOT_STARTED`, `COMMERCIAL_EVIDENCE_MISSING`, `COMMERCIAL_EVIDENCE_INCONSISTENT`, `COMMERCIAL_EFFECTS_REVERSED`, `COMMERCIAL_EFFECTS_PENDING`, `RESERVATION_CONCURRENT_MODIFICATION`. Se mantienen los códigos de restricciones fiscales de reversión. Conflictos transaccionales conocidos se traducen sin reintentar decisiones del usuario.

## Interfaz

Ventas, detalle, tarjetas, consultas públicas y agenda reconocen Finalizada. CERRADO conserva su significado comercial; la atención del espejo se muestra separada. Confirmadas nunca se presentan como realizadas. Cerradas incluye confirmadas y finalizadas para preservar los totales; se agregan filtros específicos Confirmadas y Finalizadas. La agenda conserva finalizadas y las excluye del contador pendiente. Sin allowedActions no se habilitan mutaciones por inferencia.

## Pruebas y evidencia

Los resultados finales y las limitaciones de ejecución se registran en `results.json` y los logs adjuntos. `files.txt` enumera archivos modificados y agregados; incluye actualización del grafo.

- Backend: 429 pruebas, 428 aprobadas y un fallo reproducido en HEAD. Política nueva: 36/36. Incluye reservas, disponibilidad, ventas, inventario, contabilidad y Factus.
- Frontend: 134/134 pruebas Node/JSDOM. Incluye declaración explícita, doble envío, conflicto/refresco, acciones ausentes, estados, archivo, filtros y agenda. TypeScript y build Next.js aprobados.
- PostgreSQL: 41 pruebas de reservas/concurrencia; ver `postgres.log`. Migraciones desde vacío (91), diff de esquema vacío y migración sobre históricos con estados preservados, fechas nulas y walkIn=false. Incluye consumo/sin consumo, neto recibido cero admitido por el contrato contable, doble finalización, carreras y espejo inmutable.
- Regresión PostgreSQL de ventas: 6 aprobadas y 3 fallos. Comparación completa en `postgres-final.log` y `baseline-postgres.log`.
- Backend TypeScript build: aprobado. `npm run build` no termina porque `prisma generate` recibe EPERM al reemplazar la DLL de Windows en uso. El cliente actualizado se utilizó en las pruebas reales; no se detuvieron procesos ajenos para liberar la DLL.
- `git diff --check`: sin errores. Graphify actualizado mediante `graphify update .`; advertencias del extractor SQL documentadas en su log.

Fallos comparados, sin atribución por suposición:

1. Contabilidad, `accounting.service.spec.ts:1144`: proyección SIMPLE esperaba 480000, recibió 0. Mismo fallo en copia de HEAD, 33/34 aprobadas (`baseline-accounting.log`).
2. Ventas PostgreSQL, `sales-flow.e2e-spec.ts:321` y `:442`: fixtures de inventario sin stock disponible. Mismos fallos al ejecutar runner original de HEAD sobre otra instancia aislada.
3. Ventas PostgreSQL, `sales-flow.e2e-spec.ts:584`: esperaba «venta», recibe «contrapartida producto - test product». Misma diferencia en HEAD.

No se cambiaron reglas comerciales ni expectativas de esas cuatro pruebas para ocultar los fallos. Los mocks de pruebas afectados por los nuevos bloqueos/lecturas sí se actualizaron.

Comandos reproducibles (desde backend salvo indicación):

```text
node node_modules/jest/bin/jest.js --runInBand src/reservations src/availability src/sales src/accounting src/inventory src/fiscal-documents
node test/run-reservations-isolated.cjs test/reservations-concurrency.e2e-spec.ts
node test/run-reservations-isolated.cjs test/sales-flow.e2e-spec.ts
node node_modules/typescript/bin/tsc -p tsconfig.build.json
npm run build
# frontend: node --test con los 13 archivos *.test.cjs del proyecto
# frontend: node node_modules/typescript/bin/tsc --noEmit
# frontend: npm run build
```

La comparación utilizó una extracción `git archive HEAD backend`, dependencias compartidas mediante junction y runner original, sin tocar la copia de trabajo. Los logs contienen los nombres y errores precisos. Las 114 pruebas iniciales del plan no se contabilizan como validación de este cambio.

## Límites y siguiente bloque

No fue posible revisión visual móvil/escritorio: CUA devolvió `The browser access host is unavailable`. JSDOM no sustituye inspección visual. Tampoco se hizo una emisión real contra Factus; se ejecutaron sus regresiones locales y comprobaciones de inmutabilidad en PostgreSQL.

No hay cambios de implementación en Factus, impuestos, InventoryService o AccountingService. Confirmación sigue teniendo los efectos comerciales actuales. Finalizar no repara históricos ni garantiza información histórica que nunca se registró; los casos inconsistentes se bloquean y requieren reparación separada. Quedan fuera el traslado de efectos a Finalizar (2.2), reversión de independientes finalizadas y flujo walk-in. No se requiere una nueva decisión funcional para el alcance implementado; estas extensiones necesitan autorización separada.
