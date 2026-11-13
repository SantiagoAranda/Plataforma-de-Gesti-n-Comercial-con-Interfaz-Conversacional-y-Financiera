# Continuación del selector de estados — 13 de noviembre de 2026

## Estado inicial y alcance

Rama `Fase1`, HEAD `e005caa`. El árbol ya tenía 49 archivos versionados modificados, además de archivos nuevos: migraciones, pruebas, componentes, documentación y cachés. Había cambios previos en backend, frontend y Graphify; no eran exclusivamente del selector. No se atribuye la autoría de todos esos cambios a Claude.

El diff existente de `frontend/src/components/sales/SalesChatComposer.tsx` era de 15 líneas agregadas y 3 eliminadas. Se confirmó la implementación descrita: `isBookingForm` usa `requiresAgenda` en creación y `commercialPolicyVersion === 2` en edición; sustituye el selector por «Atención: Confirmado» en la misma celda y envía `PENDIENTE` al crear una cita. Las ventas históricas conservan el selector. Su texto visible anterior es «Pendiente / Confirmado», con valores internos `PENDIENTE / CERRADO`.

No se modificó este componente ni ninguna regla de producción durante esta continuación.

## Validación visual: NO realizada

La consulta real a las herramientas de navegador devolvió una lista vacía de navegadores y `The browser access host is unavailable`. También estaba indisponible el canal de aplicaciones nativas. Chrome no fue accesible en esta sesión.

| Caso | Escritorio Chrome | Móvil Chrome |
| --- | --- | --- |
| Producto: selector y disposición | Pendiente por navegador inaccesible | Pendiente por navegador inaccesible |
| Cita v2: etiqueta, alineación y espacio | Pendiente | Pendiente |
| Edición v1/v2 | Pendiente | Pendiente |
| Cambio producto/servicio, agregar/quitar | Pendiente | Pendiente |
| Superposiciones, scroll, distribución responsive | Pendiente | Pendiente |

No se generaron capturas ni se afirma ausencia de defectos visuales. JSDOM verifica comportamiento del componente; no calcula el diseño real. Al constatar el bloqueo no se levantaron servidores web QA ni se hizo un recorrido completo Chrome → API → PostgreSQL. La integración de base se probó separadamente.

## Comportamiento comprobado

- **Producto:** el componente real conserva ambos botones y entrega el estado elegido, tipo PRODUCTO y ningún horario.
- **Servicio con turno:** reemplaza ambos botones por la etiqueta; guardar sin horario se rechaza. Incluso después de elegir CERRADO en un producto y quitarlo, la cita se envía PENDIENTE. Quitar la cita y agregar producto restaura el selector.
- **Creación mixta:** el catálogo filtra por tipo y el manejador rechaza otro ítem cuando hay servicio. No se agregó una nueva modalidad mixta.
- **Servicio sin turno:** este formulario no permite crearlo sin fecha y hora. En el backend, sólo un único servicio manual con `scheduledAt` entra en la clasificación que crea el espejo; las otras órdenes no se identifican como reservas v2 por contener un servicio. No se cambió esa clasificación.
- **Órdenes ambiguas en edición:** fixtures sin versión de reserva, mixtas en ambos órdenes de ítems y servicio sin turno, conservaron el selector. No se probó su guardado como un flujo nuevo.
- **Edición v1/v2:** v1 conserva botones; v2 muestra la etiqueta. Los payloads mantienen estado comercial, estado de reserva, versión y precio unitario pactado, aunque el catálogo tenga otro precio.
- **PostgreSQL:** aprobaron los casos existentes de creación manual Order SENT + Reservation CONFIRMED v2 sin movimientos ni documentos fiscales; finalización explícita del espejo con registro comercial una sola vez; edición y reprogramación conservando estado, versión e identidad; preservación de precio en reserva independiente.

El selector de horarios se sustituye por un control de fixture en las nueve pruebas nuevas; éstas no certifican disponibilidad real, fechas pasadas ni layout del calendario. No se modificó la restricción de fechas pasadas ni se implementó finalización automática.

## Pruebas ejecutadas

| Suite | Línea base reportada | Resultado de esta continuación |
| --- | --- | --- |
| Frontend CJS | 172/172 | Los mismos 172 aprobados |
| Agenda TypeScript | No incluida en 172 | 2/2 |
| Nuevas pruebas de SalesChatComposer | No existían | 9/9 |
| Frontend total final | — | 183/183 |
| Backend Jest, 58 suites | 1004 aprobadas, 2 fallos | 1004 aprobadas, 2 fallos; 4 snapshots aprobados |
| PostgreSQL aislado | 82 aprobadas, 3 fallos | 82 aprobadas, 3 fallos, sin omitidas |
| git diff --check | — | Sin errores |

Comandos: `node --test` con los archivos `*.test.cjs` y `*.test.ts` del frontend; `node node_modules/jest/bin/jest.js --runInBand --json` en backend; `node test/run-reservations-isolated.cjs` en backend. Las pruebas unitarias se ejecutaron con DATABASE_URL dirigido a un puerto inactivo, no a GestionMVP. No se hizo build ni una nueva ejecución de las 148 rondas del diagnóstico de carrera; se ejecutó una vez el runner de regresión existente.

Los dos fallos backend coinciden con los documentados previamente: proyección del panel de régimen simple (esperaba 480000 y obtiene 0), y `manual-verification` caso 9 (`findUnique` sobre referencia PUC no simulada). Los tres de `sales-flow` también coinciden: dos fixtures sin stock al confirmar y detalle contable que esperaba «venta» y obtiene «contrapartida producto - test product». La suite general no está verde; no se corrigieron fallos fuera del alcance ni se atribuyen al selector.

El fallo original de concurrencia permanece **intermitente y no reproducido**, según el diagnóstico entregado y esta regresión. No apareció un nuevo fallo equivalente para capturar; no se cambiaron manejadores de errores.

## Aislamiento y limpieza

El runner verificó contenedor PostgreSQL 16 nuevo, base vacía, almacenamiento tmpfs y publicación sólo en loopback 55433. Aplicó migraciones exclusivamente a sus bases `reservations_b1_test` y `reservations_compat_test`. Terminó eliminando su contenedor; se verificó que no quedara el contenedor ni el listener 55433.

Los procesos habituales siguieron escuchando en 3000 (PID 10628) y 3001 (PID 23096), iguales a los observados al inicio. No se tocaron sus configuraciones ni GestionMVP. Sin commits, despliegues, cambios en Factus ni funcionalidades nuevas.

## Archivos de esta continuación y pendientes

- Nuevo `frontend/src/components/sales/SalesChatComposer.test.cjs`: nueve regresiones sobre el componente real y sus payloads, con catálogo y componentes secundarios simulados.
- Nuevo informe `docs/verification/selector-estados-2026-11-13.md`.
- Salidas y cachés de `graphify-out/`, actualizadas con `graphify update .` conforme a AGENTS.md. La herramienta informó que no dispone de `tree_sitter_sql`; la actualización AST no amplía la verificación SQL. Las migraciones sí fueron ejecutadas por el runner aislado.

No hubo correcciones de producción: no se detectaron regresiones funcionales en los casos ejercitados. Queda pendiente la validación visual real en Chrome de todos los casos de la tabla, incluida la interacción con horarios reales y la verificación responsive. El cambio no debe presentarse como visualmente aprobado.
