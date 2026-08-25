import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PersonType } from '@prisma/client';
import { TaxPreviewDto } from './tax-preview.dto';

const validRequest = {
  buyerType: PersonType.JURIDICA,
  buyerIsIvaResponsable: false,
  buyerIsRetenedor: false,
  buyerIsGranContribuyente: false,
  buyerIsAutorretenedor: false,
  buyerIsRegimenSimple: false,
  cartItems: [{ itemId: 'item-1', quantity: 1 }],
};

async function buyerSimpleErrors(value: unknown, omit = false) {
  const payload = { ...validRequest } as Record<string, unknown>;
  if (omit) delete payload.buyerIsRegimenSimple;
  else payload.buyerIsRegimenSimple = value;
  const errors = await validate(plainToInstance(TaxPreviewDto, payload));
  return errors.filter((error) => error.property === 'buyerIsRegimenSimple');
}

describe('TaxPreviewDto buyerIsRegimenSimple contract', () => {
  it.each([true, false])('accepts boolean %p', async (value) => {
    expect(await buyerSimpleErrors(value)).toEqual([]);
  });

  it.each([
    ['absent', undefined, true],
    ['null', null, false],
    ['string true', 'true', false],
    ['string false', 'false', false],
    ['empty string', '', false],
  ])('rejects %s', async (_label, value, omit) => {
    expect(await buyerSimpleErrors(value, omit)).toHaveLength(1);
  });
});
