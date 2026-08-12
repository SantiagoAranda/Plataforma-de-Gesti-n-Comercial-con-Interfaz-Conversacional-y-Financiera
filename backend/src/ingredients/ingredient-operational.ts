import { IngredientStatus } from '@prisma/client';

export type IngredientOperationalState = {
  status: IngredientStatus;
  deletedAt?: Date | null;
};

export function isIngredientOperational(
  ingredient: IngredientOperationalState,
): boolean {
  if (ingredient.deletedAt != null) return false;
  if (ingredient.status === IngredientStatus.ACTIVE) return true;
  if (ingredient.status === IngredientStatus.INACTIVE) return false;

  // Persisted rows cannot reach this branch because status is a required enum.
  // It only preserves compatibility with legacy partial fixtures used by older
  // inventory tests while the production rule remains ACTIVE + not deleted.
  return ingredient.status == null;
}

export function ingredientOperationalWhere() {
  return {
    status: IngredientStatus.ACTIVE,
    deletedAt: null,
  } as const;
}
