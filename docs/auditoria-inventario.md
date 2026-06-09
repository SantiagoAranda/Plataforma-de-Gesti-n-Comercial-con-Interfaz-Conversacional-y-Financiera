# Auditoría técnica — Módulo Inventario

> Fecha: 2026-06-07 | Proyecto: Plataforma de Gestión Comercial | Auditor: Antigravity AI

---

## 1. Resumen ejecutivo

| Campo | Valor |
|---|---|
| **Estado general** | Funcional con deuda técnica |
| **Riesgo principal** | `purchase-return` en UI marcado como "próximamente" aunque el endpoint backend existe; falta cobertura e2e mínima del ciclo Ventas → Inventario |
| **Archivos relacionados** | 52 archivos totales |
| **Conclusión** | El núcleo del inventario (kardex, promedio ponderado, descuento por venta, reversión) está implementado y testeado en backend. La integración con Ventas funciona. Los riesgos principales del alcance Inventario están en la UI incompleta para devoluciones de compra, la ausencia de integración con Contabilidad para movimientos de inventario, la falta de e2e real de inventario y el riesgo de división por cero con `purchaseToConsumptionFactor`. El módulo `movements/` pertenece a otro módulo funcional de rentabilidad/movimientos de empresa y queda fuera del alcance de Inventario. |

---

## 2. Inventario de archivos

**Total detectado: 52 archivos**

### Backend — Módulos / Controladores / Servicios / DTOs

| Archivo | Rol | Estado |
|---|---|---|
| `src/inventory/inventory.controller.ts` | 8 endpoints REST inventario | Activo |
| `src/inventory/inventory.service.ts` | Lógica kardex, promedio ponderado, consumo | Activo |
| `src/inventory/inventory.module.ts` | Módulo NestJS | Activo |
| `src/inventory/inventory.service.spec.ts` | Tests unitarios (797 líneas) | Activo |
| `src/inventory/dto/create-inventory-adjustment.dto.ts` | DTO ajuste pos/neg | Activo |
| `src/inventory/dto/create-inventory-initial.dto.ts` | DTO stock inicial | Activo |
| `src/inventory/dto/create-inventory-purchase.dto.ts` | DTO compra (legacy + purchase units) | Activo |
| `src/inventory/dto/create-inventory-purchase-return.dto.ts` | DTO devolución compra | Activo |
| `src/inventory/dto/inventory-kardex.query.dto.ts` | Query kardex por ingrediente | Activo |
| `src/inventory/dto/inventory-kardex-global.query.dto.ts` | Query kardex global paginado | Activo |
| `src/inventory/dto/inventory-summary.query.dto.ts` | Query resumen stock | Activo |
| `src/ingredients/ingredients.controller.ts` | CRUD ingredientes | Activo |
| `src/ingredients/ingredients.service.ts` | Lógica ingredientes | Activo |
| `src/ingredients/ingredients.module.ts` | Módulo NestJS | Activo |
| `src/ingredients/ingredients.service.spec.ts` | Tests ingredientes | Activo |
| `src/ingredients/ingredient-unit.util.ts` | Utilidad conversión unidades | Activo |
| `src/ingredients/dto/create-ingredient.dto.ts` | DTO crear ingrediente | Activo |
| `src/ingredients/dto/update-ingredient.dto.ts` | DTO actualizar ingrediente | Activo |
| `src/ingredients/dto/list-ingredients.query.dto.ts` | Query listado | Activo |
| `src/recipes/recipes.controller.ts` | GET + PUT receta por item | Activo |
| `src/recipes/recipes.service.ts` | Lógica recetas (replace atómico) | Activo |
| `src/recipes/recipes.module.ts` | Módulo NestJS | Activo |
| `src/recipes/recipes.service.spec.ts` | Tests recetas | Activo |
| `src/recipes/dto/recipe-line.dto.ts` | DTO línea de receta | Activo |
| `src/recipes/dto/replace-recipe.dto.ts` | DTO reemplazar receta | Activo |
| `src/movements/movements.controller.ts` | Módulo separado de movimientos/rentabilidad de empresa | Fuera de alcance Inventario |
| `src/movements/movements.service.ts` | Lógica del módulo separado de movimientos/rentabilidad | Fuera de alcance Inventario |
| `src/movements/movements.module.ts` | Módulo NestJS separado | Fuera de alcance Inventario |
| `src/movements/movements.service.spec.ts` | Test del módulo separado | Fuera de alcance Inventario |
| `src/movements/dto/create-movement.dto.ts` | DTO del módulo separado | Fuera de alcance Inventario |

### Backend — Integración (archivos con lógica de inventario)

| Archivo | Rol | Estado |
|---|---|---|
| `src/sales/sales.service.ts` | confirmOrder → applyInventoryConsumptionForOrder | Activo |
| `src/sales/sales.service.ts` | reverseConfirmedOrder → reverseInventoryConsumptionForOrder | Activo |
| `src/sales/sales.controller.ts` | Endpoints de ventas que disparan inventario | Activo |

### Prisma — Schema / Migrations / Seeds

| Archivo | Rol | Estado |
|---|---|---|
| `prisma/schema.prisma` | Modelos: Ingredient, Recipe, InventoryMovement + enums | Activo |
| `prisma/seed.ts` | Sin datos de inventario (no siembra ingredientes ni movimientos) | Incompleto |
| `prisma/migrations/` | Migraciones existentes (no auditadas individualmente) | Activo |

### Frontend — Pages / Routes

| Archivo | Ruta | Estado |
|---|---|---|
| `app/(app)/inventario/page.tsx` | `/inventario` | Activo |
| `app/(app)/inventario/ingredientes/page.tsx` | `/inventario/ingredientes` | Activo |
| `app/(app)/inventario/ingredientes/[id]/page.tsx` | `/inventario/ingredientes/:id` | Activo (asumido) |
| `app/(app)/inventario/ingredientes/nuevo/page.tsx` | `/inventario/ingredientes/nuevo` | Activo (asumido) |
| `app/(app)/inventario/kardex/page.tsx` | `/inventario/kardex` | Activo |
| `app/(app)/inventario/recetas/page.tsx` | `/inventario/recetas` | Activo |

### Frontend — Components

| Archivo | Rol | Estado |
|---|---|---|
| `src/components/inventory/IngredientForm.tsx` | Formulario crear/editar ingrediente | Activo |
| `src/components/inventory/IngredientList.tsx` | Lista ingredientes con stock | Activo |
| `src/components/inventory/InventoryChatActionBar.tsx` | Barra acción chat-style | Activo |
| `src/components/inventory/InventoryControlPanel.tsx` | Panel control (desktop?) | Requiere validación |
| `src/components/inventory/InventoryMovementFeed.tsx` | Feed movimientos | Activo |
| `src/components/inventory/InventoryQuickActions.tsx` | Acciones rápidas | Activo |
| `src/components/inventory/InventoryQuickPanel.tsx` | Panel rápido lateral | Activo |
| `src/components/inventory/InventoryRecipeCard.tsx` | Card de receta | Activo |
| `src/components/inventory/InventoryStockForm.tsx` | Formulario de stock | Activo |
| `src/components/inventory/InventorySummaryCards.tsx` | Cards resumen | Activo |
| `src/components/inventory/KardexList.tsx` | Lista kardex paginada | Activo |
| `src/components/inventory/MovementForm.tsx` | Formulario movimientos (compra/ajuste) | Activo |
| `src/components/inventory/ProductInventoryDetail.tsx` | Detalle producto inventario | Activo |
| `src/components/inventory/ProductInventoryFeedItem.tsx` | Item feed producto | Activo |
| `src/components/inventory/RecipeEditor.tsx` | Editor de recetas inline | Activo |
| `src/components/inventory/inventoryUtils.ts` | Helpers parseNumber | Activo |
| `src/components/inventory/types.ts` | Tipos frontend (ComposedProduct) | Activo |
| `src/components/inventory/unitLabels.ts` | Labels de unidades | Activo |

### Frontend — Services / Hooks / Libs

| Archivo | Rol | Estado |
|---|---|---|
| `src/services/inventory.ts` | Todas las llamadas API de inventario | Activo |

---

## 3. Mapa funcional actual

