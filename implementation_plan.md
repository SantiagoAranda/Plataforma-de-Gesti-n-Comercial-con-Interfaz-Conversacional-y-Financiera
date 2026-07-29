# Plan de Auditoría y Robustecimiento de Precios de Venta

Auditaremos y reforzaremos la consistencia de precios en todo el ciclo de vida de las ventas (creación, edición manual, recargo por opciones, cambios de catálogo y confirmación contable/fiscal) asegurando que **el precio histórico de la venta jamás sea sobrescrito por cambios posteriores en el catálogo**.

---

## 📊 Resumen de la Auditoría Actual

| Punto de Auditoría | Estado Actual | Acción a Realizar |
| :--- | :--- | :--- |
| **1. Frontend envía `unitPrice`** | ⚠️ Omitido en payload | Agregar `unitPrice: it.price` en `cleanedItems` de `SalesChatComposer` y `SaleCreateModal`. |
| **2. DTO de líneas acepta `unitPrice`** | ❌ Falta en `SalesOrderLineInputDto` | Añadir `@IsOptional() @IsNumber() unitPrice?: number` en `order-line-input.dto.ts`. |
| **3. `OrderItem.unitPrice` se persiste** | ⚠️ Sobrescrito por `Item.price` | En `sales.service.ts`, respetar `input.unitPrice` enviado si está presente. |
| **4. Al reabrir se toma precio de línea** | ✅ Implementado | `it.unitPrice ?? (it.price / it.qty)` en `SalesChatComposer`. |
| **5. Confirmar usa líneas persistidas** | ✅ Implementado | `confirmSale` usa los `order.items` persistidos. |
| **6. TaxService recibe `unitPrice`** | ✅ Implementado | `TaxService` recibe `cartItem.unitPrice` en preview y freeze. |
| **7. AccountingService usa `unitPrice`** | ✅ Implementado | `AccountingService` calcula débitos/créditos sobre `unitPrice`. |
| **8. Opciones no se suman 2 veces** | ✅ Implementado | El `optionsTotal` se calcula sobre la configuración de la línea. |
| **9. Cambiar `Item.price` no altera venta** | ⚠️ Parcial | Falta advertencia UI y botón "Actualizar al precio actual" / "Mantener precio". |
| **10. Venta confirmada histórica** | ✅ Implementado | Ventas en `CERRADO` son inmutables. |

---

## 🛠️ Cambios Propuestos

### Backend

#### [MODIFY] [order-line-input.dto.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/dto/order-line-input.dto.ts)
- Agregar `@IsOptional() @IsNumber() unitPrice?: number;` al DTO de entrada de líneas de venta (`SalesOrderLineInputDto`).

#### [MODIFY] [sales.service.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/sales.service.ts)
- En `resolveOrderLines`:
  - Si `input.unitPrice` viene presente y es mayor a 0, utilizar ese valor como `unitPrice` final de la línea.
  - Calcular correctamente los snapshots:
    - `baseUnitPriceSnapshot`: `input.unitPrice != null ? (input.unitPrice - optionsTotal) : item.price`.
    - `optionsTotalSnapshot`: `resolvedOptions.optionsTotal`.
    - `finalUnitPriceSnapshot`: `unitPrice`.
    - `lineTotalSnapshot`: `unitPrice * input.quantity`.

#### [NEW] [sales-price-history.spec.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/sales-price-history.spec.ts)
- Agregar suite completa de pruebas automatizadas en backend cubriendo:
  1. Producto sin opciones y mismo precio.
  2. Precio editado manualmente al alza.
  3. Precio editado manualmente a la baja.
  4. Opción con recargo sin doble suma.
  5. Cambio de precio en catálogo posterior a la creación de la venta.
  6. Preservar precio histórico al reabrir/confirmar.
  7. Actualización explícita al precio actual.
  8. Cantidad mayor a 1.
  9. Subtotal idéntico en preview, snapshot, neto recibido e ingresos.
  10. Confirmación balanceada con IVA.
  11. Confirmación balanceada con ReteFuente/ReteICA.
  12. Confirmación balanceada con ReteIVA.
  13. Reversión limpia en fallos dentro de la transacción.

---

### Frontend

#### [MODIFY] [SalesChatComposer.tsx](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/frontend/src/components/sales/SalesChatComposer.tsx)
- En `handleSave`: incluir `unitPrice: it.price` en la lista `cleanedItems` enviada al backend al crear o editar una venta.
- En la interfaz de edición de ítems de venta pendiente:
  - Detectar si el precio actual de catálogo del producto (`businessItem.price + optionsTotal`) difiere del precio registrado de la línea (`it.price`).
  - Renderizar banner no bloqueante de advertencia cuando exista discrepancia:
    > "El precio actual del producto es **$523.739**, pero esta venta conserva el precio registrado de **$500.000**."
  - Proporcionar las 2 acciones:
    - **Mantener precio de la venta** (opción por defecto).
    - **Actualizar al precio actual** (actualiza el precio de la línea al precio de catálogo actual).

#### [MODIFY] [SaleCreateModal.tsx](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/frontend/src/components/sales/SaleCreateModal.tsx)
- En `handleSave`: incluir `unitPrice: it.price` en la lista `cleanedItems`.

---

## 🧪 Plan de Verificación

### Pruebas Automatizadas
Ejecutar la suite de pruebas unitarias/integración de ventas e impuestos:
- `npx jest src/sales/sales-price-history.spec.ts`
- `npx jest src/tax/tax.service.spec.ts`
- `npx tsc --noEmit` en frontend y backend.

### Verificación Manual
1. **Crear venta manual**: Seleccionar un producto con precio $500.000, editar su precio a $523.739 y guardar.
2. **Cambiar precio en catálogo**: Cambiar el precio del producto en inventario a $600.000.
3. **Reabrir la venta pendiente**: Verificar que mantiene $523.739 y muestra la advertencia no bloqueante con las dos opciones.
4. **Confirmar venta**: Confirmar la venta sin actualizar precio y verificar que la entrada contable e impuestos cuadren exactamente sin desbalance.
