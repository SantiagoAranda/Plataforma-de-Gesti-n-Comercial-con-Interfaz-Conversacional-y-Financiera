# F1.2-B — implementación local para revisión

Fecha: 19/11/2026. Rama: Fase1. HEAD: 16ac7cf698795b088d87a20500daaef072df22dd.
Sin commits, staging, push, merge, rebase ni despliegue. develop permanece en ese mismo hash.

> **Estado actualizado (20/11/2026):** el texto de arriba describe el momento de la entrega y se conserva como registro histórico.
> F1.2-A y F1.2-B quedaron confirmadas en `Fase1` con el commit `3608738` («Primera version frontend: Modulo Ventas»);
> las correcciones visuales de Mi Negocio, en `aba1ee8`. `develop` está en `0519ab6` y no contiene esos commits.
> Los resultados de pruebas registrados abajo no se volvieron a modificar. Continuación: `docs/verification/f1.3/README.md`.

## Archivos

Modificados por F1.2-B:
- frontend/app/(app)/mi-negocio/page.tsx
- frontend/src/components/mi-negocio/ItemFormContent.tsx
- frontend/src/components/mi-negocio/ItemFormModal.tsx
- frontend/src/components/mi-negocio/MiNegocioChatComposer.tsx

Creados:
- frontend/src/hooks/useItemForm.ts
- frontend/src/hooks/useItemForm.test.cjs
- frontend/src/lib/itemForm.ts
- frontend/src/lib/itemCategories.ts
- frontend/src/components/mi-negocio/ItemCategoryPicker.tsx
- frontend/src/components/mi-negocio/ItemCatalogFields.tsx
- docs/verification/f1.2-b/README.md
- docs/verification/f1.2-b/lint.json

También se regeneraron los artefactos graphify-out/ requeridos por AGENTS.md.
Los archivos modificados y sin seguimiento anteriores de F1.2-A se compararon por SHA-256 antes/después: sin cambios fuera de graphify-out/. Esto incluye frontend/src/types/item.ts y todo el backend local de F1.2-A.

## Componentes y funcionamiento

ItemFormContent sigue siendo la presentación compartida. MiNegocioChatComposer conserva el acceso desde +, búsqueda, descripción y envío. ItemFormModal no se eliminó: mantiene su interfaz y reutiliza ItemPanelLayout, pero ahora delega estado y guardado en useItemForm. No se encontraron consumidores activos del modal en el proyecto.

El controlador único:
- Crea/edita por los endpoints existentes; no contiene operaciones de venta, orden ni cotización.
- Carga GET /items/:id antes de editar (la lista lightweight sólo trae una foto).
- Descarta cargas tardías; los alias edit, editItem e itemId abren el mismo recorrido.
- Bloquea doble envío mediante ref y estado.
- Conserva compresión de imágenes, máximo de cinco fotos y límite de selección de 2 MB del recorrido activo. El modal ahora comparte esa política (antes usaba el límite general de 5 MB).
- Mantiene el ID cuando se creó el ítem y falló una foto. Retira las subidas/eliminaciones exitosas de los pendientes; sólo reintenta los fallos conocidos. Reconcilia el detalle incluso con subidas parcialmente fallidas.
- Si falla recuperar el detalle después de guardar, mantiene abierto el formulario para reintentar, sin recrear el ítem.
- Libera object URLs al retirar imágenes, resetear o desmontar.
- Conserva inventario, badges y atributos fiscales del recorrido existente.

Datos abre inicialmente; IVA y Código QR son pestañas accesibles mediante botones y flechas de teclado. Cambiar pestaña no persiste ni limpia valores. Los errores de validación llevan a Datos o IVA según corresponda. Los campos se bloquean durante el envío.

Los diez atributos de F1.1 están conectados:
- visibleInCatalog se invierte en «No mostrar en catálogo»; no se escribe status.
- publishWithoutPrice conserva el precio interno obligatorio y la validación existente de importe mayor a cero.
- includeInQuotation conserva quotationDescription al desactivarse.
- quotationDescription independiente (400 caracteres), Usar nombre y accesos Incluye/Medidas/Garantía/Entrega. Vista previa React local con precio o Consultar precio.
- brand (80), barcode textual (64, ASCII visible sin espacios, ceros iniciales preservados).
- categoryId, subcategoryId, customCategoryName y customSubcategoryName se envían juntos. Nombres personalizados sólo bajo otra y de hasta 60 caracteres.
- Selector de dos pasos: 28 categorías, 203 subcategorías, Otra categoría y selección sin subcategoría. Sin búsqueda avanzada, sugerencias ni recientes.

