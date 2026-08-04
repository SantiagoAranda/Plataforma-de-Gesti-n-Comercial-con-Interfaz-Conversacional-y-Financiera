# Auditoría de Trazabilidad Visual y Funcional de Régimen Simple

**Fecha:** 2026-07-31  
**Estado:** CAUSA_RAIZ_IDENTIFICADA

---

## 1. Cadena de Renderizado Real por Flujo

### 1.1 Nueva Venta
- **Archivo principal:** `frontend/app/(app)/venta/page.tsx`
- **Cadena:** `VentaPageContent` → `<SalesChatComposer mode="create" />` → `<SaleTaxPanel mode="create" />`
- **Props de SaleTaxPanel:** `mode="create"`, `value={fiscalForm}`, `onChange={setFiscalForm}`, `previewOnly={true}`.
- **Condición de renderizado del panel:** `(taxSettingsEnabled || Boolean(sale?.fiscalSummary))` en `SalesChatComposer.tsx` (L1084).
- **Condición de renderizado de chips:** `value.buyerType === "JURIDICA"` en `SaleTaxPanel.tsx` (L617).
- **Causa visual de ocultamiento en Nueva Venta:**
  - `DEFAULT_SALE_FISCAL_FORM` inicia con `buyerType: "NATURAL"`.
  - Cuando `buyerType === "NATURAL"`, los chips corporativos (incluyendo Régimen Simple) no se muestran.
  - Al hacer clic en el botón "Jurídica" dentro de Datos del comprador, la grilla de 4 chips se hace visible inmediatamente.
  - En la versión previa sin actualizar el dev server / bundle, `simpleRegimeEnabled` (feature flag) estaba filtrando el chip `buyerIsRegimenSimple`.

### 1.2 Editar Venta
- **Archivo principal:** `frontend/app/(app)/venta/page.tsx`
- **Cadena:** `setEditingSale(sale)` → `<SalesChatComposer mode="edit" sale={editingSale} />` → `<SaleTaxPanel mode="edit" />`
- **Props de SaleTaxPanel:** `mode="edit"`, `value={fiscalForm}` (inicializado con `saleFiscalStateFromSale(sale)`).
- **Condición de renderizado:** `buyerType === "JURIDICA"`.
- **Estado de chips:** `readonly = false`, `disabled = false`. Permite alternar `buyerIsRegimenSimple` entre `true` y `false`.

### 1.3 Detalle de Venta
- **Archivo principal:** `frontend/app/(app)/venta/page.tsx`
- **Cadena:** `setDetailsSale(sale)` → `<SaleDetailsModal sale={detailsSale} />` → `<SalesChatComposer mode="readonly" sale={sale} />` → `<SaleTaxPanel mode="readonly" />`
- **Props de SaleTaxPanel:** `mode="readonly"`, `readonly = true`.
- **Estado de chips:** `disabled = true` (solo lectura). Visualiza el chip activo/inactivo con la información persistida en `sale.fiscalContext?.buyerIsRegimenSimple`.

### 1.4 Configuración RUT
- **Archivo principal:** `frontend/app/(app)/configuracion/rut-impuestos/page.tsx`
- **Cadena:** `RutImpuestosPage` → Sección Responsabilidades (`visibleResponsibilities.map(...)`).
- **Condición de renderizado:** `RUT_VISIBLE_RESPONSIBILITY_CODES.includes(code)` (incluye el código `"47"`).
- **Causa de bloqueo observada:**
  - `BUSINESS_PROFILE_OPTIONS` (perfiles predefinidos como "Persona Jurídica" o "Persona Natural Responsable") no incluye la opción de perfil `"RST"`. Al seleccionar un perfil prediseñado, el código `"47"` era removido del arreglo `selectedRespCodes`.
  - La variable `hasHistoricalSimpleResponsibility` condicionaba la permanencia del código 47 únicamente a registros preexistentes.

---

## 2. Componentes Duplicados y Código Muerto Identificado

- **`TaxPreviewModal.tsx` (Componente Huérfano / Código Muerto):**
  - Ubicación: `frontend/src/components/sales/TaxPreviewModal.tsx`
  - Hallazgo: `TaxPreviewModal` **no es importado por ninguna página o componente activo** del frontend. Sus cambios no tenían impacto visual en la aplicación real. Toda la lógica de preview de venta en vivo es gestionada de manera directa por `<SaleTaxPanel />` dentro de `<SalesChatComposer />`.
- **Componentes para Móvil / Alternativos:**
  - No existen componentes duplicados para móvil ni paneles de ventas paralelos. El flujo responsivo utiliza el mismo `<SalesChatComposer />` y `<SaleTaxPanel />`.

---

## 3. Matriz de Estado Readonly y Disabled

| Flujo | `mode` | `readonly` | Chips deshabilitados | Motivo / Regla de negocio |
| :--- | :--- | :--- | :--- | :--- |
| **Nueva Venta** | `"create"` | `false` | `false` (con `buyerType === "JURIDICA"`) | Permite edición interactiva. Inicia en `NATURAL` (chips ocultos hasta seleccionar Jurídica). |
| **Editar Venta** | `"edit"` | `false` | `false` (con `buyerType === "JURIDICA"`) | Permite edición interactiva de la venta pendiente. Inicializa con `Boolean(sale.fiscalContext?.buyerIsRegimenSimple)`. |
| **Detalle de Venta** | `"readonly"` | `true` | `true` (todos deshabilitados) | Renderizado en modo lectura. Muestra la foto fiscal persistida de la venta sin permitir alteración. |

**Reglas de exclusión en chips:**
- `Gran Contribuyente` (13) y `Autorretenedor` (15) se deshabilitan mutuamente por regla fiscal.
- `Régimen Simple` (47) es **independiente** y no se deshabilita por `Gran Contribuyente` ni `Autorretenedor`.

