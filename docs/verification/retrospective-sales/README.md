# Nueva Venta: registro retrospectivo de servicios

Verificado el 16/11/2026. Base Git: `4498cff`. Sin commits ni despliegues. Se preservaron los cambios previos del árbol y del índice. GestionMVP, producción y Railway no se modificaron.

## Diagnóstico

Nueva Venta usa `ReservationSlotPicker`, no `SaleCreateModal`. Ya permitía navegar entre meses/años, pero la selección dependía de disponibilidad futura. Los horarios propios del servicio reemplazan completamente los generales del negocio; ninguno prueba el horario histórico. Los cambios previos sin commit ya iniciaban una transacción de creación/finalización, pero no recuperaban respuestas perdidas, ignoraban la duración histórica enviada y listaban historia según la configuración vigente.

## Comportamiento implementado

- Modo exclusivo de creación manual, conservando estructura y diseño del calendario. Días anteriores y hoy seleccionables; indicadores y franjas futuras conservan AvailabilityService.
- Sugerencias históricas basadas en las ventanas actuales, con el mismo generador de duración e intervalos que las futuras. No certifican disponibilidad histórica. Hora exacta oculta, con implementación y compatibilidad conservadas. Se conservan bloqueos y rechazo de solapamientos. Ver [corrección y pruebas](historical-slots.md).
- `GET /sales/manual-service-times` está bajo los guards autenticados de Ventas. Se retiró el experimento previo `includePast/history` de las consultas generales. La tienda pública conserva sus restricciones.
- Zona comercial America/Bogota. El fin solamente determina elegibilidad: nunca declara prestación. La duración real es editable únicamente en creación retrospectiva y se conserva en el espejo y `OrderItem.durationMinutesSnapshot`, junto al precio pactado y método de pago.
- Futuro y atención en curso quedan CONFIRMED. Si termina mientras se completa el formulario, el servidor responde `SERVICE_PROVIDED_CONFIRMATION_REQUIRED` sin persistir registros; el frontend pide confirmación explícita.
- Confirmación react-hot-toast: «¿Confirmás que el servicio se prestó? Se registrarán los movimientos de inventario y contabilidad correspondientes». VOLVER conserva el formulario y no crea nada; SÍ, FINALIZAR envía la declaración. El formulario queda inerte mientras espera, evitando ediciones detrás del aviso y doble envío.

## Atomicidad y recuperación idempotente

`POST /sales` acepta `serviceProvided`, `durationMinutes` e `idempotencyKey` para el servicio manual. Retrospectividad requiere clave y no se admite para productos ni origen público.

Se hashea la clave con el negocio y el prefijo de operación; una huella SHA-256 del payload canónico detecta cambios de contenido. Se reutiliza el índice único existente `Order(businessId, idempotencyKey)`. La única migración agrega `manualRequestFingerprint`, nullable, sin alterar filas históricas.

**La recuperación ocurre antes de validar catálogo, tiempo o solapamientos.** Mismo negocio/clave/contenido devuelve la misma venta y estado del espejo. Otra huella responde `IDEMPOTENCY_KEY_REUSED`. Se verifica nuevamente dentro de la transacción. La unicidad impide que dos solicitudes reclamen la misma clave; las carreras y respuestas inciertas del commit vuelven a consultar el resultado comprometido antes de propagar el error.

Order con clave/huella, reserva espejo v2, duración y finalización comparten **una transacción serializable**. Se reutiliza `completeReservationV2InTx` y sus reglas de inventario, receta, pago, contabilidad y evidencias. No hay una segunda operación HTTP para finalizar. Los errores de serialización usan el retry existente.

Un error incluso después de escribir consumo y asientos revierte orden, espejo, clave, movimientos y stock. Se comprobó que el mismo intento puede reintentarse después del rollback. El frontend conserva en memoria el payload exacto y la clave ante respuesta incierta; cambiar los datos inicia otra operación. Una reserva futura comprometida cuya respuesta se perdió se recupera como CONFIRMED aunque haya terminado entretanto: nunca se convierte automáticamente en prestación declarada.

La fecha real permanece en la reserva. Creación, finalización y movimientos se registran en el momento de registro, sin reabrir períodos históricos. Política universal v2, reservas v1, productos y Factus mantienen sus reglas. No se emitieron documentos fiscales.

## Resultados

| Verificación | Resultado |
| --- | --- |
| Frontend completo, 19 archivos | **194/194** |
| Backend unitario, 58 suites | **1007/1007**, 4 snapshots |
| PostgreSQL general, incluido esquema de autenticación | **126 aprobadas, 12 fallidas**, 13 slugs ejecutadas aparte |
| Runner dedicado slugs y nombre comercial | **15/15**; 2 de nombre ya contadas arriba |
| PostgreSQL combinado, casos únicos | **139 aprobadas / 151**; 12 fallos, sin casos pendientes |
| Nómina con fuentes/tests HEAD en otra copia aislada | **Los mismos 12 fallos**, 1 aprobada |
| Backend build: Prisma + TypeScript | Aprobado |
| Frontend build y TypeScript: `next build --webpack` | Aprobado |
| Chrome escritorio 1280×900 y móvil 390×844 | Aprobado con API simulada |
| `git diff --check` | Aprobado |