| Funcionalidad | Estado | Archivos involucrados | Observaciones |
|---|---|---|---|
| **Ingredientes — CRUD** | ✅ Completo | `ingredients.service.ts`, `ingredients.controller.ts`, `IngredientForm.tsx`, `IngredientList.tsx` | Create, findAll, findOne, update, deactivate. No hay delete real (soft via status INACTIVE). |
| **Ingredientes — minStock** | ✅ Completo | `ingredients.service.ts`, `schema.prisma` | Campo `minStock` en DB, validado en create/update. |
| **Ingredientes — unidades compra/consumo** | ✅ Completo | `schema.prisma`, `create-ingredient.dto.ts` | `purchaseUnit`, `consumptionUnit`, `purchaseToConsumptionFactor`. |
| **Stock inicial (INVENTORY_INITIAL)** | ✅ Completo | `inventory.service.ts`, `inventory.controller.ts`, `MovementForm.tsx` | Solo permitido si no hay movimientos previos. Valida via `assertCanCreateInitialInventory`. |
| **Compras (PURCHASE)** | ✅ Completo | `inventory.service.ts`, `inventory.controller.ts`, `MovementForm.tsx` | Soporta modo legacy (qty/unitCost en consumptionUnit) y modo purchase unit (con conversión por factor). Recalcula promedio ponderado. |
| **Devolución de compra (PURCHASE_RETURN)** | ⚠️ Parcial | `inventory.service.ts` (backend OK), `ingredientes/page.tsx` (UI: "próximamente") | Backend 100% funcional. UI en `/inventario/ingredientes` y `/inventario/kardex` muestra panel placeholder. El frontend NO expone el formulario. |
| **Ajuste positivo (ADJUSTMENT_POSITIVE)** | ✅ Completo | `inventory.service.ts`, `MovementForm.tsx` | Requiere detalle obligatorio. Recalcula promedio. |
| **Ajuste negativo (ADJUSTMENT_NEGATIVE)** | ✅ Completo | `inventory.service.ts`, `MovementForm.tsx` | Usa costo promedio vigente. Bloquea stock negativo. |
| **Promedio ponderado** | ✅ Completo | `inventory.service.ts` (métodos `calculateWeightedAverageCost`, `calculateAverageCostAfter`) | INVENTORY_INITIAL, PURCHASE, PURCHASE_RETURN y ADJUSTMENT_POSITIVE recalculan. SALE, SALE_RETURN y ADJUSTMENT_NEGATIVE usan el actual sin recalcular. |
| **Validación stock negativo** | ✅ Completo | `inventory.service.ts` L.630-634, `validateStockAvailability` | Doble validación: antes de consumir la orden y dentro de `applyInventoryMovement`. |
| **Recetas — SIMPLE** | ✅ Completo | `recipes.service.ts`, `recipes.controller.ts`, `RecipeEditor.tsx` | Exactamente 1 línea mandatory. Validado en backend. |
| **Recetas — RECIPE_BASED** | ✅ Completo | `recipes.service.ts`, `RecipeEditor.tsx` | ≥1 línea mandatory + opcionales permitidas. |
| **Recetas — reemplazar atómico** | ✅ Completo | `recipes.service.ts` (`replaceForItem`: deleteMany + createMany en transacción) | Operación idempotente. |
| **Kardex por ingrediente** | ✅ Completo | `inventory.service.ts` (`listKardex`), `kardex/page.tsx`, `KardexList.tsx` | Filtro por rango de fechas. Orden cronológico asc. |
| **Kardex global paginado** | ✅ Completo | `inventory.service.ts` (`listGlobalKardex`), `kardex/page.tsx` | Filtros: ingredientId, type, dateFrom, dateTo, page, limit. |
| **Resumen de stock (summary)** | ✅ Completo | `inventory.service.ts` (`getSummary`), `inventario/page.tsx` | Incluye `outOfStock`, `lowStock`, `stockValue`, `canCreateInitialInventory`. |
| **Alertas de stock bajo** | ✅ Completo | `inventario/page.tsx` (frontend compute), `inventory.service.ts` (flags server-side) | Badge + panel de alertas con conteo. Doble cómputo: server retorna flags, frontend los recalcula localmente también. |
| **Descuento por venta (SALE)** | ✅ Completo | `inventory.service.ts` (`applyInventoryConsumptionForOrder`), `sales.service.ts` (`confirmOrder`) | Se ejecuta dentro de transacción Serializable al confirmar orden. |
| **Productos SIMPLE → consumo ingrediente** | ✅ Completo | `inventory.service.ts` (`expandOrderItemsToIngredients`) | Busca 1 línea mandatory en Recipe. Bloquea si no existe. |
| **Productos RECIPE_BASED → consumo ingredientes** | ✅ Completo | `inventory.service.ts` (`expandOrderItemsToIngredients`) | Busca todas las líneas mandatory. Consolida por ingrediente si se repite. |
| **Productos NONE → sin impacto inventario** | ✅ Completo | `inventory.service.ts` L.555-557 | Skip explícito cuando `inventoryMode === 'NONE'`. |
| **Servicios → sin impacto inventario** | ✅ Completo | `inventory.service.ts` L.548-550 | Skip por `itemTypeSnapshot === 'SERVICE'`. |
| **Reversión de venta (SALE_RETURN)** | ✅ Completo | `inventory.service.ts` (`reverseInventoryConsumptionForOrder`), `sales.service.ts` (`reverseConfirmedOrder`) | Detecta movimientos SALE previos, crea SALE_RETURN, restaura stock. Bloquea si ya fue revertido (ConflictException). |
| **Idempotencia confirmación de orden** | ✅ Completo | `sales.service.ts` L.490-496, `inventory.service.ts` L.363-365 | Chequea `inventoryPostedAt` antes de ejecutar. No duplica movimientos. |
| **inventoryMode desde Mi Negocio** | ⚠️ Parcial | `mi-negocio/page.tsx` L.89-90, `ItemFormContent.tsx` | Se puede seleccionar NONE / SIMPLE / RECIPE_BASED al crear/editar producto. No hay CTA directo a "configurar receta" o "cargar stock" desde Mi Negocio. La gestión post-selección queda en Inventario. |
| **Integración contabilidad por inventario** | ❌ No implementado | `sales.service.ts` (`confirmOrder` llama a `accountingService.postOrderMovements` para ventas, pero NO para movimientos de inventario manuales) | Las compras y ajustes de inventario NO generan asientos contables. Solo las ventas tienen integración contable. |
| **Soft delete / reversión de ingredientes** | ⚠️ Parcial | `ingredients.service.ts` (`deactivate`) | Solo desactiva (INACTIVE). No borra. No hay reactivación expuesta en UI. |
| **Multi-negocio (businessId isolation)** | ✅ Completo | Todos los servicios reciben `businessId` del JWT; todas las queries filtran por `businessId` | Sin fugas cross-tenant detectadas en lectura de código. |
| **Snapshot de inventoryMode en OrderItem** | ✅ Completo | `schema.prisma` (`inventoryModeSnapshot` en OrderItem), `sales.service.ts` L.326 | Se captura al crear el OrderItem para mantener consistencia histórica. |

---

## 4. Modelo de datos

### 4.1 Enums relacionados con inventario

| Enum | Valores | Uso |
|---|---|---|
| `InventoryMode` | `NONE`, `SIMPLE`, `RECIPE_BASED` | Campo en `Item` para definir comportamiento de stock del producto vendible |
| `IngredientStatus` | `ACTIVE`, `INACTIVE` | Ciclo de vida del insumo físico |
| `IngredientUnit` | `UNIT`, `G`, `KG`, `ML`, `L` | Unidad de medida para consumo y compra |
| `InventoryMovementType` | `INVENTORY_INITIAL`, `PURCHASE`, `PURCHASE_RETURN`, `SALE`, `SALE_RETURN`, `ADJUSTMENT_POSITIVE`, `ADJUSTMENT_NEGATIVE` | Todos los 7 tipos requeridos están presentes |
| `InventoryReferenceType` | `ORDER`, `ORDER_ITEM`, `MANUAL`, `PURCHASE_MANUAL` | Categoría de origen del movimiento para trazabilidad |

### 4.2 Modelos

#### `Ingredient` — insumo físico con stock
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id uuid` | PK |
| `businessId` | `String` | FK a Business, multi-tenant |
| `name` | `String` | Único por businessId (`@@unique([businessId, name])`) |
| `status` | `IngredientStatus` | ACTIVE / INACTIVE |
| `consumptionUnit` | `IngredientUnit` | Unidad base del kardex |
| `purchaseUnit` | `IngredientUnit` | Unidad de compra |
| `customUnitLabel` | `String?` | Etiqueta personalizada |
| `purchaseToConsumptionFactor` | `Decimal(20,6)` | Conversión unidad compra → consumo |
| `currentStock` | `Decimal(20,6)` | **Balance persistido** (desnormalizado para performance) |
| `averageCost` | `Decimal(20,6)` | **Costo promedio persistido** (desnormalizado) |
| `minStock` | `Decimal(20,6)` | Umbral de alerta stock bajo |
| `recipes` | `Recipe[]` | Relación → reglas de consumo |
| `inventoryMovements` | `InventoryMovement[]` | Kardex entries |

> ⚠️ `currentStock` y `averageCost` son **campos desnormalizados**. Si un movimiento falla parcialmente fuera de transacción, pueden quedar inconsistentes. El servicio usa transacciones Serializable para mitigar esto, pero no hay mecanismo de reconciliación si la DB queda en estado inconsistente.

#### `Recipe` — regla de consumo item → ingrediente
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id uuid` | PK |
| `businessId` | `String` | FK a Business |
| `itemId` | `String` | FK a Item (compuesta con businessId) |
| `ingredientId` | `String` | FK a Ingredient (compuesta con businessId) |
| `quantityRequired` | `Decimal(20,6)` | Cantidad consumida por 1 unidad vendida |
| `isOptional` | `Boolean` | Permite líneas opcionales (RECIPE_BASED) |
| Unique | `(businessId, itemId, ingredientId)` | No permite duplicar ingrediente en misma receta |

