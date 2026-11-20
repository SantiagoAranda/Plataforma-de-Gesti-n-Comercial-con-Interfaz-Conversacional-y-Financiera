# F1.3 — Categorías inteligentes: implementación local para revisión

Fecha: 20/11/2026. Rama: `Fase1`. Base: `aba1ee8`. Sin commits, staging, push, merge, rebase, migraciones ni despliegue.
`develop` (`0519ab6`) y el stash `stash@{0}` (de develop) no se tocaron.

## Alcance

Implementado:
- **Usadas recientemente** en el paso 1 del selector de categoría.
- **Sugerencia por nombre** en el paso 1 del selector.

No implementado (pendiente de autorización independiente):
- **Otra subcategoría dentro de una categoría fija.** El contrato de F1.1 la rechaza
  (`backend/src/items/item-catalog.ts`, rama de categoría fija; `frontend/src/lib/itemForm.ts`, `validateCatalog`).
  Requeriría cambiar ese contrato en backend y frontend y agregar la opción en el paso 2. No necesita migración.

Backend: sin cambios.

## Archivos

Creado:
- `frontend/src/lib/itemCategorySuggestions.ts`: reglas, `suggestCategory()`, `recentCategories()`.
- `docs/verification/f1.3/README.md`.

Modificados (solo puntos de integración):
- `frontend/src/components/mi-negocio/ItemCategoryPicker.tsx`: props opcionales `name` y `recentItems`; tarjeta de sugerencia y chips de recientes en el paso 1.
- `frontend/src/components/mi-negocio/ItemCatalogFields.tsx`: reenvía `name` y `recentItems`.
- `frontend/src/components/mi-negocio/ItemFormContent.tsx`: prop opcional `recentItems`.
- `frontend/app/(app)/mi-negocio/page.tsx`: pasa su lista `items` (`recentItems={items}`).
- `frontend/src/hooks/useItemForm.test.cjs`: 7 pruebas nuevas.
- `docs/verification/f1.2-b/README.md`: nota de estado (commits existentes); el registro histórico se conserva.
- `graphify-out/*`: regenerado con `graphify update .`.

`useItemForm.ts`, `itemForm.ts`, `itemCategories.ts`, fotos, inventario, precio, IVA, badges, horarios y duración: sin cambios.

## Funcionamiento

### Usadas recientemente

- Fuente: los ítems guardados del negocio activo que Mi Negocio ya carga (`GET /items?status=ACTIVE&lightweight=true`,
  restringido al negocio por el backend; la caché del frontend está separada por sesión).
- **Representa las categorías de ítems guardados o modificados recientemente, no un historial exacto de clics.**
  Editar cualquier campo de un ítem actualiza su `updatedAt` y adelanta su categoría.
- Orden por `updatedAt` descendente; hasta 4 combinaciones distintas.
- Incluye categorías fijas con subcategoría y sin subcategoría. Excluye «Otra categoría», ítems sin categoría e IDs que ya no existan.
- La lista se toma al abrir el selector: si la lista de ítems se refresca mientras está abierto, los chips no se mueven.
  Los recientes solo se muestran; no modifican el formulario abierto.
- Un clic confirma la combinación completa, limpia `customCategoryName`/`customSubcategoryName` y cierra solo el selector (el foco vuelve al disparador).
- Sin tablas, endpoints ni `localStorage`.
- `ItemFormModal` no recibe la lista (no tiene consumidores activos): ahí no aparecen recientes.

### Sugerencia por nombre

- Las 18 reglas `CATEGORY_KEYWORDS` del prototipo (`docs/archivos-interfaz/Nuevo Productos Ajustes.html`), convertidas a IDs de `ITEM_CATEGORIES`.
- Coincidencia por palabra completa sobre texto normalizado (minúsculas, sin acentos), con plural simple `s`/`es`.
  Las raíces del prototipo (`panader*`, `congelad*`, …) se marcan explícitamente con `*` y solo coinciden al inicio de una palabra.
- Se evalúan todas las reglas: coincidencias en categorías distintas → sin sugerencia;
  una categoría con varias subcategorías → solo la categoría; nombres de menos de 3 caracteres → sin sugerencia.
- Se ajustó un término: se quitó `alcohol` de la regla de licores, porque «Alcohol antiséptico» sugería Licores.
- Exclusiones explícitas (`unless`) para falsos positivos comprobados; si aparece uno de esos términos, la regla no aplica:
  - Despensa y Granos: `dental`, `diente` («Pasta dental», «Pasta de dientes»).
  - Aceites, Salsas y Condimentos: `clase`, `baile`, `bailar` («Clases de salsa»).
  - Mascotas: `hidraulico`, `mecanico`, `tonelada*` («Gato hidráulico», «Gato mecánico»).
  Los casos legítimos se mantienen: «Pasta corta», «Salsa de tomate», «Arena para gato».
