import { IngredientStatus, ItemOptionTargetType } from '@prisma/client';
import { deriveItemOptionValidity } from './item-option-validity';

const ingredientOption = (
  id: string,
  status: IngredientStatus,
  deletedAt: Date | null = null,
) => ({
  isActive: true,
  targetType: ItemOptionTargetType.INGREDIENT,
  selectedByDefault: false,
  removable: true,
  ingredient: { id, name: id, status, deletedAt },
});

const group = (minSelections: number, options: any[], required = false) => ({
  id: 'group-1',
  title: 'Toppings',
  isActive: true,
  required,
  minSelections,
  options,
});

describe('deriveItemOptionValidity', () => {
  it.each([
    ingredientOption('inactive', IngredientStatus.INACTIVE),
    ingredientOption('deleted', IngredientStatus.ACTIVE, new Date()),
  ])(
    'invalidates a mandatory group with one non-operational option',
    (option) => {
      const result = deriveItemOptionValidity([group(1, [option], true)]);
      expect(result.requiresReview).toBe(true);
      expect(result.invalidGroups[0]).toMatchObject({
        minimumSelections: 1,
        operationalOptions: 0,
      });
    },
  );

  it('does not invalidate an optional group for an unavailable option', () => {
    expect(
      deriveItemOptionValidity([
        group(0, [ingredientOption('inactive', IngredientStatus.INACTIVE)]),
      ]).requiresReview,
    ).toBe(false);
  });

  it('accepts a mandatory group when another option is operational', () => {
    expect(
      deriveItemOptionValidity([
        group(
          1,
          [
            ingredientOption('inactive', IngredientStatus.INACTIVE),
            ingredientOption('active', IngredientStatus.ACTIVE),
          ],
          true,
        ),
      ]).requiresReview,
    ).toBe(false);
  });

  it('invalidates minSelections 2 when only one option is operational', () => {
    const result = deriveItemOptionValidity([
      group(2, [
        ingredientOption('active', IngredientStatus.ACTIVE),
        ingredientOption('deleted', IngredientStatus.ACTIVE, new Date()),
      ]),
    ]);
    expect(result.requiresReview).toBe(true);
    expect(result.invalidGroups[0].operationalOptions).toBe(1);
  });
});
