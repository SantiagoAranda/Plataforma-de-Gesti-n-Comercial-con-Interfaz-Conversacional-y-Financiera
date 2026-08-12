import type {
  Item,
  PublicItemOption,
  PublicItemOptionGroup,
} from "@/src/types/item";
import type {
  RecipeLine,
  ServiceConsumptionItem,
} from "@/src/services/inventory";

type IngredientStock = {
  id: string;
  currentStock?: number | string;
  status?: "ACTIVE" | "INACTIVE";
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionRequiredQuantity(
  group: PublicItemOptionGroup,
  option: PublicItemOption,
): number {
  if (group.quantityMode === "SHARED_TOTAL") {
    const quantity = numberValue(group.totalQuantityLimit);
    return quantity > 0 ? quantity : 1;
  }
  if (group.quantityMode === "FIXED_PER_OPTION") {
    const quantity = numberValue(option.quantity);
    return quantity > 0 ? quantity : 1;
  }
  return 0;
}

function minimumSelections(group: PublicItemOptionGroup): number {
  return Math.max(group.required ? 1 : 0, group.minSelections ?? 0);
}

export function getOptionHealth(
  group: PublicItemOptionGroup,
  option: PublicItemOption,
  ingredients: IngredientStock[],
) {
  if (option.isActive === false) {
    return { structurallyAvailable: false, hasStock: false };
  }

  if (option.targetType === "INGREDIENT") {
    const ingredient =
      option.ingredient ??
      ingredients.find((candidate) => candidate.id === option.ingredientId);
    const structurallyAvailable = ingredient?.status !== "INACTIVE";
    const currentStock = numberValue(ingredient?.currentStock);
    return {
      structurallyAvailable,
      hasStock:
        structurallyAvailable &&
        currentStock >= optionRequiredQuantity(group, option),
    };
  }

  if (option.targetType === "ITEM") {
    const structurallyAvailable = option.item?.status !== "INACTIVE";
    return {
      structurallyAvailable,
      hasStock:
        structurallyAvailable &&
        numberValue(option.item?.currentStock) >=
          optionRequiredQuantity(group, option),
    };
  }

  return { structurallyAvailable: true, hasStock: true };
}

export function getOptionGroupHealth(
  group: PublicItemOptionGroup,
  ingredients: IngredientStock[],
) {
  const minimum = minimumSelections(group);
  const optionHealth = (group.options ?? []).map((option) => ({
    option,
    ...getOptionHealth(group, option, ingredients),
  }));
  const structurallyAvailable = optionHealth.filter(
    (option) => option.structurallyAvailable,
  ).length;
  const withStock = optionHealth.filter(
    (option) => option.structurallyAvailable && option.hasStock,
  ).length;

  return {
    requiresReview: minimum > 0 && structurallyAvailable < minimum,
    stockInsufficient:
      minimum > 0 && structurallyAvailable >= minimum && withStock < minimum,
    optionHealth,
  };
}

export function getRecipeOperationalHealth(
  item: Item,
  lines: RecipeLine[],
  ingredients: IngredientStock[],
) {
  const baseRequiresReview = lines.some(
    (line) => line.ingredient?.status === "INACTIVE",
  );
  const baseStockInsufficient = lines
    .filter((line) => !line.isOptional && line.ingredient?.status !== "INACTIVE")
    .some((line) => {
      const ingredient =
        ingredients.find((candidate) => candidate.id === line.ingredientId) ??
        line.ingredient;
      return (
        numberValue(ingredient?.currentStock) <
        numberValue(line.quantityRequired)
      );
    });
  const groupHealth = (item.optionGroups ?? [])
    .filter((group) => group.isActive !== false)
    .map((group) => ({
      group,
      ...getOptionGroupHealth(group, ingredients),
    }));

  return {
    requiresReview:
      baseRequiresReview || groupHealth.some((group) => group.requiresReview),
    stockInsufficient:
      baseStockInsufficient ||
      groupHealth.some((group) => group.stockInsufficient),
    groupHealth,
  };
}

export function getServiceOperationalHealth(
  service: ServiceConsumptionItem,
) {
  return {
    requiresReview: service.ingredients.some(
      (line) => line.status === "INACTIVE",
    ),
    stockInsufficient: service.ingredients
      .filter((line) => line.status !== "INACTIVE")
      .some(
        (line) =>
          numberValue(line.currentStock) < numberValue(line.quantityRequired),
      ),
  };
}
