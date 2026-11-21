# Bloque 2.1.2 — estados visuales y menú de servicios

Implementado sobre el árbol de trabajo del Bloque 2.1, todavía sin commit. No se modificaron backend, Prisma, migraciones, DTOs, enums, endpoints ni reglas comerciales. Sin despliegue, datos reales o Bloque 2.2.

## Archivos de este bloque

- `frontend/src/lib/sales/salePresentation.ts`: helper compartido `getSaleBadge`, diagnóstico `useSaleBadge` y comprobación de capacidades `canUseSaleAction`.
- `frontend/src/components/sales/CardActionsMenu.tsx`: contenedor del menú con el estilo existente, portal, posicionamiento y teclado.
- `frontend/src/components/sales/SaleCard.tsx`: badge operativo y acciones del turno en los tres puntos; elimina encabezado redundante.
- `frontend/src/components/sales/SalesList.tsx`: conecta los handlers de la página con las tarjetas.
- `frontend/src/components/sales/SaleDetailsModal.tsx`: mismo badge, sin leyendas permanentes de atención/bloqueo; encabezado adaptable a pantallas estrechas.
- `frontend/src/components/sales/FiscalDocumentMenu.tsx`: extensión de presentación opcional para colocar las acciones del turno delante de las opciones fiscales en un único menú. Condiciones, estados y callbacks fiscales conservados; productos usan la variante anterior.
- `frontend/app/(app)/venta/page.tsx`: handlers compartidos de apertura de finalización y editor/reprogramación; conecta cancelación y archivado existentes.
- `frontend/src/components/sales/salePresentation.test.cjs`: pruebas nuevas de badges, tarjetas, menú, geometría, teclado y compatibilidad fiscal.
- `frontend/app/(app)/venta/cancelReservation.test.cjs`: regresiones e integración con los handlers y servicios reales de Ventas.
- Este informe, logs de verificación y archivos generados por `graphify update .`.

Los otros cambios de backend/frontend visibles en `git status` corresponden al Bloque 2.1 previo y no se deben atribuir a este bloque. Se compararon hashes de los archivos backend versionados al inicio y al final: ninguna diferencia adicional.

## Selección del badge

El DTO ya identifica explícitamente los espejos mediante `reservationStatus` no nulo en una fila ORDER. Se reconoce únicamente un valor válido en ORDER o RESERVATION. No se consulta el tipo de los ítems ni se deduce prestación a partir de CERRADO.

| reservationStatus | Badge | Tokens reutilizados |
|---|---|---|
| PENDING | Pendiente | Ámbar |
| CONFIRMED | Confirmado | Azul |
| COMPLETED | Finalizado | Esmeralda |
| CANCELLED | Cancelado | Rosa/rojo suave |

Un ORDER sin reserva conserva su presentación comercial/fiscal anterior. Productos, servicios sin agenda y operaciones mixtas sin asociación no reciben un badge operativo. Un estado inválido conserva el estilo comercial compatible. Si una RESERVATION carece de estado válido, o un ORDER devuelve un valor no nulo inválido, se registra `INVALID_RESERVATION_STATUS` en consola, con ID y sourceType, sin datos del cliente.

No se cambiaron los valores de `Sale.status` ni los filtros o totales. «Finalizado» es exclusivamente una etiqueta visual. Se eliminaron «Atención: Confirmada/Finalizada» y el motivo permanente de bloqueo de Finalizar en el encabezado del detalle.

## Acciones y recorridos

Para filas con reserva explícita, el menú muestra en este orden:

1. **Finalizar atención**, con `complete`: abre el diálogo existente, casilla desmarcada y POST con `serviceProvided: true`. Abrir el menú no ejecuta ninguna mutación.
2. **Reprogramar**, con `reschedule`: abre el editor existente `SalesChatComposer`, con su `ReservationSlotPicker` y disponibilidad actuales. Guarda mediante `updateSale` y PATCH `/sales/:id?sourceType=...`, que es el recorrido de edición/reprogramación ya utilizado por Ventas.
3. **Cancelar reserva**, con `cancel`: reutiliza diálogo y handler de cancelación. ORDER se envía como ORDER; nunca como reserva independiente para cancelar el espejo.
4. **Editar** y **Eliminar**, cuando están presentes sus capacidades y handlers vigentes; **Ver detalles** permanece disponible.