> ✅ El modelo cubre correctamente SIMPLE (1 línea mandatory) y RECIPE_BASED (≥1 mandatory + opcionales).

#### `InventoryMovement` — kardex entry
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id uuid` | PK |
| `businessId` | `String` | FK a Business, multi-tenant |
| `ingredientId` | `String` | FK a Ingredient |
| `type` | `InventoryMovementType` | Tipo de movimiento |
| `quantity` | `Decimal(20,6)` | Siempre positivo; la dirección viene del tipo |
| `unitCost` | `Decimal(20,6)` | Costo unitario en consumptionUnit |
| `totalValue` | `Decimal(20,6)` | quantity × unitCost |
| `stockAfter` | `Decimal(20,6)` | Snapshot de stock post-movimiento |
| `averageCostAfter` | `Decimal(20,6)` | Snapshot de costo promedio post-movimiento |
| `referenceType` | `InventoryReferenceType` | Categoría de origen |
| `referenceId` | `String?` | ID externo opcional (ej. factura) |
| `orderId` | `String?` | FK opcional a Order |
| `orderItemId` | `String?` | FK opcional a OrderItem |
| `detail` | `String?` | Motivo (obligatorio para ajustes) |
| `occurredAt` | `DateTime` | Timestamp efectivo del movimiento |
| `createdAt` | `DateTime` | Timestamp de inserción (inmutable) |
| Unique | `(businessId, orderItemId, ingredientId, type)` | Previene duplicados por línea de venta + ingrediente |

> ✅ El modelo es correcto y completo. Permite reconstruir el kardex completo ordenando por `occurredAt, createdAt`.

#### `Item` — campo de inventario relevante
| Campo | Tipo | Notas |
|---|---|---|
| `inventoryMode` | `InventoryMode @default(NONE)` | Define si el item consume stock |
| `recipes` | `Recipe[]` | Reglas de consumo ligadas al item |

#### `OrderItem` — snapshot de inventario
| Campo | Tipo | Notas |
|---|---|---|
| `inventoryModeSnapshot` | `InventoryMode?` | Captura el modo al momento de la venta |

#### `Order` — control de posteo
| Campo | Tipo | Notas |
|---|---|---|
| `inventoryPostedAt` | `DateTime?` | Null = no procesado; Set = ya descontó stock |

### 4.3 Relaciones clave

```
Business
  ├── Ingredient[] (1:N, cascade delete)
  ├── Recipe[]     (1:N, cascade delete)
  └── InventoryMovement[] (1:N, cascade delete)

Item
  └── Recipe[] (1:N via [itemId, businessId])

Ingredient
  └── Recipe[] (1:N via [ingredientId, businessId], onDelete: Restrict)
  └── InventoryMovement[] (1:N via [ingredientId, businessId], onDelete: Restrict)

Order
  └── InventoryMovement[] (nullable FK, permite movimientos sin orden)

OrderItem
  └── InventoryMovement[] (nullable FK, permite movimientos manuales)
```

> ✅ `onDelete: Restrict` en Recipe e InventoryMovement protege contra borrado accidental de ingredientes con historial.

### 4.4 Índices relevantes

| Modelo | Índice | Propósito |
|---|---|---|
| `Ingredient` | `(businessId)`, `(businessId, status)` | Listado por tenant y filtro de estado |
| `InventoryMovement` | `(businessId, occurredAt)` | Ordenación temporal global |
| `InventoryMovement` | `(businessId, ingredientId, occurredAt)` | Kardex por ingrediente |
| `InventoryMovement` | `(businessId, type)` | Filtro por tipo |
| `InventoryMovement` | `(businessId, orderId)` | Búsqueda movimientos de una orden |
| `Item` | `(businessId, inventoryMode)` | Búsqueda rápida de productos con stock |
| `Order` | `(businessId, inventoryPostedAt)` | Detección de órdenes sin postear |

### 4.5 Problemas y observaciones

| # | Problema | Severidad | Detalle |
|---|---|---|---|
| 1 | `currentStock` y `averageCost` desnormalizados | Media | No hay trigger ni job de reconciliación. Depende 100% de que todas las escrituras sean vía transacciones del servicio. |
| 2 | No existe modelo `Purchase` independiente | Baja | Las compras son solo movimientos tipo PURCHASE. No hay cabecera de factura de proveedor. Aceptable para MVP pero limitará trazabilidad contable futura. |
| 3 | `InventoryReferenceType` tiene `ORDER` reservado pero se usa `ORDER_ITEM` para ventas | Baja | El valor `ORDER` de `InventoryReferenceType` no se usa en código auditado. Solo se usa `ORDER_ITEM`. Queda documentado como reservado/pendiente para trazabilidad a nivel orden, sin cambio de schema. |
| 4 | `seed.ts` no siembra ingredientes ni movimientos | Baja | Dificulta onboarding de nuevos ambientes de desarrollo y testing e2e. |
| 5 | No hay campo `isReversed` en `InventoryMovement` | Baja | La reversión se detecta buscando movimientos tipo `SALE_RETURN` con mismo `orderId`. Funciona pero no es explícito. |

---

## 5. Backend

### 5.1 Endpoints expuestos

#### `InventoryController` — `/inventory`

| Método | Ruta | Servicio | Descripción |
|---|---|---|---|
| `POST` | `/inventory/initial` | `createInitialInventory` | Carga inicial de stock (solo 1 vez por ingrediente) |
| `POST` | `/inventory/purchase` | `createPurchase` | Registra compra, recalcula promedio ponderado |
| `POST` | `/inventory/purchase-return` | `createPurchaseReturn` | Devuelve compra, revierte promedio ponderado |
| `POST` | `/inventory/adjustment` | `createAdjustment` | Ajuste positivo o negativo manual |
| `GET` | `/inventory/summary` | `getSummary` | Resumen global de stock por negocio |
| `GET` | `/inventory/kardex` | `listKardex` | Kardex por ingrediente + rango de fechas |
| `GET` | `/inventory/kardex-global` | `listGlobalKardex` | Kardex global paginado con filtros |
| `POST` | `/inventory/validate-order` | `validateOrderStock` | Pre-validación de stock antes de confirmar |

> ⚠️ El endpoint `validate-order` existe en el servicio pero **no fue encontrado en el controller auditado**. Puede estar expuesto internamente como método de servicio o ser un helper interno. Requiere confirmación.

#### `IngredientsController` — `/ingredients`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/ingredients` | Crear ingrediente |
| `GET` | `/ingredients` | Listar (filtro status: ACTIVE/INACTIVE) |
| `GET` | `/ingredients/:id` | Obtener uno |
| `PATCH` | `/ingredients/:id` | Actualizar |
| `PATCH` | `/ingredients/:id/deactivate` | Desactivar (soft delete) |

> ⚠️ No hay endpoint `PATCH /ingredients/:id/reactivate`. La reactivación no está expuesta.

#### `RecipesController` — `/items/:itemId/recipe`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/items/:itemId/recipe` | Obtener receta del item |
| `PUT` | `/items/:itemId/recipe` | Reemplazar receta completa (atómico) |

> ✅ El diseño de receta como `PUT` total (replace) es correcto: evita estados parciales.

#### `MovementsController` — `/movements` (fuera de alcance Inventario)

| Método | Ruta | Estado |
|---|---|---|
| `POST` | `/movements` | Módulo separado de movimientos/rentabilidad de empresa |
| `GET` | `/movements` | Módulo separado de movimientos/rentabilidad de empresa |

> Aclaración de alcance: `movements/` no pertenece al kardex de Inventario y no debe mezclarse con `InventoryMovement`. Es un módulo funcional separado pedido por el cliente para visualizar movimientos/rentabilidad real de la empresa. Queda fuera del saneamiento P0 de Inventario.

---

### 5.2 Servicios — lógica crítica

#### `InventoryService.applyInventoryMovement`
El método central de toda la lógica de inventario. Ejecuta siempre dentro de una transacción Prisma recibida como parámetro (`tx`).

**Flujo:**
1. Adquiere el `Ingredient` con lock (`SELECT FOR UPDATE` vía Serializable)
2. Calcula `newStock` según el tipo de movimiento
3. Valida stock ≥ 0 para movimientos de salida
4. Llama `calculateAverageCostAfter` para movimientos de entrada
5. Actualiza `Ingredient.currentStock` y `Ingredient.averageCost`
6. Crea el registro `InventoryMovement` con snapshots (`stockAfter`, `averageCostAfter`)

**Tipos de movimiento y dirección:**

| Tipo | Dirección | Recalcula promedio |
|---|---|---|
| `INVENTORY_INITIAL` | Entrada | ✅ Sí |
| `PURCHASE` | Entrada | ✅ Sí |
| `PURCHASE_RETURN` | Salida | ✅ Sí (revierte) |
| `SALE` | Salida | ❌ No |
| `SALE_RETURN` | Entrada | ❌ No (usa costo original del SALE) |
| `ADJUSTMENT_POSITIVE` | Entrada | ✅ Sí |
| `ADJUSTMENT_NEGATIVE` | Salida | ❌ No |