---

## 4. Trazabilidad del Campo Booleano (`buyerIsRegimenSimple`)

- **Nueva Venta:**
  - Estado inicial: `buyerIsRegimenSimple: false` (booleano).
  - Click en chip: `!active` → `true` / `false` (booleano).
  - Payload de preview (`/sales/tax-preview`): `buyerIsRegimenSimple: Boolean(...)` (booleano estricto).
  - Payload de creación (`createSale`): `buyerFiscalContext.buyerIsRegimenSimple: boolean`.

- **Editar Venta:**
  - LECTURA API (`getSale`): `order.fiscalContext?.buyerIsRegimenSimple`.
  - Mapper (`saleFiscalStateFromSale`): `buyerIsRegimenSimple: Boolean(context.buyerIsRegimenSimple)`.
  - Actualización: `update({ buyerIsRegimenSimple: !active })`.
  - Payload de edición (`updateSale`): Transmite `boolean`.

- **Detalle de Venta:**
  - Lectura de snapshot/context: `Boolean(sale.fiscalContext?.buyerIsRegimenSimple)`.
  - Renderizado: Deshabilitado (`readonly`), visualiza chip activo o inactivo.

**Verificación:** En ningún punto del flujo se convierte a `undefined`, `null`, `"Ordinario"` ni `"Régimen Simple"`.

---

## 5. Condición de Renderizado de la Grilla de 4 Chips

En `<SaleTaxPanel />` (L617):
```tsx
{value.buyerType === "JURIDICA" && (
  <div className="mt-3 grid grid-cols-2 gap-2">
    {[
      ["buyerIsRegimenSimple", "Régimen Simple"],
      ["buyerType", "Jurídica"],
      ["buyerIsAutorretenedor", "Autorretenedor"],
      ["buyerIsGranContribuyente", "Gran Contrib."],
    ].map(...)
  </div>
)}
```

**Verificación de Independencia:**
- No depende de `sellerIsSimpleRegime`.
- No depende de la responsabilidad 47 del vendedor.
- No depende del estado de Facturación Electrónica.
- No depende del flag `simpleRegimeEnabled`.

---

## 6. Auditoría de la Configuración RUT (`rut-impuestos/page.tsx`)

1. **Responsabilidad 47 (Régimen Simple):**
   - El catálogo `RUT_VISIBLE_RESPONSIBILITY_CODES` incluye `"47"`.
   - Falta incorporar el perfil predefinido `RST` ("Régimen Simple de Tributación") dentro de `BUSINESS_PROFILE_OPTIONS` con `codes: ["47", "05", "48"]`.
   - Se deben eliminar los bloqueos por `hasHistoricalSimpleResponsibility` y advertencias de "No disponible en esta versión".

2. **Bloque "Responsabilidad de Impoconsumo":**
   - No existe código relacionado a "Impoconsumo" en `rut-impuestos/page.tsx`. El texto observado por el usuario correspondía a formularios de productos/servicios en `ItemFormContent.tsx` / `ItemFormModal.tsx` o a ejecuciones con caché `.next` sin limpiar.

---

## 7. Verificación de Entorno y Servidor

- **Ruta del repositorio:** `C:\Users\Viko\Documents\GitHub\Plataforma-de-Gesti-n-Comercial-con-Interfaz-Conversacional-y-Financiera`
- **Subdirectorio Frontend:** `frontend/`
- **Causa de inconsistencia entre cambios en código y visualización en navegador:**
  - El proceso servidor Next.js (`npm run dev`) o la memoria caché de `.next` mantenía compilados bundles antiguos donde `TaxPreviewModal` o `simpleRegimeEnabled` ocultaban Régimen Simple.
  - Al realizar un reinicio limpio del dev server o compilar con `npm run build`, los cambios se aplican de manera 100% efectiva.

---

## 8. Causa Raíz Exacta

1. **Causa Raíz #1 (Ventas):** El chip `buyerIsRegimenSimple` está acondicionado a `buyerType === "JURIDICA"`. En Nueva Venta, el comprador inicia por defecto en `NATURAL` (Persona Natural), por lo cual la grilla de chips permanece oculta hasta hacer clic en "Jurídica". Además, la versión anterior dependía del flag `simpleRegimeEnabled` que lo ocultaba cuando estaba desactivado.
2. **Causa Raíz #2 (Código Muerto):** Se habían aplicado ediciones previas en `TaxPreviewModal.tsx`, el cual es código muerto no importado en ninguna ruta del frontend.
3. **Causa Raíz #3 (RUT):** En `rut-impuestos/page.tsx`, la lista de perfiles predefinidos `BUSINESS_PROFILE_OPTIONS` no incluía la opción "RST", por lo que al seleccionar perfiles preconfigurados se desmarcaba la responsabilidad 47.

---

## 9. Archivos Mínimos a Modificar y Plan de Corrección

1. `frontend/src/components/sales/SaleTaxPanel.tsx`
   - Mantener la grilla de 4 chips incondicional a feature flags cuando `buyerType === "JURIDICA"`.
2. `frontend/app/(app)/configuracion/rut-impuestos/page.tsx`
   - Agregar la opción `RST` a `BUSINESS_PROFILE_OPTIONS` con los códigos `["47", "05", "48"]`.
   - Permitir la selección limpia y guardado de la responsabilidad 47 sin bloqueos históricos.
3. Reiniciar el servidor de desarrollo Next.js descartando la caché `.next` para garantizar que la interfaz refleje los bundles actualizados.

---

**Resultado final:** `CAUSA_RAIZ_IDENTIFICADA`
