import { IngredientStatus, ItemOptionTargetType } from '@prisma/client';
import { isIngredientOperational } from '../ingredients/ingredient-operational';

type OptionIngredientState = {
  id: string;
  name: string;
  status: IngredientStatus;
  deletedAt?: Date | null;
};

type OptionState = {
  isActive?: boolean;
  targetType: ItemOptionTargetType;
  selectedByDefault?: boolean;
  removable?: boolean;
  ingredient?: OptionIngredientState | null;
};

type OptionGroupState = {
  id: string;
  title: string;
  isActive?: boolean;
  required: boolean;
  minSelections: number;
  options: OptionState[];
};

export function isItemOptionStructurallyOperational(option: OptionState) {
  if (option.isActive === false) return false;
  if (option.targetType !== ItemOptionTargetType.INGREDIENT) return true;
  return (
    option.ingredient != null && isIngredientOperational(option.ingredient)
  );
}

export function deriveItemOptionValidity(groups: OptionGroupState[]) {
  const invalidGroups: Array<{
    id: string;
    title: string;
    minimumSelections: number;
    operationalOptions: number;
  }> = [];
  const inactiveById = new Map<string, { id: string; name: string }>();

  for (const group of groups) {
    if (group.isActive === false) continue;
    const minimumSelections = Math.max(
      group.required ? 1 : 0,
      group.minSelections ?? 0,
    );
    const operationalOptions = group.options.filter(
      isItemOptionStructurallyOperational,
    ).length;
    const unavailableRequiredDefault = group.options.some(
      (option) =>
        option.selectedByDefault === true &&
        option.removable === false &&
        !isItemOptionStructurallyOperational(option),
    );

    if (operationalOptions < minimumSelections || unavailableRequiredDefault) {
      invalidGroups.push({
        id: group.id,
        title: group.title,
        minimumSelections,
        operationalOptions,
      });
    }

    for (const option of group.options) {
      if (
        option.targetType === ItemOptionTargetType.INGREDIENT &&
        option.ingredient &&
        !isIngredientOperational(option.ingredient)
      ) {
        inactiveById.set(option.ingredient.id, {
          id: option.ingredient.id,
          name: option.ingredient.name,
        });
      }
    }
  }

  return {
    requiresReview: invalidGroups.length > 0,
    invalidGroups,
    inactiveIngredients: Array.from(inactiveById.values()),
  };
}