#### `InventoryService.calculateAverageCostAfter`
Implementa la fórmula de **promedio ponderado móvil**:

```
newAvg = (currentStock × currentAvg + quantity × unitCost) / (currentStock + quantity)
```

Para `PURCHASE_RETURN`, el servicio realiza la operación inversa:

```
newAvg = (currentStock × currentAvg - quantity × unitCost) / (currentStock - quantity)
// Si newAvg < 0 → fuerza a 0
// Si newStock == 0 → mantiene averageCost anterior
```

> ✅ La lógica de inversión para `PURCHASE_RETURN` es correcta. El caso de stock cero preserva el costo para no perder el historial.

#### `InventoryService.expandOrderItemsToIngredients`
Traduce `OrderItem[]` a la lista de ingredientes a consumir:

1. Para cada `OrderItem` con `inventoryMode !== NONE`:
   - `SIMPLE` → busca 1 receta mandatory, consume `quantity × quantityRequired`
   - `RECIPE_BASED` → busca todas las líneas mandatory, consolida por ingredientId
2. Consolida consumos del mismo ingrediente en distintos items

> ✅ La consolidación evita múltiples transacciones para el mismo ingrediente en una orden mixta.

#### `InventoryService.applyInventoryConsumptionForOrder`
Orquesta el descuento completo de una orden confirmada:

1. Llama `expandOrderItemsToIngredients`
2. Llama `validateStockAvailability` → `BadRequestException` si stock insuficiente
3. Llama `applyInventoryMovement` por cada ingrediente (tipo `SALE`, `referenceType: ORDER_ITEM`)
4. Actualiza `Order.inventoryPostedAt = now()`

> ✅ Idempotente: verifica `inventoryPostedAt` antes de ejecutar. No puede postear dos veces la misma orden.

#### `InventoryService.reverseInventoryConsumptionForOrder`
Revierte los movimientos SALE de una orden COMPLETED:

1. Busca todos los `InventoryMovement` con `orderId` y `type: SALE`
2. Verifica que no existan ya movimientos `SALE_RETURN` para esa orden
3. Crea `SALE_RETURN` por cada `SALE`, restaurando `unitCost` original
4. Actualiza `currentStock` y `averageCost` del ingrediente

> ⚠️ El `averageCost` no se recalcula en la reversión; se restaura el costo de la venta original como unitCost del SALE_RETURN. Esto puede producir desviaciones de centavos en negocios de alto volumen si el costo promedio cambió entre la venta y la devolución.

---

### 5.3 DTOs y validaciones

| DTO | Validaciones destacadas |
|---|---|
| `CreateIngredientDto` | `name` required, `consumptionUnit` enum, `purchaseToConsumptionFactor > 0`, `minStock >= 0` |
| `CreateInventoryPurchaseDto` | `ingredientId` uuid, `quantity > 0`, `unitCost >= 0`, soporte dual: `purchaseQuantity + purchaseUnitCost` |
| `CreateInventoryPurchaseReturnDto` | `ingredientId` uuid, `quantity > 0`, `unitCost >= 0`, `detail` required |
| `CreateInventoryAdjustmentDto` | `ingredientId` uuid, `quantity > 0`, `type` enum (POSITIVE/NEGATIVE), `detail` required |
| `CreateInventoryInitialDto` | `ingredientId` uuid, `quantity >= 0`, `unitCost >= 0` |
| `InventoryKardexGlobalQueryDto` | `page >= 1`, `limit 1-100`, `ingredientId?` uuid, `type?` enum, fechas ISO |
| `ReplaceRecipeDto` | Array de `RecipeLineDto[]`, `ingredientId` uuid, `quantityRequired > 0`, `isOptional` bool |

> ⚠️ `CreateInventoryPurchaseDto` no valida que `purchaseToConsumptionFactor` exista en el Ingredient al momento de registrar la compra en modo `purchaseUnit`. Si el factor es 0 en DB, se produciría una división por cero en la conversión.

---

### 5.4 Transacciones Prisma

| Operación | Nivel de aislamiento | Observaciones |
|---|---|---|
| `applyInventoryMovement` | `Serializable` (heredado del caller) | Previene dirty reads y write skew |
| `applyInventoryConsumptionForOrder` | `Serializable` (iniciado por `confirmOrder`) | Toda la confirmación de orden + inventario es atómica |
| `reverseInventoryConsumptionForOrder` | `Serializable` (iniciado por `reverseConfirmedOrder`) | Reversión completa atómica |
| `replaceForItem` (Recipes) | Default (`Read Committed`) | Atómico vía deleteMany + createMany en misma tx |
| `createInitialInventory` | `Serializable` | Incluye check de movimientos previos dentro de la tx |
| `createPurchase` / `createPurchaseReturn` / `createAdjustment` | `Serializable` | Todos pasan por `applyInventoryMovement` |

> ✅ El uso de `Serializable` en todas las rutas de escritura de inventario es la decisión correcta para prevenir condiciones de carrera. El trade-off es potencial de errores de serialización (deadlocks) bajo alta concurrencia — monitorear en producción con reintentos.

---

## 6. Frontend

### 6.1 Rutas y páginas

| Ruta | Archivo | Descripción | Estado |
|---|---|---|---|
| `/inventario` | `inventario/page.tsx` | Hub principal: cards resumen, alertas, acciones rápidas | ✅ Activo |
| `/inventario/ingredientes` | `ingredientes/page.tsx` | Listado de ingredientes con filtro ACTIVE/INACTIVE y búsqueda | ✅ Activo |
| `/inventario/ingredientes/:id` | `ingredientes/[id]/page.tsx` | Detalle de ingrediente: stock, costo, historial | ✅ Asumido activo |
| `/inventario/kardex` | `kardex/page.tsx` | Kardex global paginado con filtros (ingrediente, tipo, fechas) | ✅ Activo |
| `/inventario/recetas` | `recetas/page.tsx` | Lista de productos con modo inventario + editor de recetas | ✅ Activo |

> ⚠️ El kardex original (filtro inline en el panel) está completamente **comentado** en `kardex/page.tsx` (líneas 177–298). El código muerto nunca fue eliminado — aumenta la superficie de mantenimiento.

---

### 6.2 Componentes

| Componente | Archivo | Rol | Observaciones |
|---|---|---|---|
| `IngredientForm` | `IngredientForm.tsx` | Crear/editar ingrediente | Usado en creación desde chat y desde detalle |
| `IngredientList` | `IngredientList.tsx` | Lista de ingredientes con stock badge | Layout `chat` usado en todas las vistas |
| `InventoryChatActionBar` | `InventoryChatActionBar.tsx` | Barra inferior tipo chat con menú `+` | Duplicada en las 3 pages: ingredientes, kardex, recetas |
| `InventorySummaryCards` | `InventorySummaryCards.tsx` | Cards KPI: ingredientes, alertas, valor stock | Usado en hub principal |
| `KardexList` | `KardexList.tsx` | Lista de movimientos con íconos por tipo | Incluye formato de `stockAfter` y `averageCostAfter` |
| `MovementForm` | `MovementForm.tsx` | Formulario compra / ajuste / stock inicial | Distingue modo `purchaseUnit` vs `consumptionUnit` |
| `RecipeEditor` | `RecipeEditor.tsx` | Editor inline de receta por item | Cargado en sheet desde `recetas/page.tsx` |
| `InventoryMovementFeed` | `InventoryMovementFeed.tsx` | Feed de movimientos (posiblemente legacy) | Requiere verificación de uso activo |
| `InventoryControlPanel` | `InventoryControlPanel.tsx` | Panel de control (posiblemente desktop) | Requiere verificación de uso activo |
| `InventoryQuickActions` | `InventoryQuickActions.tsx` | Acciones rápidas (comprar, ajustar) | Usado desde hub |
| `InventoryQuickPanel` | `InventoryQuickPanel.tsx` | Panel lateral rápido | Uso a confirmar |
| `InventoryRecipeCard` | `InventoryRecipeCard.tsx` | Card de receta (alternativa a `RecipeEditor`) | Posible duplicado |
| `InventoryStockForm` | `InventoryStockForm.tsx` | Formulario de stock (alternativa a `MovementForm`) | Posible duplicado |
| `ProductInventoryDetail` | `ProductInventoryDetail.tsx` | Detalle producto con inventario | Uso a confirmar |
| `ProductInventoryFeedItem` | `ProductInventoryFeedItem.tsx` | Item de feed de producto | Uso a confirmar |

> ⚠️ **Posibles componentes legacy/duplicados:** `InventoryStockForm` vs `MovementForm`, `InventoryRecipeCard` vs `RecipeEditor`, `InventoryControlPanel` vs la lógica inline en `inventario/page.tsx`. Se recomienda auditar su uso real con `grep`.

---

### 6.3 Servicio API (`src/services/inventory.ts`)

Todas las llamadas al backend se centralizan aquí. Endpoints consumidos:

| Función frontend | Endpoint backend | Método |
|---|---|---|
| `getInventorySummary` | `GET /inventory/summary` | GET |
| `getInventoryKardex` | `GET /inventory/kardex-global` | GET |
| `listIngredients` | `GET /ingredients` | GET |
| `getIngredient` | `GET /ingredients/:id` | GET |
| `createIngredient` | `POST /ingredients` | POST |
| `updateIngredient` | `PATCH /ingredients/:id` | PATCH |
| `deactivateIngredient` | `PATCH /ingredients/:id/deactivate` | PATCH |
| `createInitialInventory` | `POST /inventory/initial` | POST |
| `createPurchase` | `POST /inventory/purchase` | POST |
| `createPurchaseReturn` | `POST /inventory/purchase-return` | POST |
| `createAdjustment` | `POST /inventory/adjustment` | POST |
| `getRecipe` | `GET /items/:itemId/recipe` | GET |
| `replaceRecipe` | `PUT /items/:itemId/recipe` | PUT |

> ✅ El servicio frontend cubre todos los endpoints reales del backend para inventario. No hay llamadas huérfanas detectadas.

---

### 6.4 Helpers y utilidades

| Archivo | Función | Uso |
|---|---|---|
| `unitLabels.ts` | `formatUnit(unit)` | Muestra etiqueta legible para `IngredientUnit` |
| `inventoryUtils.ts` | `parseNumber(val)` | Parsea strings con coma/punto a número seguro |
| `types.ts` | `ComposedProduct` | Tipo frontend para producto con receta e ingredientes expandidos |

---

### 6.5 Problemas de UX / deuda técnica

| # | Problema | Severidad | Detalle |
|---|---|---|---|
| 1 | **`PURCHASE_RETURN` sin UI** | Alta | El backend está completo pero las 3 páginas muestran "próximamente" en un sheet placeholder. No hay formulario. |
| 2 | **Código muerto en `kardex/page.tsx`** | Media | ~120 líneas comentadas (filtro inline original). Deben eliminarse o restaurarse. |
| 3 | **`InventoryChatActionBar` duplicada** | Media | La misma lógica `handlePickAction` (navegación entre rutas) está copiada en `ingredientes/page.tsx`, `kardex/page.tsx` y `recetas/page.tsx`. Debería extraerse a un hook. |
| 4 | **Carga en cascada de recetas en `recetas/page.tsx`** | Media | Se hace un `Promise.all` con `getRecipe()` por cada producto con inventario en la carga inicial. Con muchos productos genera N+1 requests al backend. |
| 5 | **Sin CTA desde Mi Negocio a Inventario** | Baja | Al asignar `inventoryMode = SIMPLE` o `RECIPE_BASED` en Mi Negocio, no hay botón ni guía para ir a configurar la receta o cargar stock. El usuario debe navegar manualmente. |
| 6 | **Reactivación de ingredientes sin UI** | Baja | El backend tiene `INACTIVE` como estado pero no hay botón de reactivar en la vista de ingredientes inactivos. |
| 7 | **Estado `purchaseReturnOpen` inicializado pero nunca usado funcionalmente** | Baja | En las 3 páginas, `setPurchaseReturnOpen(true)` abre un sheet vacío. El estado existe pero la funcionalidad es un placeholder. |
| 8 | **Doble cómputo de alertas** | Baja | El backend retorna `isLowStock` y `isOutOfStock` en el summary. El frontend los recalcula localmente también comparando `currentStock` con `minStock`. El cómputo local puede divergir si la lógica difiere. |
| 9 | **Posibles componentes zombie** | Baja | `InventoryMovementFeed`, `InventoryControlPanel`, `InventoryQuickPanel`, `ProductInventoryDetail`, `ProductInventoryFeedItem`, `InventoryStockForm`, `InventoryRecipeCard` — requieren verificación de si son importados activamente. |

---

## 7. Integraciones

### 7.1 Mi Negocio → Inventario

**Tipo de integración: ⚠️ Parcial — visual + datos, sin guía al usuario**

| Punto de integración | Implementación | Estado |
|---|---|---|
| Selector `inventoryMode` en formulario de item | `ItemFormContent.tsx` expone un toggle NONE / SIMPLE / RECIPE_BASED al crear o editar un producto | ✅ Real |
| Persistencia `inventoryMode` | `PATCH /items/:id` envía el campo al backend; `ItemsService.update` lo persiste | ✅ Real |
| Badge de receta en `ItemCard` | `mi-negocio/page.tsx` consulta `GET /items/:id/recipe` por cada `RECIPE_BASED` y muestra el conteo de líneas | ✅ Real |
| CTA post-asignación de modo inventario | No existe ningún enlace ni guía para ir a `/inventario/recetas` o `/inventario` después de asignar `SIMPLE` o `RECIPE_BASED` | ❌ Ausente |
| Protección al borrar un item con receta | `ItemsService` hace soft-delete (INACTIVE) sin validar si tiene recetas activas o movimientos de inventario pendientes | ⚠️ Sin validación |
| Visibilidad del stock desde Mi Negocio | `ItemCard` y `ItemDetailModal` no muestran `currentStock` ni `averageCost` — la información de inventario solo vive en `/inventario` | ❌ Sin integración visual |

**Conclusión:** La integración existe a nivel de dato (`inventoryMode` se guarda y viaja al backend) pero el flujo de usuario está incompleto. Un usuario que crea un producto RECIPE_BASED en Mi Negocio no recibe ninguna indicación de que debe ir a Inventario a configurar la receta y cargar stock.

---

### 7.2 Ventas → Inventario

**Tipo de integración: ✅ Real — backend completamente integrado, bidireccional**

| Punto de integración | Implementación | Estado |
|---|---|---|
| Descuento automático de stock al confirmar orden | `SalesService.confirmOrder` → `InventoryService.applyInventoryConsumptionForOrder` dentro de la misma transacción Serializable | ✅ Real |
| Validación de stock antes de confirmar | `validateStockAvailability` ejecuta antes del descuento; lanza `BadRequestException` si stock insuficiente | ✅ Real |
| Idempotencia de confirmación | `Order.inventoryPostedAt` previene doble descuento | ✅ Real |
| Snapshot de `inventoryMode` en `OrderItem` | Al crear el item de orden se captura `inventoryModeSnapshot` | ✅ Real |
| Cancelación de orden DRAFT/SENT | `cancel()` solo cambia estado a CANCELLED; NO revierte inventario porque la orden no tenía `inventoryPostedAt` | ✅ Correcto por diseño |
| Reversión de orden COMPLETED | `reverseConfirmedOrder` → `InventoryService.reverseInventoryConsumptionForOrder` crea `SALE_RETURN` por cada `SALE` y restaura stock | ✅ Real |
| Protección contra doble reversión | `ConflictException` si ya existen movimientos `SALE_RETURN` para esa orden | ✅ Real |
| Productos tipo SERVICE en una orden mixta | Skip explícito por `itemTypeSnapshot === 'SERVICE'` | ✅ Real |
| Productos con `inventoryMode = NONE` en una orden | Skip explícito por `inventoryMode === 'NONE'` | ✅ Real |
| Feedback de stock insuficiente en UI de Ventas | El frontend recibe el `BadRequestException` del backend al confirmar — el mensaje llega como error genérico | ⚠️ Sin mensaje específico por ingrediente |
| Kardex de ventas visible en `/inventario/kardex` | Los movimientos SALE generados se ven en el kardex filtrado por ingrediente u orden | ✅ Real |

**Conclusión:** La integración Ventas → Inventario es la más sólida del módulo. Está implementada con transacciones atómicas, idempotencia y reversión. El único gap es la UX del error: cuando el stock es insuficiente, el frontend no indica qué ingrediente específico falta.

---

### 7.3 Contabilidad → Inventario

**Tipo de integración: ❌ No implementada para movimientos manuales**

| Punto de integración | Implementación | Estado |
|---|---|---|
| Asiento contable al confirmar venta con inventario | `SalesService.confirmOrder` llama `accountingService.postOrderMovements` — esto registra el ingreso y COGS de la venta | ✅ Real (para ventas) |
| Asiento contable por compra de insumos (`PURCHASE`) | No existe llamada a `accountingService` desde `InventoryService.createPurchase` | ❌ Ausente |
| Asiento contable por ajuste de inventario | No existe llamada a `accountingService` desde `InventoryService.createAdjustment` | ❌ Ausente |
| Asiento contable por carga inicial (`INVENTORY_INITIAL`) | No existe llamada a `accountingService` desde `InventoryService.createInitialInventory` | ❌ Ausente |
| Asiento contable por devolución de compra (`PURCHASE_RETURN`) | No existe llamada a `accountingService` desde `InventoryService.createPurchaseReturn` | ❌ Ausente |
| Cuenta de inventario en PUC (activo corriente) | No definida en el módulo de contabilidad para ser debitada/acreditada por movimientos de inventario | ❌ Ausente |
| Valor de inventario en balance | `getSummary` calcula `stockValue` (∑ currentStock × averageCost) pero este dato no alimenta automáticamente al balance contable | ❌ Sin integración |

