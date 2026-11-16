# Corrección de sugerencias históricas — 16/11/2026

## Resultado

Se reemplazó el recorrido fijo de 24 horas cada 15 minutos por `computeSlots`, utilizando las ventanas efectivas de `loadRange`. Las ventanas propias reemplazan a las generales conforme a la herencia existente; se respetan días, ventanas múltiples, intervalo, duración completa y límites. Sin ventanas aplicables no hay sugerencias. Para hoy se combinan inicios anteriores a la hora actual con las franjas futuras existentes, en America/Bogota.

Las ventanas actuales son una referencia, no evidencia de disponibilidad histórica. Las validaciones transaccionales no cambiaron: el backend sigue aceptando la hora exacta histórica compatible, verifica bloqueos y solapamientos y exige confirmación explícita para finalizar. No se modificaron creación/finalización atómica, recuperación idempotente, estados ni política v2.

Se conserva el diseño de botones. Se quitó «Pasado» y se ocultó el campo exacto mediante `SHOW_HISTORICAL_EXACT_TIME = false`, conservando su JSX, handler y validación. El flujo de botones limpia selecciones ausentes tras actualizar las sugerencias y no agrega horas artificiales. El texto explica el carácter orientativo de las franjas.

## Archivos de esta corrección

- `backend/src/availability/availability.service.ts`
- `backend/src/availability/availability.service.spec.ts`
- `backend/test/reservations-concurrency.e2e-spec.ts` (expectativas de sugerencias; conservada prueba de creación exacta 00:17)
- `frontend/src/components/reservations/ReservationSlotPicker.tsx`
- `frontend/src/components/reservations/ReservationSlotPicker.test.cjs`
- Este informe, README y capturas; artefactos derivados en `graphify-out/`.

Todos los cambios anteriores del árbol y del índice se preservaron. Sin commits, despliegues ni acceso a GestionMVP, producción o Railway.

## Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| Frontend, todos los archivos `.test.cjs` | 193 aprobadas |
| Frontend, `serviceAgenda.test.ts` | 2 aprobadas |
| Selector, repetición tras mejorar prueba de fecha futura manual | 4 aprobadas |
| TypeScript frontend, `tsc --noEmit --incremental false` | Aprobado |
| TypeScript backend, `tsc --noEmit -p tsconfig.build.json` | Aprobado |
| Backend completo, Jest | 58 suites, 1017 pruebas y 4 snapshots aprobados |
| PostgreSQL aislado, suite completa `reservations-concurrency` | 89 pruebas aprobadas |
| Chrome aislado, 1280×900 y 390×844 | Aprobado; sin desbordamiento horizontal ni errores de página |
| `git diff --check` | Aprobado |

Cobertura nueva: 08:00–11:00, ventanas partidas, herencia general y precedencia específica, días distintos y cerrados, ausencia de ventanas, duración real de 90 minutos con intervalo de 30, bloqueos y solapamientos, mezcla de hoy sin duplicados y rechazo público de fechas anteriores. Frontend verifica selección, estilos punteados, ausencia de «Pasado» y campo exacto, navegación anual, futuro manual y actualización por servicio/fecha/duración. Las suites existentes mantienen confirmación/cancelación, reintentos, rollback, stock y contabilidad.

La integración usó `backend/scripts/test-retrospective-local.ps1 -TestPattern '.'`, con copia sin archivos .env y un PostgreSQL 16 nuevo, local y exclusivo. Evidencia: `C:/Users/Viko/AppData/Local/Temp/retrospective-bd432da5789a474b91b4f60d082616bc/postgres-integration.log`. Contenedor detenido al terminar. El runner conserva `--forceExit` por handles existentes de Jest; todas las aserciones pasaron.

## Alcance de la revisión visual

Chrome renderizó el componente real con CSS compilado existente y respuestas simuladas para las franjas 08:00, 09:00 y 10:00. Se verificaron selección, bordes, navegación al año anterior, campo exacto oculto y restricción pública. No fue un recorrido de Nueva Venta conectado al PostgreSQL de integración; ambos niveles se probaron por separado. No se repitieron las integraciones ajenas a reservas (por ejemplo Nómina/Factus), porque esta corrección no las modifica.

![Escritorio](desktop-historical-slots.png)
![Móvil](mobile-historical-slots.png)
