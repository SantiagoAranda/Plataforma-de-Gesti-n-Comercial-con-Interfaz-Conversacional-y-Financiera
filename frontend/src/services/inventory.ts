import { api } from "@/src/lib/api";

export type IngredientStatus = "ACTIVE" | "INACTIVE";
export type IngredientUnit = "UNIT" | "G" | "KG" | "ML" | "L";

export type Ingredient = {
  id: string;
  businessId: string;
  name: string;
  consumptionUnit: IngredientUnit;
  purchaseUnit: IngredientUnit;
  customUnitLabel?: string | null;
  purchaseToConsumptionFactor: string;
  minStock: string;
  status: IngredientStatus;
  currentStock: string;
  averageCost: string;
  hasMovements?: boolean;
  canCreateInitialInventory?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventorySummaryIngredient = Ingredient & {
  stockValue: number | string;
  outOfStock?: boolean;
  lowStock?: boolean;
};

export type InventoryMovementType =
  | "INVENTORY_INITIAL"
  | "PURCHASE"
  | "SALE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN"
  | "ADJUSTMENT_POSITIVE"
  | "ADJUSTMENT_NEGATIVE";

export type InventoryMovement = {
  id: string;
  businessId: string;
  ingredientId: string | null;
  itemId: string | null;
  type: InventoryMovementType;
  quantity: number | string;
  unitCost: number | string;
  totalValue: number | string;
  stockAfter: number | string;
  averageCostAfter: number | string;
  detail: string | null;
  occurredAt: string;
  referenceType: string;
  referenceId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryKardexGlobalMovement = InventoryMovement & {
  ingredient?: {
    id: string;
    name: string;
    consumptionUnit: string;
  } | null;
  item?: {
    id: string;
    name: string;
  } | null;
};

export type PaginatedResultMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type InventoryKardexGlobalResult = {
  data: InventoryKardexGlobalMovement[];
  meta: PaginatedResultMeta;
};

export type CreateIngredientDto = {
  name: string;
  consumptionUnit: IngredientUnit;
  purchaseUnit: IngredientUnit;
  purchaseToConsumptionFactor: string;
  customUnitLabel?: string;
  minStock?: string;
};

export type UpdateIngredientDto = Partial<CreateIngredientDto> & {
  status?: IngredientStatus;
};

export type InventorySummaryQuery = {
  status?: IngredientStatus;
};

export type InventoryKardexQuery = {
  from?: string;
  to?: string;
};

export type InventoryKardexGlobalQuery = {
  ingredientId?: string;
  itemId?: string;
  type?: InventoryMovementType;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

export type CreateInventoryInitialDto = {
  ingredientId?: string;
  itemId?: string;
  quantity: string;
  unitCost: string;
  detail?: string;
};

export type CreateInventoryPurchaseBaseDto = {
  ingredientId?: string;
  itemId?: string;
  referenceId?: string;
  detail?: string;
};

export type CreateInventoryPurchaseLegacyDto = CreateInventoryPurchaseBaseDto & {
  // Legacy mode: quantity + unitCost represent values in consumption units.
  quantity: string;
  unitCost: string;
  purchaseQuantity?: never;
  purchaseUnitCost?: never;
};

export type CreateInventoryPurchaseByUnitDto = CreateInventoryPurchaseBaseDto & {
  // New mode: purchaseQuantity + purchaseUnitCost represent values in purchase units.
  purchaseQuantity: string;
  purchaseUnitCost: string;
  quantity?: never;
  unitCost?: never;
};

export type CreateInventoryPurchaseDto =
  | CreateInventoryPurchaseLegacyDto
  | CreateInventoryPurchaseByUnitDto;

export type CreateInventoryPurchaseReturnDto = {
  ingredientId?: string;
  itemId?: string;
  quantity: string;
  unitCost: string;
  referenceId?: string;
  detail?: string;
};

export type CreateInventoryAdjustmentDto = {
  ingredientId?: string;
  itemId?: string;
  quantity: string;
  unitCost?: string;
  detail: string;
};

export type RecipeLine = {
  ingredientId: string;
  quantityRequired: number;
  isOptional?: boolean;
};

export type ReplaceRecipeDto = {
  lines: RecipeLine[];
};

export type RecipeBulkResult = Record<string, RecipeLine[]>;

export function listIngredients(query: { status?: IngredientStatus; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (query.status) qs.set("status", query.status);
  if (query.search) qs.set("search", query.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<Ingredient[]>(`/ingredients${suffix}`);
}

export function getIngredient(id: string) {
  return api<Ingredient>(`/ingredients/${id}`);
}

export function createIngredient(dto: CreateIngredientDto) {
  return api<Ingredient>(`/ingredients`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function updateIngredient(id: string, dto: UpdateIngredientDto) {
  return api<Ingredient>(`/ingredients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export function deactivateIngredient(id: string) {
  return api<Ingredient>(`/ingredients/${id}/deactivate`, { method: "PATCH" });
}

export function reactivateIngredient(id: string) {
  return api<Ingredient>(`/ingredients/${id}/reactivate`, { method: "PATCH" });
}

export function getInventorySummary(query: InventorySummaryQuery = {}) {
  const qs = new URLSearchParams();
  if (query.status) qs.set("status", query.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<InventorySummaryIngredient[]>(`/inventory/summary${suffix}`);
}

export function registerInitial(dto: CreateInventoryInitialDto) {
  return api<InventoryMovement>(`/inventory/initial`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function registerPurchase(dto: CreateInventoryPurchaseDto) {
  return api<InventoryMovement>(`/inventory/purchase`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function registerPurchaseReturn(dto: CreateInventoryPurchaseReturnDto) {
  return api<InventoryMovement>(`/inventory/purchase-return`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function registerPositiveAdjustment(dto: CreateInventoryAdjustmentDto) {
  return api<InventoryMovement>(`/inventory/adjustments/positive`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function registerNegativeAdjustment(dto: CreateInventoryAdjustmentDto) {
  return api<InventoryMovement>(`/inventory/adjustments/negative`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function listKardex(ingredientId: string, query: InventoryKardexQuery = {}) {
  const qs = new URLSearchParams();
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<InventoryMovement[]>(`/inventory/kardex/${ingredientId}${suffix}`);
}

export function getInventoryKardex(query: InventoryKardexGlobalQuery = {}) {
  const qs = new URLSearchParams();
  if (query.ingredientId) qs.set("ingredientId", query.ingredientId);
  if (query.itemId) qs.set("itemId", query.itemId);
  if (query.type) qs.set("type", query.type);
  if (query.dateFrom) qs.set("dateFrom", query.dateFrom);
  if (query.dateTo) qs.set("dateTo", query.dateTo);
  if (query.page) qs.set("page", String(query.page));
  if (query.limit) qs.set("limit", String(query.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<InventoryKardexGlobalResult>(`/inventory/kardex${suffix}`);
}

export function getSimpleItemsInventorySummary() {
  return api<Array<{
    id: string;
    name: string;
    currentStock: string | number;
    averageCost: string | number;
    stockValue: string | number;
    outOfStock?: boolean;
    hasMovements?: boolean;
    canCreateInitialInventory?: boolean;
  }>>(`/inventory/items/summary`);
}

export function listItemKardex(itemId: string, query: InventoryKardexQuery = {}) {
  const qs = new URLSearchParams();
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<InventoryMovement[]>(`/inventory/items/${itemId}/kardex${suffix}`);
}

export function getRecipe(itemId: string) {
  return api<RecipeLine[]>(`/items/${itemId}/recipe`);
}

export function getRecipesBulk(itemIds: string[]): Promise<RecipeBulkResult> {
  const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (!uniqueItemIds.length) return Promise.resolve({});
  const qs = new URLSearchParams({ itemIds: uniqueItemIds.join(",") });
  return api<RecipeBulkResult>(`/recipes/bulk?${qs.toString()}`);
}

export function replaceRecipe(itemId: string, dto: ReplaceRecipeDto) {
  return api<RecipeLine[]>(`/items/${itemId}/recipe`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

