import { api } from "@/src/lib/api";

export type IngredientStatus = "ACTIVE" | "INACTIVE";
export type IngredientUnit = "UNIT" | "PACKAGE" | "DOZEN" | "BOX" | "G" | "KG" | "LB" | "ML" | "L";
export type UnitKind = "WEIGHT" | "VOLUME" | "COUNT" | "COMMERCIAL";
export type InventoryPurchaseMode = "STANDARD" | "PRESENTATION" | "LEGACY";

export type Unit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  kind: UnitKind;
  isSystem: boolean;
  isActive: boolean;
};

export type IngredientPurchasePresentation = {
  id: string;
  businessId: string;
  ingredientId: string;
  name: string;
  purchaseUnitId: string;
  purchaseUnit?: Unit;
  innerQuantity: string;
  innerUnitLabel?: string | null;
  contentQuantity: string;
  contentUnitId: string;
  contentUnit?: Unit;
  isDefault: boolean;
  isActive: boolean;
};

export type Ingredient = {
  id: string;
  businessId: string;
  name: string;
  consumptionUnit: IngredientUnit;
  purchaseUnit: IngredientUnit;
  stockUnitId?: string | null;
  stockUnit?: Unit | null;
  defaultPurchaseUnitId?: string | null;
  defaultPurchaseUnit?: Unit | null;
  customUnitLabel?: string | null;
  purchaseToConsumptionFactor: string;
  purchasePresentations?: IngredientPurchasePresentation[];
  minStock: string;
  recipeUnitLabel?: string | null;
  recipeUnitFactor?: string | null;
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

export type SimpleItemInventorySummary = {
  id: string;
  name: string;
  price?: number | string;
  minStock?: string | number;
  currentStock: string | number;
  averageCost: string | number;
  stockValue: string | number;
  outOfStock?: boolean;
  hasMovements?: boolean;
  canCreateInitialInventory?: boolean;
  sellability?: {
    sellable: boolean;
    status: string;
    message?: string;
  };
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
  purchaseMode?: InventoryPurchaseMode | null;
  purchasePresentationId?: string | null;
  purchaseQuantity?: number | string | null;
  purchaseUnitLabel?: string | null;
  conversionDetail?: string | null;
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
  stockUnitId?: string;
  defaultPurchaseUnitId?: string;
  consumptionUnit?: IngredientUnit;
  purchaseUnit?: IngredientUnit;
  purchaseToConsumptionFactor?: string;
  customUnitLabel?: string;
  minStock?: string;
  recipeUnitLabel?: string;
  recipeUnitFactor?: string;
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
  purchaseUnitId?: string;
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

export function listUnits() {
  return api<Unit[]>(`/inventory/units`);
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

export function listPurchasePresentations(ingredientId: string) {
  return api<IngredientPurchasePresentation[]>(`/ingredients/${ingredientId}/purchase-presentations`);
}

export function createPurchasePresentation(
  ingredientId: string,
  dto: {
    name: string;
    purchaseUnitId: string;
    innerQuantity: string;
    innerUnitLabel?: string;
    contentQuantity: string;
    contentUnitId: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
) {
  return api<IngredientPurchasePresentation>(`/ingredients/${ingredientId}/purchase-presentations`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function updatePurchasePresentation(
  ingredientId: string,
  presentationId: string,
  dto: {
    name: string;
    purchaseUnitId: string;
    innerQuantity: string;
    innerUnitLabel?: string;
    contentQuantity: string;
    contentUnitId: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
) {
  return api<IngredientPurchasePresentation>(`/ingredients/${ingredientId}/purchase-presentations/${presentationId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export function deactivatePurchasePresentation(ingredientId: string, presentationId: string) {
  return api<IngredientPurchasePresentation>(`/ingredients/${ingredientId}/purchase-presentations/${presentationId}`, {
    method: "DELETE",
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
  return api<SimpleItemInventorySummary[]>(`/inventory/items/summary`);
}

export function listItemKardex(itemId: string, query: InventoryKardexQuery = {}) {
  const qs = new URLSearchParams();
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<InventoryMovement[]>(`/inventory/items/${itemId}/kardex${suffix}`);
}

export function registerSimpleItemMovement(
  itemId: string,
  dto: {
    type: "INVENTORY_INITIAL" | "PURCHASE";
    quantity: string;
    unitCost: string;
    referenceId?: string;
    detail?: string;
  },
) {
  return api<InventoryMovement>(`/inventory/items/${itemId}/movements`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export function updateSimpleItemMinStock(itemId: string, minStock: string) {
  return api<SimpleItemInventorySummary>(`/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ minStock }),
  });
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
export type ServiceIngredientLine = {
  id: string;
  ingredientId: string;
  name: string;
  quantityRequired: number;
  currentStock: number;
  consumptionUnit: string;
  customUnitLabel: string | null;
};

export type ServiceConsumptionItem = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number | null;
  status: string;
  ingredients: ServiceIngredientLine[];
};

export type ReplaceServiceConsumptionDto = {
  ingredients: {
    ingredientId: string;
    quantityRequired: string | number;
  }[];
};

export type ConsumptionHistoryLine = {
  id: string;
  type: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  occurredAt: string;
  ingredient: {
    id: string;
    name: string;
    consumptionUnit: string;
    customUnitLabel: string | null;
  } | null;
  order?: {
    id: string;
    documentNumber: string;
    quantitySold: number;
    createdAt: string;
  } | null;
  reservation?: {
    id: string;
    customerName: string;
    date: string;
    startMinute: number;
  } | null;
};

export function listServiceConsumption() {
  return api<ServiceConsumptionItem[]>(`/inventory/services/consumption`);
}

export function replaceServiceConsumption(serviceItemId: string, dto: ReplaceServiceConsumptionDto) {
  return api<ServiceIngredientLine[]>(`/inventory/services/${serviceItemId}/consumption`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export function getRecipeConsumptionHistory(itemId: string, query: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<ConsumptionHistoryLine[]>(`/inventory/recipes/${itemId}/consumption-history${suffix}`);
}

export function getServiceConsumptionHistory(serviceItemId: string, query: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<ConsumptionHistoryLine[]>(`/inventory/services/${serviceItemId}/consumption-history${suffix}`);
}