- Se muestra como una tarjeta «Sugerida para «nombre»» en el paso 1, **solo cuando no hay categoría elegida**.
  Nunca se aplica sola y no puede reemplazar una selección manual o guardada. «Sin categoría» sigue disponible.
- Sin consultas externas ni IA.

### Diseño

Se conservan el modal ascendente, los indicadores de dos etapas, los iconos, la búsqueda por etapa, «Sin categoría» en primer lugar,
la selección sin subcategoría, el ciclo de Tab, Escape y la restauración del foco.
Sugerencia y recientes siguen el prototipo (tarjeta con degradado y chips horizontales con icono) y se ocultan mientras hay búsqueda.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `node --test src/hooks/useItemForm.test.cjs` (frontend) | 22 pruebas, 22 aprobadas, 0 fallidas (14 previas + 8 nuevas) |
| Los 22 archivos `*.test.cjs` del frontend | 0 fallidas en todos (`PublicStoreClient.test.cjs` informa 0 pruebas, igual que antes) |
| `npx tsc --noEmit` frontend | sin errores |
| `npx tsc --noEmit` backend | sin errores |
| `npx jest src/items` backend | 4 suites, 35 pruebas aprobadas |
| `npx eslint` (sin `--fix`) sobre los 5 archivos frontend tocados | 4 errores y 3 advertencias, **idénticos a HEAD** (`page.tsx` 43, 69, 126, 231, 234; `<img>` en `ItemFormContent.tsx`). Ninguno nuevo. |
| `npx eslint src/items` (sin `--fix`) backend | 111 hallazgos preexistentes; backend sin cambios |

Pruebas nuevas:
1. Recientes: orden por `updatedAt`, límite 4, deduplicación, exclusión de «Otra», IDs inválidos, subcategoría de otra categoría y sin categoría; la lista original no se modifica.
2. Las 18 reglas apuntan a IDs existentes.
3. Sugerencias: palabra completa (Aguacate, Pantalón, Ronda, Petaca → nada), acentos (JAMÓN), plurales (Panes), raíces (Panadería),
   ambigüedad entre categorías (Crema de leche, Alimento para perro → nada), varias subcategorías (Café con leche → solo categoría),
   nombres cortos.
4. Sugerencia en el modal para PRODUCT y SERVICE: no se aplica antes del clic; el clic guarda el par con los nombres personalizados en null;
   solo un PATCH; ninguna escritura en `localStorage`.
5. Una categoría guardada no muestra sugerencia y se conserva al guardar.
6. Chips recientes: par completo en un clic, limpieza de los nombres de «Otra categoría», categoría sin subcategoría, ocultos durante la búsqueda,
   ciclo de Tab, foco devuelto al disparador, sin escrituras en `localStorage`.
7. Mi Negocio pasa sus ítems guardados al selector.
8. Regresión de falsos positivos: «Pasta dental», «Pasta de dientes», «Clases de salsa», «Gato hidráulico», «Gato mecánico» → nada;
   «Pasta corta», «Salsa de tomate», «Arena para gato» siguen sugiriendo; ningún término excluido coincide con un término de su propia regla.

Lint: el nuevo `itemCategorySuggestions.ts` no tiene hallazgos; los hallazgos de los demás archivos tocados son los mismos que en HEAD (anteriores a F1.3).

## Revisión visual

**Pendiente.** La extensión Claude in Chrome no estaba conectada en ninguno de los dos intentos del 20/11/2026.
Falta comprobar en escritorio y en móvil:
- la apertura ascendente;
- la ubicación de «Usadas recientemente» y el desplazamiento horizontal de los chips;
- la tarjeta de sugerencia con nombres largos;
- la búsqueda y la selección rápida;
- Escape, Tab y la restauración del foco;
- que no haya desbordamiento horizontal;
- productos y servicios.

Escape, Tab, restauración del foco, ocultamiento durante la búsqueda y la selección rápida en productos y servicios ya están cubiertos con JSDOM, pero eso no reemplaza la revisión de la disposición en pantalla.

## Riesgos pendientes

- Las reglas cubren sobre todo alimentos, más aseo, belleza y mascotas. En otros rubros no hay sugerencia.
  Las exclusiones solo cubren los casos comprobados; puede haber otros falsos positivos. Siempre es una propuesta que el usuario debe aceptar.
- «Usadas recientemente» depende de la lista de Mi Negocio (solo ítems activos). En otras pantallas con formulario no aparece.
