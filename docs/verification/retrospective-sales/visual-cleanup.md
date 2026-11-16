# Limpieza visual final de Nueva Venta

## Archivos modificados en esta iteración

- `frontend/src/components/reservations/ReservationSlotPicker.tsx`: eliminado solamente el párrafo informativo sobre disponibilidad histórica.
- `frontend/src/components/sales/SalesChatComposer.tsx`: bloque retrospectivo oculto mediante condición interna desactivada; JSX, estado y validaciones conservados. Nueva Venta usa la duración del servicio seleccionado del catálogo, sin aplicar el estado de duración retrospectiva oculto. La edición conserva su duración existente.
- `frontend/src/components/reservations/ReservationSlotPicker.test.cjs`: ausencia del mensaje.
- `frontend/src/components/sales/SalesChatComposer.test.cjs`: campo y etiqueta ausentes; duración enviada y recibida por el calendario al alternar servicios de 60/90 minutos y fechas anteriores/futuras.
- Este informe y capturas; actualización de artefactos Graphify.

## Resultados

- Todas las pruebas frontend (`.test.cjs` y `.test.ts`): **196 aprobadas**, ninguna fallida ni omitida.
- TypeScript frontend (`tsc --noEmit --incremental false`): aprobado.
- Chrome aislado, escritorio 1280×900 y móvil 390×844: formulario real con respuestas simuladas; ambos bloques ausentes, sin huecos residuales ni desbordamiento horizontal, selección punteada conservada, sin errores de página. Envío con `durationMinutes: 60` y sin declaración automática de prestación.
- Las pruebas existentes de confirmación explícita, cancelación y recuperación idempotente pasaron dentro de la suite frontend. No se modificó su implementación.
- `git diff --check`: aprobado.
- Graphify actualizado: 4909 nodos y 12651 relaciones. Persiste el aviso del entorno por ausencia de `tree_sitter_sql`: las migraciones SQL no se indexan. El grafo de código se regeneró correctamente.

No se modificaron backend, Prisma, productos, Nómina ni Factus. Se preservaron los cambios anteriores, sin commits, despliegues ni acceso a GestionMVP, producción o Railway.

## Limitación

La revisión visual utiliza CSS compilado existente y respuestas simuladas; no es una integración de extremo a extremo con base de datos. No hay problemas funcionales pendientes encontrados en esta corrección.

![Escritorio](desktop-cleanup.png)
![Móvil](mobile-cleanup.png)