**Cuentas PUC esperadas (no implementadas):**

| Movimiento | Débito esperado | Crédito esperado |
|---|---|---|
| PURCHASE | 1435 Inventario de insumos | 2205 Proveedores / 1110 Caja |
| PURCHASE_RETURN | 2205 Proveedores | 1435 Inventario de insumos |
| ADJUSTMENT_POSITIVE | 1435 Inventario de insumos | 6295 Otros gastos / 5195 Ajuste |
| ADJUSTMENT_NEGATIVE | 6295 Costo ajuste | 1435 Inventario de insumos |
| INVENTORY_INITIAL | 1435 Inventario de insumos | 3105 Capital / 6295 según origen |
| SALE (COGS) | 6135 Costo de ventas | 1435 Inventario de insumos |

> ❌ Actualmente, el módulo de contabilidad **solo registra el ingreso por ventas y el COGS** a través de `postOrderMovements`. Las compras, ajustes y carga inicial de inventario **no generan ningún asiento**. Esto produce un desbalance: el activo de inventario no se actualiza contablemente cuando se cargan insumos.

**Conclusión:** La integración Contabilidad → Inventario es el gap más crítico para producción en negocios que requieran contabilidad real. Es aceptable en un MVP de control operativo (saber cuánto hay en stock), pero inaceptable si el negocio necesita balances correctos.

---

### 7.4 Resumen de estado de integraciones

| Integración | Estado | Tipo |
|---|---|---|
| Mi Negocio → Inventario (asignación de modo) | ⚠️ Parcial | Dato real, UX incompleta |
| Ventas → Inventario (descuento de stock) | ✅ Completa | Real, atómica, bidireccional |
| Contabilidad → Inventario (asientos por compra/ajuste) | ❌ Ausente | No implementada |
| Contabilidad → Inventario (COGS por venta) | ✅ Completa | Real (vía `postOrderMovements`) |

---


---

## 8. Tests

### 8.1 Tests encontrados

| Archivo | Tipo | Cobertura | Estado | Observaciones |
|---------|------|-----------|--------|---------------|
| `backend/src/inventory/inventory.service.spec.ts` (797 líneas) | Unitario | `applyInventoryMovement` (PURCHASE, ADJUSTMENT_NEGATIVE, ADJUSTMENT_POSITIVE); `registerPurchaseReturn` (flujo OK + bloqueo stock insuficiente); `applyInventoryConsumptionForOrder` (SIMPLE, RECIPE_BASED, SERVICE, stock insuficiente, idempotencia); `reverseInventoryConsumptionForOrder` (flujo OK, ConflictException, NotFoundException); `listKardex`; `listGlobalKardex` (paginación + filtros); `getSummary` (flags outOfStock/lowStock) | Útil | Cubre los casos core. No usa DB real (mocks de Prisma). No cubre `INVENTORY_INITIAL` ni integración multi-business directa. |
| `backend/src/ingredients/ingredients.service.spec.ts` (114 líneas) | Unitario | `create` con minStock válido; `create` con minStock negativo (rechaza); `update` minStock; `update` minStock negativo (rechaza); `create` con minStock = 0 | Útil | Solo cubre la validación de `minStock`. No cubre CRUD completo, deactivate, ni reactivación. |
| `backend/src/recipes/recipes.service.spec.ts` (94 líneas) | Unitario | `replaceForItem` SIMPLE (1 línea mandatory OK); SIMPLE con `isOptional=true` (rechaza); RECIPE_BASED sin línea mandatory (rechaza) | Útil | Cubre validaciones de receta. No cubre GET, RECIPE_BASED con ≥2 líneas, ingrediente inexistente, ni businessId cross-tenant. |
| `backend/src/movements/movements.service.spec.ts` (19 líneas) | Unitario | `MovementsService` es instanciable (`should be defined`) | Fuera de alcance | Pertenece al módulo separado de movimientos/rentabilidad de empresa. No forma parte del alcance Inventario ni debe mezclarse con `InventoryMovement`. |
| `backend/test/sales-flow.e2e-spec.ts` (348 líneas) | Integración (contra DB real) | Confirmación de orden (PRODUCT, SERVICE); idempotencia contable; movimientos no creados para orden SENT sin confirmación; reservas confirmadas; filtros por `originType`; edges UTC; detalle de asiento generado | Útil (para Ventas/Contabilidad) | **No incluye ninguna validación de inventario**. Los ítems de prueba tienen `inventoryMode` por defecto NONE; no se crea ningún ingrediente ni se verifica descuento de stock. |
| `backend/test/payroll-advanced-audits.e2e-spec.ts` | Integración | Nómina (Colombia) | Sin relación | No cubre inventario. |
| `backend/test/payroll-payments.e2e-spec.ts` | Integración | Pagos de nómina | Sin relación | No cubre inventario. |
| `backend/test/app.e2e-spec.ts` | E2E | Smoke test (`/` retorna 200) | Sin relación | No cubre inventario. |
| `frontend/**/*.test.ts` / `*.spec.ts` | — | No encontrado | No encontrado | No existen tests de frontend para el módulo de Inventario. |

**Totales: 3 archivos spec relevantes para inventario. 0 tests de frontend. 0 tests e2e de inventario. Los tests de `movements/` pertenecen a otro módulo y quedan fuera del alcance de esta auditoría.**

---

### 8.2 Casos críticos no cubiertos

| Prioridad | Caso | Riesgo si no se testea | Archivos/lógica relacionada |
|-----------|------|------------------------|------------------------------|
| **P0** | `INVENTORY_INITIAL` — creación exitosa y bloqueo de segundo inicial | Stock incorrecto desde el primer movimiento; doble carga silenciosa | `inventory.service.ts` → `createInitialInventory`, `assertCanCreateInitialInventory` |
| **P0** | Stock negativo bloqueado al confirmar venta con SIMPLE/RECIPE_BASED | Venta procesada sin stock disponible; kardex y campo `currentStock` quedan negativos | `inventory.service.ts` → `validateStockAvailability`, `applyInventoryMovement` |
| **P0** | Promedio ponderado — `INVENTORY_INITIAL` con stock = 0 previo | Promedio incorrecto desde el inicio; error de división si se calcula mal | `inventory.service.ts` → `calculateAverageCostAfter` |
| **P0** | `PURCHASE` con `purchaseToConsumptionFactor = 0` en el ingrediente | División por cero no controlada en conversión de unidades | `inventory.service.ts` → `registerPurchase` (modo purchaseUnit) |
| **P0** | Venta de producto SIMPLE sin receta configurada | `BadRequestException` o comportamiento inesperado al intentar consumir | `inventory.service.ts` → `expandOrderItemsToIngredients` |
| **P0** | `SALE_RETURN` de orden ya revertida (ConflictException) — **cubierto en unitario**, no en integración e2e | Sin test e2e: el guard podría no estar activo en la ruta HTTP real | `inventory.service.ts` → `reverseInventoryConsumptionForOrder`, `sales.service.ts` → `reverseConfirmedOrder` |
| **P0** | Aislamiento `businessId` — un negocio no puede leer/modificar stock de otro | Filtración de datos entre tenants; fallo de seguridad crítico | Todos los métodos de `inventory.service.ts`, `ingredients.service.ts`, `recipes.service.ts` |
| **P1** | `ADJUSTMENT_POSITIVE` — promedio ponderado correcto al agregar stock con nuevo costo | Costo promedio incorrecto afecta COGS de ventas futuras | `inventory.service.ts` → `applyInventoryMovement` (tipo ADJUSTMENT_POSITIVE) |
| **P1** | Venta de producto `RECIPE_BASED` con múltiples ingredientes y stock insuficiente en uno | La orden debe rechazarse antes de descontar cualquier ingrediente | `inventory.service.ts` → `validateStockAvailability`, `applyInventoryConsumptionForOrder` |
| **P1** | Producto con `inventoryMode = NONE` en orden mixta no afecta stock | Regresión silenciosa si se elimina el guard explícito | `inventory.service.ts` → `expandOrderItemsToIngredients` L.555-557 |
| **P1** | Servicio (itemType = SERVICE) en orden mixta no afecta stock | Similar al anterior; guard por tipo de ítem | `inventory.service.ts` → `expandOrderItemsToIngredients` L.548-550 |
| **P1** | `PURCHASE_RETURN` — bloquea si la cantidad a devolver supera el stock actual | Stock negativo por devolución | `inventory.service.ts` → `applyInventoryMovement` (tipo PURCHASE_RETURN) — **cubierto en unitario**, no en integración |
| **P1** | Transacciones Prisma `Serializable` — dos confirmaciones concurrentes de la misma orden | Sin test de concurrencia: race condition puede generar doble descuento | `sales.service.ts` → `confirmOrder`, nivel de aislamiento |
| **P1** | Reversión de venta — restaura `currentStock` y no modifica `averageCost` | Costo promedio incorrecto tras devolución | `inventory.service.ts` → `reverseInventoryConsumptionForOrder` — cubierto en unitario, no en e2e |
| **P1** | Alerta stock bajo — `lowStock` y `outOfStock` calculados correctamente por `getSummary` | Alertas falsas positivas/negativas en UI | `inventory.service.ts` → `getSummary` — **cubierto en unitario**, no en integración |
| **P2** | Receta con `ingredientId` inexistente o de otro `businessId` | NotFoundException no controlado; posible error 500 | `recipes.service.ts` → `replaceForItem` |
| **P2** | Receta con línea duplicada del mismo ingrediente | Prisma lanza unique constraint; el error no es manejado amigablemente | `schema.prisma` unique `(businessId, itemId, ingredientId)` |
| **P2** | `listGlobalKardex` con filtros combinados (ingredientId + type + fechas + página) | Filtros ignorados o SQL incorrecto | `inventory.service.ts` → `listGlobalKardex` — cubierto parcialmente en unitario |
| **P2** | Deactivate de ingrediente con movimientos existentes — no borra kardex | Pérdida accidental de trazabilidad | `ingredients.service.ts` → `deactivate`, `onDelete: Restrict` en schema |
| **P2** | `INVENTORY_INITIAL` bloqueado si ya existe al menos un movimiento | Doble carga si la validación falla | `inventory.service.ts` → `assertCanCreateInitialInventory` |