Las opciones fiscales y «Ver factura» se conservan. Si la tarjeta tiene documento fiscal, el estado fiscal se muestra separado del badge operativo y sus opciones siguen en el mismo menú. No se alteró ninguna decisión sobre emisión, reintento, nota crédito o reversión.

Se mantienen las restricciones existentes de la interfaz y del backend. No se crean permisos para reprogramar una confirmada: sin `reschedule`, no aparece. Sin capacidades no se infieren mutaciones. Los botones conservados en el detalle usan la misma comprobación de `allowedActions`, y finalización/cancelación/editor comparten handlers con la tarjeta. Eliminar continúa siendo archivado lógico; se conservan «Eliminar» y «Venta eliminada».

Después de una operación se recarga el listado. Los conflictos siguen mostrando el error backend y refrescando los datos; no se reintenta automáticamente. Si las capacidades cambian mientras el menú está abierto, se actualizan sus botones con el nuevo registro.

## Interacción móvil y accesibilidad

El menú del turno sale por portal a `document.body`, con posición fija, ancho limitado al viewport, altura máxima y scroll propio. Se reposiciona al desplazar/redimensionar y se cierra si el disparador sale de pantalla. El z-index está por encima de barras/filtros y por debajo de los diálogos de decisión; elegir una acción cierra el menú antes de abrir el siguiente flujo.

Disparador y opciones del turno tienen objetivos táctiles de al menos 44 px. Cierre al tocar fuera, Escape y selección; se puede reabrir inmediatamente. Se mueve el foco al abrir; flechas, Inicio/Fin y Tab permiten navegar/salir. No se agregó una fila de acciones debajo de las tarjetas ni una pantalla nueva.

## Verificación

| Comprobación | Resultado |
|---|---|
| Línea base frontend del árbol inicial | 134/134 |
| Suite frontend final completa | 167/167 |
| TypeScript `tsc --noEmit` | Aprobado |
| `npm run build` frontend | Aprobado |
| `git diff --check` | Sin errores |
| Hashes backend antes/después | Sin cambios adicionales |
| Graphify | Actualizado |

Las pruebas cubren los cuatro estados para independientes/espejos, productos y servicios sin reserva, fallback, eliminación de encabezados, capacidades individuales/ausentes, cambio de capacidades con menú abierto, portal, teclado, cierre/reapertura, declaración explícita, recarga posterior, cancelación ORDER y editor para ambos sourceType. Se comparan las opciones fiscales con y sin prefijo operativo para los ocho estados fiscales.

Se verificó el cálculo de posición en viewports de 320, 375, 390 y 430 px, cerca de los extremos superior/inferior. Son pruebas de geometría y JSDOM: **no certifican renderizado, ausencia de solapamientos o legibilidad real**.

El navegador se consultó en esta sesión y devolvió `The browser access host is unavailable`. Queda pendiente la revisión visual real móvil/escritorio. No se alteraron registros para probar el diseño.

Durante las pruebas, una expectativa anterior exigía «Finalizada» en el detalle. Se actualizó a «Finalizado», el texto pedido expresamente en este bloque. La suite final no tiene fallos. Los mensajes de error que aparecen en el log de pruebas corresponden a escenarios deliberados de 400/404/409/500 y red.

Evidencias: `baseline.log`, `frontend-tests.log`, `typescript.log`, `build.log`, `graphify.log`. Comandos: `node --test` con todos los archivos frontend `*.test.cjs` (excluyendo dependencias/build); desde frontend, `node node_modules/typescript/bin/tsc --noEmit` y `npm run build`.

No quedan cambios funcionales pendientes de este alcance. La comprobación visual indicada es la limitación de validación pendiente. No se continuó con otros bloques.