La descripción general se unificó en 300 caracteres para nuevas entradas. Al cargar descripciones históricas más largas no se recortan automáticamente.

La duración utiliza horas * 60 + minutos enteros; minutos entre 0 y 59 y mínimo existente de cinco minutos. Accesos de 15/30/45/60/90/120. Se conservan los horarios propios y sus estructuras; no se añadieron agenda opcional, sin cita, horarios compartidos, festivos ni lógica retrospectiva.

IVA presenta los controles fiscales existentes con su habilitación por negocio. No se copió el catálogo tributario demostrativo del prototipo. Código QR sólo informa su disponibilidad futura; no genera, imprime ni escanea.

## Contratos y alcance

No se modificaron backend, DTO, endpoints, schema, migraciones, Reservas v2 ni transacciones comerciales en esta intervención. El catálogo frontend replica exactamente el backend y tiene una prueba de paridad. Los tipos públicos nullable y consumidores de F1.2-A permanecen intactos.

No se implementaron F1.3, F1.4, F1.5–F1.8 ni Fase 3. No se levantaron bases ni se tocaron bases compartidas.

## Validación ejecutada

- TypeScript frontend: node node_modules/typescript/bin/tsc --noEmit --incremental false — aprobado.
- TypeScript backend: mismo comando con -p tsconfig.build.json — aprobado.
- Frontend general: node --test con los archivos *.test.cjs de src/app — 213/213 aprobadas.
- Suite focalizada useItemForm.test.cjs: 11/11 (incluidas en las 213).
- Ruta con corchetes ejecutada además por patrón app/tienda/*/PublicStoreClient.test.cjs — 3/3 aprobadas: carrito mixto/WhatsApp sin efectos, cambio de visibilidad y respuesta fiscal tardía. Los conteos de ejecuciones pueden solaparse.
- Backend Jest: 61/61 suites, 1059/1059 pruebas, 4/4 snapshots.
- git diff --check: aprobado.
- ESLint de los nueve archivos TS/TSX afectados/nuevos, sin --fix: comparación en lint.json. Antes: 9 errores y 19 warnings en los cuatro existentes; ahora: 4 errores y 3 warnings, todos preexistentes. Los cinco archivos TS/TSX nuevos: cero errores y warnings. No se presenta el lint completo como aprobado.

Las once pruebas nuevas cubren paridad de categorías; validación de catálogo y duración; detalle completo/fotos; preservación de precio, inventario, badges e impuestos; duraciones 15/45/75/95 y agenda sin cambios; fallo parcial de fotos y doble envío; respuestas de edición tardías; pestañas/preview sin escritura; categorías fijas y personalizadas; los tres alias y la tarjeta real de Mi Negocio; creación de servicio; y conservación del texto al desactivar inclusión en cotización.

Los tests de frontend usan JSDOM y API simulada. No equivalen a un recorrido HTTP completo contra una base real. No se repitieron las pruebas PostgreSQL de F1.2-A porque no se modificó backend; sus resultados históricos están en el informe de F1.2-A.

## Revisión visual y riesgos pendientes

Computer Use no está disponible: falló la conexión al native pipe (error 2). No se realizó revisión visual móvil/escritorio ni se inventaron capturas. Queda pendiente comprobar altura, teclado móvil, desplazamiento, fotos y selector en navegador real.

El gate de lint conserva deuda preexistente en la página (efectos, Date.now durante render, prefer-const) y warnings de imágenes HTML. No hay nuevos diagnósticos en el código agregado.

Los reintentos eliminan duplicaciones de operaciones cuyo éxito fue recibido. Una respuesta de subida perdida después de que el servidor la persistió sigue dependiendo del contrato existente, que no aporta una clave de idempotencia por imagen; no se amplió backend para cubrir ese caso.

Persisten los pendientes generales de F1.2-A: revisión visual, evaluación de lint y revisión final de concurrencia. F1.2-B no los da por cerrados.

## Dictamen

F1.2-B implementada localmente y apta para revisión de código y aceptación funcional. No corresponde declarar F1.2 lista para integración definitiva hasta completar la revisión visual y cerrar los pendientes de F1.2-A/lint. No se integró ni se hizo commit automáticamente.
