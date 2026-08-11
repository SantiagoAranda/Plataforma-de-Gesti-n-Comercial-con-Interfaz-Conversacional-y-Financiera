import { IngredientStatus } from '@prisma/client';

export type RecipeIngredientState = {
  id: string;
  name: string;
  status: IngredientStatus;
};

export type RecipeLineWithIngredientState = {
  ingredient: RecipeIngredientState;
};

export type RecipeValidity = {
  requiresReview: boolean;
  inactiveIngredients: Array<{ id: string; name: string }>;
};

export function deriveRecipeValidity(
  lines: RecipeLineWithIngredientState[],
): RecipeValidity {
  const inactiveById = new Map<string, { id: string; name: string }>();

  for (const line of lines) {
    if (line.ingredient.status === IngredientStatus.INACTIVE) {
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
