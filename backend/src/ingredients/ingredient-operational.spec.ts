import { IngredientStatus } from '@prisma/client';
import { isIngredientOperational } from './ingredient-operational';
import { deriveRecipeValidity } from '../recipes/recipe-validity';

describe('isIngredientOperational', () => {
  it('requires ACTIVE status and a null deletedAt', () => {
    expect(
      isIngredientOperational({
        status: IngredientStatus.ACTIVE,
        deletedAt: null,
      }),
    ).toBe(true);
    expect(
      isIngredientOperational({
        status: IngredientStatus.INACTIVE,
        deletedAt: null,
      }),
    ).toBe(false);
    expect(
      isIngredientOperational({
        status: IngredientStatus.ACTIVE,
        deletedAt: new Date(),
      }),
    ).toBe(false);
  });

  it('marks a recipe for review when a deleted ingredient retained ACTIVE status', () => {
    expect(
      deriveRecipeValidity([
        {
          ingredient: {
            id: 'ingredient-1',
            name: 'Leche',
            status: IngredientStatus.ACTIVE,
            deletedAt: new Date(),
          },
        },
      ]),
    ).toEqual({
      requiresReview: true,
      inactiveIngredients: [{ id: 'ingredient-1', name: 'Leche' }],
    });
  });
});
