import type {
  InactiveIngredientReference,
  RecipeLine,
} from "@/src/services/inventory";

export function deriveRecipeReview(lines: RecipeLine[]) {
  const inactiveById = new Map<string, InactiveIngredientReference>();

  for (const line of lines) {
    if (line.ingredient?.status === "INACTIVE") {
      inactiveById.set(line.ingredient.id, {
        id: line.ingredient.id,
        name: line.ingredient.name,
      });
    }
  }

  const inactiveIngredients = Array.from(inactiveById.values());
  return {
    requiresReview: inactiveIngredients.length > 0,
    inactiveIngredients,
  };
}
