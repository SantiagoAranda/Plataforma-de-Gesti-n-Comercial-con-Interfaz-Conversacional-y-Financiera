export type ComposedIngredient = {
  ingredientId: string;
  name: string;
  quantityRequired: number;
  consumptionUnit?: string;
  isOptional: boolean;
  currentStock?: number | string;
};

export type ComposedProduct = {
  itemId: string;
  itemName: string;
  itemType: string;
  inventoryMode: string;
  price?: number;
  stock?: number | string;
  value?: number | string;
  ingredients: ComposedIngredient[];
};
