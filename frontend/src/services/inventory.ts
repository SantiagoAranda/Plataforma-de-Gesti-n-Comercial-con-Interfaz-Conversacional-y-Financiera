import { api } from "@/src/lib/api";

export type IngredientStatus = "ACTIVE" | "INACTIVE";

export type Ingredient = {
  id: string;
  businessId: string;
  name: string;
  consumptionUnit: string;
  purchaseUnit: string;
  purchaseToConsumptionFactor: number | string;
  status: IngredientStatus;
  currentStock: number | string;
  averageCost: number | string;
  createdAt: string;
  updatedAt: string;
};

export type InventorySummaryIngredient = Ingredient & {
  stockValue: number | string;
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
  ingredientId: string;
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

export type CreateIngredientDto = {
  name: string;
  consumptionUnit: string;
  purchaseUnit: string;
  purchaseToConsumptionFactor: number;
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

export type CreateInventoryInitialDto = {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  detail?: string;
};

export type CreateInventoryPurchaseDto = {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  referenceId?: string;
  detail?: string;
};

export type CreateInventoryAdjustmentDto = {
  ingredientId: string;
  quantity: number;
  unitCost?: number;
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

export function getRecipe(itemId: string) {
  return api<RecipeLine[]>(`/items/${itemId}/recipe`);
}

export function replaceRecipe(itemId: string, dto: ReplaceRecipeDto) {
  return api<RecipeLine[]>(`/items/${itemId}/recipe`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