**La integración global no está verde.** Los fallos están en `payroll-payments` y `payroll-advanced-audits`: fixtures anteriores a agosto de 2026 bloqueados por la política actual, errores derivados y una expectativa de prima. Se reprodujeron los mismos 12 nombres exportando `backend/src` y `backend/test` de HEAD a otra copia y otra base aislada. No se modificaron nómina ni sus pruebas. [Resultados y nombres de los fallos](results.json).

La cobertura específica incluye futuro, hoy futuro, hoy terminado, día anterior, atención en curso, duración/precio reales, hora exacta fuera de agenda vigente, ausencia de horarios actuales, bloqueos, solapamientos, aislamiento entre negocios, declaración omitida sin persistencia, concurrencia, respuesta perdida, clave con otro contenido, catálogo desactivado después del primer envío, stock insuficiente y rollback tras escribir asientos seguido de retry. Las suites existentes verifican productos, v1 y ciclo comercial/fiscal.

### Navegador y límites

Se sirvió la página real `/venta` desde una copia sin `.env`, usando Chrome aislado, identidad ficticia y API localhost interceptada. En ambos tamaños, VOLVER envió cero POST. Tras abortar la respuesta del primer POST confirmado, el siguiente guardado reenvió exactamente el mismo payload y clave, sin otra confirmación. No hubo errores de ejecución ni desbordamiento horizontal.

- [Confirmación móvil](mobile-confirmation.png) y [escritorio](desktop-confirmation.png).
- [Calendario móvil](mobile.png) y [escritorio](desktop.png).
- [Modo público móvil](mobile-public.png) y [escritorio](desktop-public.png).

La revisión visual usa API simulada; los efectos comerciales se verificaron separadamente con servicios reales y PostgreSQL. No se afirma una prueba de navegador conectado de extremo a extremo a PostgreSQL ni una emisión real en Factus.

Turbopack rechazó el node_modules compartido mediante junction fuera de la raíz de la copia aislada. El build final pasó con Webpack, incluido TypeScript. Esto no certifica el build Turbopack estándar. Jest e2e usa `--forceExit` por handles abiertos de suites existentes; esa limitación se conserva en el resultado.

## Archivos

- `backend/prisma/schema.prisma` y `backend/prisma/migrations/20261115120000_manual_sale_idempotency/migration.sql`: huella manual nullable.
- `backend/src/sales/sales.service.ts`, `sales.controller.ts` y `dto/create-order.dto.ts`: recuperación, transacción, consulta privada y declaración.
- `backend/src/availability/availability.service.ts`: historia explícita conservando protección de agenda.
- `backend/src/reservations/reservations.controller.ts` y `reservations.service.ts`: se retiró el experimento general previo; volvieron al comportamiento HEAD.
- `frontend/src/components/reservations/ReservationSlotPicker.tsx`: modo manual y hora exacta.
- `frontend/src/components/sales/SalesChatComposer.tsx`: duración, indicación y bloqueo durante envío.
- `frontend/app/(app)/venta/page.tsx`: confirmación y recuperación, preservando cambios staged previos.
- `frontend/src/lib/sales/retrospectiveSale.ts` y `frontend/src/services/sales.ts`: intentos y contrato.
- `backend/test/reservations-concurrency.e2e-spec.ts`: integración ampliada sobre pruebas previas.
- `frontend/src/lib/sales/retrospectiveSale.test.cjs`, `frontend/src/components/reservations/ReservationSlotPicker.test.cjs` y `frontend/src/components/sales/SalesChatComposer.test.cjs`: decisiones, componentes y payloads.
- `backend/scripts/test-retrospective-local.ps1`: runner aislado y comparación con HEAD.
- Este informe, capturas, resultados y salidas regeneradas de graphify-out.

## Reproducción y aislamiento

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-retrospective-local.ps1 -All
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test-retrospective-local.ps1 -BaselinePayroll -Port 55447
```

El runner copia fuentes sin `.env`, valida Docker local, crea PostgreSQL 16 exclusivo en loopback, aplica migraciones reales en una base `_test` y agrega `SactecTestEnvironment`. Autenticación usa `auth_stage1_test`, inicializado aisladamente. Restaura variables del proceso y detiene exclusivamente el contenedor creado. Devuelve código no cero si fallan tests, incluidos los fallos conocidos de nómina.

Slugs se ejecutó mediante `scripts/test-business-slugs-local.ps1` desde la copia aislada, pues exige puerto/base propios y fixtures de backfill. Frontend: `node --test` sobre todos los archivos de prueba fuera de node_modules/.next. Los logs y scripts temporales de navegador están referenciados en results.json.

**Migración preparada, no aplicada a GestionMVP ni producción.** Será necesaria antes de usar este backend contra otra base. No hubo cambios de configuración, commits ni despliegues. Las copias/evidencias y contenedores detenidos quedan disponibles para inspección.

Graphify: actualización AST completada, 4889 nodos y 12631 relaciones, sin llamadas LLM (0 tokens de API). El extractor SQL no está instalado; las 93 migraciones se verificaron ejecutándolas en PostgreSQL aislado, no mediante el grafo.