---

### 8.3 Recomendación mínima de cobertura

Los siguientes tests son el mínimo necesario antes de producción (no implementarlos, solo identificarlos):

1. **`inventory.service.spec.ts` — ampliar con `INVENTORY_INITIAL`**: Caso success (stock 0 previo → stock initial correcto) y caso error (ya existe movimiento previo → excepción).
2. **`inventory.service.spec.ts` — división por cero en purchaseToConsumptionFactor**: `registerPurchase` con `purchaseToConsumptionFactor = 0` debe lanzar `BadRequestException` (no `ZeroDivisionError` de Prisma).
3. **Test de integración e2e — venta con inventario activo**: Crear ingrediente, cargar stock, configurar receta SIMPLE, vender y verificar que `currentStock` disminuye; vender con stock insuficiente y verificar que se rechaza con 400.
4. **Test de integración e2e — reversión con inventario**: Confirmar orden → `currentStock` baja; revertir orden → `currentStock` sube; intentar revertir segunda vez → 409.
5. **Test unitario de aislamiento `businessId`**: Asegurarse de que `businessId` del JWT se aplica correctamente en todas las queries (no se puede leer stock de otro negocio).
6. **`recipes.service.spec.ts` — ingrediente de otro negocio**: Verificar que `replaceForItem` rechaza un `ingredientId` que existe pero pertenece a otro `businessId`.

---

## 9. Hallazgos críticos

| Severidad | Hallazgo | Evidencia | Impacto | Recomendación |
|-----------|----------|-----------|---------|---------------|
| **Crítica** | `purchaseToConsumptionFactor = 0` no validado en flujo de compra con `purchaseUnit` | `inventory.service.ts` → `registerPurchase`; `create-inventory-purchase.dto.ts` no valida el factor del ingrediente en DB | División por cero en conversión de unidades; error 500 no controlado en producción | Validar en `registerPurchase` que el factor del ingrediente es > 0 antes de dividir |
| **Crítica** | Sin tests de integración e2e para flujos de inventario | `backend/test/` contiene 0 tests que verifiquen descuento de stock, promedio ponderado o reversión en DB real | Un bug en `applyInventoryMovement` pasaría desapercibido hasta producción | Crear al menos 1 test e2e de ciclo completo: carga inicial → venta → reversión |
| **Alta** | `PURCHASE_RETURN` completamente sin UI | `ingredientes/page.tsx`, `kardex/page.tsx`: sheet con placeholder "próximamente"; backend `POST /inventory/purchase-return` funcional | Los operadores no pueden registrar devoluciones de compra; el stock puede quedar sobrevaluado indefinidamente | Implementar el formulario de devolución de compra en `MovementForm.tsx` (modo `PURCHASE_RETURN`) |
| **Alta** | Sin integración contable para PURCHASE, ADJUSTMENT y INVENTORY_INITIAL | `inventory.service.ts`: ninguno de los métodos de escritura llama a `accountingService`; solo `sales.service.ts` → `confirmOrder` integra contabilidad | Activo de inventario (cuenta 1435) nunca se debita/acredita por movimientos manuales; balance contable incorrecto | Implementar `accountingService.postInventoryMovement` y llamarlo desde `createPurchase`, `createAdjustment` y `createInitialInventory` |
| **Alta** | No existe test de `INVENTORY_INITIAL` | `inventory.service.spec.ts`: ningún `it()` cubre el tipo `INVENTORY_INITIAL` | Posibles bugs en la validación de primer movimiento o cálculo de promedio inicial no detectados | Agregar tests unitarios para `createInitialInventory` y `assertCanCreateInitialInventory` |
| **Alta** | `sales-flow.e2e-spec.ts` no verifica impacto en inventario | Los items de prueba tienen `inventoryMode = NONE` (default); no se crean ingredientes ni se verifica `currentStock` | El test e2e valida contabilidad pero no confirma que el inventario se descuenta/revierte en una DB real | Extender `sales-flow.e2e-spec.ts` con un escenario de venta con ingredientes activos |
| **Media** | `currentStock` y `averageCost` desnormalizados sin mecanismo de reconciliación | `schema.prisma`: campos en `Ingredient`; no hay job de auditoría ni stored procedure de reconciliación | Si una tx falla parcialmente (ej. error de red después del `ingredient.update` pero antes del commit), los campos quedan inconsistentes indefinidamente | Implementar endpoint de administración `POST /inventory/reconcile/:ingredientId` que recalcule desde el kardex |
| **Media** | Código muerto en `kardex/page.tsx` (≈120 líneas comentadas) | `kardex/page.tsx` L.177-298: bloque `{/* ... */}` con filtro inline original | Aumenta la superficie de mantenimiento; puede causar confusión al leer el componente | Eliminar el bloque comentado o restaurarlo si es necesario |
| **Media** | `InventoryChatActionBar` duplicada en 3 páginas | `ingredientes/page.tsx`, `kardex/page.tsx`, `recetas/page.tsx`: misma lógica `handlePickAction` copiada | Cambios en la navegación requieren editar 3 archivos; riesgo de divergencia | Extraer a un hook `useInventoryNavigation()` o un componente compartido |
| **Media** | N+1 requests al cargar `recetas/page.tsx` | `recetas/page.tsx`: `Promise.all(items.map(item => getRecipe(item.id)))` en carga inicial | Performance degradada con muchos productos; puede generar timeout en conexiones lentas | Implementar endpoint `GET /items/recipes-bulk` o paginar la carga de recetas |
| **Media** | Doble cómputo de alertas de stock (backend + frontend) con posible divergencia | `inventory.service.ts` → `getSummary` retorna `isLowStock`; `inventario/page.tsx` recalcula localmente con `currentStock < minStock` | Si las lógicas difieren (ej. por conversión de unidades), la UI muestra estado incorrecto | Usar exclusivamente los flags del backend; eliminar cómputo local en frontend |
| **Baja** | `InventoryReferenceType.ORDER` definido en schema pero no usado en código | `schema.prisma`: enum incluye `ORDER`; en código solo se usa `ORDER_ITEM` y `MANUAL`/`PURCHASE_MANUAL` | Confusión al leer el enum; valor muerto puede inducir a usarlo incorrectamente en el futuro | Documentado como valor reservado/pendiente; no eliminar sin migración planificada |
| **Baja** | Sin reactivación de ingredientes en UI | `ingredients.service.ts` → `deactivate` (INACTIVE); no hay `reactivate`; UI no muestra botón | Un ingrediente desactivado por error no puede ser restaurado desde la interfaz | Implementar endpoint `PATCH /ingredients/:id/reactivate` y botón en UI de ingredientes inactivos |
| **Baja** | Sin CTA desde Mi Negocio hacia Inventario al asignar `inventoryMode` | `ItemFormContent.tsx`: selector de inventoryMode sin enlace a `/inventario/recetas` ni `/inventario` | UX confusa: el operador no sabe que debe ir a Inventario a configurar la receta | Agregar banner/enlace en `ItemFormModal` o `ItemCard` cuando `inventoryMode ≠ NONE` |
| **Baja** | Componentes potencialmente zombie sin uso activo verificado | `InventoryMovementFeed.tsx`, `InventoryControlPanel.tsx`, `InventoryQuickPanel.tsx`, `ProductInventoryDetail.tsx`, `ProductInventoryFeedItem.tsx`, `InventoryStockForm.tsx`, `InventoryRecipeCard.tsx` | Bundle más grande; mantenimiento de código no usado | Verificar imports activos con tree-shaking; eliminar los que no tienen referencias |
| **Baja** | `prisma/seed.ts` sin datos de inventario | `seed.ts`: no crea ingredientes, recetas ni movimientos | Onboarding de nuevos devs requiere carga manual; tests e2e difíciles de configurar | Agregar seed con 2-3 ingredientes de ejemplo y movimientos de stock inicial |

### 9.1 Clasificación del estado actual del módulo

**Estado: Funcional con deuda técnica**

El núcleo del módulo (kardex, promedio ponderado, descuento por venta, reversión) está implementado correctamente en backend con transacciones Serializable y validaciones de stock negativo. Los tests unitarios existentes cubren los flujos principales de `InventoryService`. La integración con Ventas es real y atómica.

Sin embargo, el módulo presenta deuda técnica significativa dentro del alcance de Inventario: (1) `PURCHASE_RETURN` carece completamente de UI; (2) ningún movimiento manual (compras, ajustes, carga inicial) genera asientos contables; (3) no existen tests e2e que validen el inventario contra una DB real; (4) hay componentes frontend duplicados, código muerto y un riesgo no controlado de división por cero con `purchaseToConsumptionFactor = 0`. Para un entorno que gestione contabilidad real, la ausencia de integración contable para movimientos manuales es el bloqueador más crítico. `movements/` queda explícitamente fuera de esta clasificación porque pertenece a otro módulo funcional.

---

## 10. Plan de saneamiento recomendado

### P0 — Necesario antes de producción

| Acción | Motivo | Archivos afectados/probables | Resultado esperado |
|--------|--------|------------------------------|---------------------|
| Validar `purchaseToConsumptionFactor > 0` del ingrediente en `registerPurchase` antes de dividir | Previene error 500 por división por cero en producción | `inventory.service.ts` → `registerPurchase`; opcional: `create-inventory-purchase.dto.ts` | `BadRequestException` controlada en lugar de error de runtime |
| Implementar formulario de `PURCHASE_RETURN` en frontend | La funcionalidad existe en backend pero es inaccesible para el operador | `MovementForm.tsx` (agregar modo `PURCHASE_RETURN`); `ingredientes/page.tsx`, `kardex/page.tsx` (reemplazar placeholder) | Los operadores pueden registrar devoluciones de compra desde la UI |
| Agregar test de integración e2e para ciclo completo de inventario | Sin esto, bugs en DB real pueden llegar a producción sin detección | `backend/test/sales-flow.e2e-spec.ts` o nuevo `inventory.e2e-spec.ts` | Al menos 1 test: carga inicial → venta con SIMPLE → verifica `currentStock` → venta con stock insuficiente → 400 |
| Agregar test unitario para `INVENTORY_INITIAL` | Tipo de movimiento sin ningún test; es la base del kardex | `inventory.service.spec.ts` | Cobertura del primer movimiento y bloqueo de segundo inicial |

### P1 — Necesario para estabilidad

> Estado 2026-06-08: P1 de Inventario implementado parcialmente dentro del alcance definido. Se agregó integración contable mínima para `PURCHASE`, `PURCHASE_RETURN`, `ADJUSTMENT_POSITIVE` y `ADJUSTMENT_NEGATIVE` usando `AccountingMovement` con `originType = MANUAL` y `originId = InventoryMovement.id`, sin cambiar schema ni migraciones. `INVENTORY_INITIAL` queda sin asiento automático por decisión explícita: el origen patrimonial no está modelado en el sistema contable actual. Se agregó reconciliación de balance desde kardex, e2e de reversión con inventario, tests de aislamiento `businessId`, reactivación de ingredientes y limpieza del bloque comentado en Kardex. `movements/` permanece fuera del alcance de Inventario porque pertenece al módulo funcional de rentabilidad/movimientos de empresa.

| Acción | Motivo | Archivos afectados/probables | Resultado esperado |
|--------|--------|------------------------------|---------------------|
| Implementar integración contable para `PURCHASE`, `ADJUSTMENT_POSITIVE`, `ADJUSTMENT_NEGATIVE` e `INVENTORY_INITIAL` | Sin esto, el activo de inventario (cuenta 1435) nunca se registra en el libro mayor | `inventory.service.ts`, `inventory.module.ts` | Implementado para compra, devolución y ajustes. `INVENTORY_INITIAL` queda documentado sin asiento automático por falta de origen patrimonial explícito |
| Implementar endpoint `POST /inventory/reconcile/:ingredientId` (solo admin) | Permite corregir `currentStock`/`averageCost` si quedan inconsistentes por falla parcial | `inventory.controller.ts`, `inventory.service.ts` | Implementado: recalcula desde `InventoryMovement` ordenado por `occurredAt`, `createdAt` y solo actualiza balance actual |
| Ampliar `sales-flow.e2e-spec.ts` para verificar descuento de stock en ventas | El e2e actual no valida ningún aspecto del inventario en DB real | `backend/test/sales-flow.e2e-spec.ts` | Implementado en P0 |
| Agregar test de reversión e2e (SALE_RETURN) | Verifica la ruta HTTP real de reversión incluyendo la protección contra doble reversión | `backend/test/sales-flow.e2e-spec.ts`, `sales.service.ts` | Implementado: confirma orden, crea `SALE`, revierte, crea `SALE_RETURN`, restaura stock y bloquea segunda reversión |
| Agregar test de aislamiento `businessId` en `InventoryService` | Sin test, una regresión en filtros puede exponer datos de otros negocios | `inventory.service.spec.ts`, `ingredients.service.spec.ts` | Implementado para lectura/modificación de ingredientes, compra, kardex y reconciliación |
| Implementar `PATCH /ingredients/:id/reactivate` en backend y botón en UI | Un ingrediente desactivado por error no puede recuperarse | `ingredients.controller.ts`, `ingredients.service.ts`, `inventory.ts`, `IngredientList.tsx`, `ingredientes/page.tsx` | Implementado con comportamiento idempotente si ya está activo |
| Eliminar código muerto (~120 líneas comentadas) en `kardex/page.tsx` | Deuda técnica de mantenimiento activo | `kardex/page.tsx` | Implementado: eliminado solo el bloque comentado de filtros antiguos |

### P2 — Mejora UX / limpieza técnica

> Estado 2026-06-08: P2 de Inventario implementado con alcance de UX/mantenibilidad. Se unificó la navegación de `InventoryChatActionBar` con un hook compartido, se redujo el N+1 de recetas mediante `GET /recipes/bulk`, la UI usa los flags de stock del backend como fuente de verdad, Mi Negocio expone estado de inventario y acciones hacia Inventario respetando el patrón de long press/`SelectionActionBar`, se eliminaron componentes inventario sin imports activos, se agregó seed demo idempotente para inventario y se documentó `InventoryReferenceType.ORDER` como reservado/pendiente. `backend/src/movements/` sigue fuera del saneamiento de Inventario porque pertenece al módulo funcional de rentabilidad/movimientos de empresa.

| Acción | Motivo | Archivos afectados/probables | Resultado esperado |
|--------|--------|------------------------------|---------------------|
| Extraer `InventoryChatActionBar` y lógica `handlePickAction` a hook compartido | Elimina triplicación de lógica de navegación entre páginas | `ingredientes/page.tsx`, `kardex/page.tsx`, `recetas/page.tsx`; nuevo `hooks/useInventoryNavigation.ts` | Una sola fuente de verdad para la navegación entre sub-rutas de inventario |
| Resolver N+1 requests en `recetas/page.tsx` | Carga inicial lenta con muchos productos | `recetas/page.tsx`; potencial nuevo endpoint `GET /items/recipes-bulk` o paginación lazy | Carga inicial de recetas < 1 request por página de resultados |
| Usar exclusivamente los flags de stock del backend en la UI | Elimina divergencia entre `isLowStock`/`isOutOfStock` del backend y el recómputo local | `inventario/page.tsx` (eliminar cómputo local de alerts) | Un único punto de verdad para el estado de alertas de stock |
| Agregar CTA en Mi Negocio al asignar `inventoryMode ≠ NONE` | UX confusa: el operador no sabe que debe ir a Inventario | `ItemFormModal.tsx`, `ItemFormContent.tsx`, `ItemCard.tsx` | Banner o enlace directo a `/inventario/recetas` o `/inventario` al guardar el modo |
| Auditar y eliminar componentes zombie | Reducir bundle size y superficie de mantenimiento | `InventoryMovementFeed.tsx`, `InventoryControlPanel.tsx`, `InventoryQuickPanel.tsx`, `ProductInventoryDetail.tsx`, `ProductInventoryFeedItem.tsx`, `InventoryStockForm.tsx`, `InventoryRecipeCard.tsx` | Solo quedan componentes activamente importados en páginas o routes |
| Agregar datos de inventario al `seed.ts` | Facilita onboarding de devs y preparación de ambientes de test e2e | `prisma/seed.ts` | Al ejecutar `prisma db seed` se crean 2-3 ingredientes con stock inicial y receta de ejemplo |
| Documentar `ORDER` del enum `InventoryReferenceType` | Valor definido en schema pero nunca usado en código; puede inducir a error | `docs/auditoria-inventario.md` | Documentado como valor reservado/pendiente sin tocar schema ni migraciones |
| Agregar visibilidad de `currentStock` en `ItemCard` de Mi Negocio | El operador no puede ver el stock actual de un producto desde el catálogo | `mi-negocio/page.tsx`, `ItemCard.tsx` (badge o tooltip con stock) | Stock visible inline sin necesidad de navegar a `/inventario` |
