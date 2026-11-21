import { ValidationPipe } from '@nestjs/common';
import { CreateItemDto } from './create-item.dto';
import { UpdateItemDto } from './update-item.dto';

// Same options as main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const run = (metatype: any, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('Item DTOs (F1.1 fields)', () => {
  it('accepts the new attributes on create and keeps barcode leading zeros', async () => {
    const dto = await run(CreateItemDto, {
      type: 'PRODUCT',
      name: 'Hamburguesa',
      price: 18000,
      visibleInCatalog: false,
      publishWithoutPrice: true,
      includeInQuotation: true,
      quotationDescription: '  Carne 120 g  ',
      brand: 'Casa',
      barcode: ' 0770030467534 ',
      categoryId: 'alimentos-y-bebidas',
    });
    expect(dto.barcode).toBe('0770030467534');
    expect(dto.quotationDescription).toBe('Carne 120 g');
    expect(dto.publishWithoutPrice).toBe(true);
  });

  it('still requires price on create', async () => {
    await expect(
      run(CreateItemDto, { type: 'PRODUCT', name: 'X', publishWithoutPrice: true }),
    ).rejects.toThrow();
  });

  it('rejects price null on update instead of coercing it to 0', async () => {
    await expect(run(UpdateItemDto, { price: null })).rejects.toThrow();
    await expect(run(UpdateItemDto, { price: '0' })).resolves.toMatchObject({ price: 0 });
  });

  it.each([
    ['null flag', { visibleInCatalog: null }],
    ['string flag', { publishWithoutPrice: 'true' }],
    ['quotation over 400', { quotationDescription: 'x'.repeat(401) }],
    ['barcode with spaces', { barcode: '770 123' }],
    ['barcode over 64', { barcode: '1'.repeat(65) }],
    ['brand over 80', { brand: 'b'.repeat(81) }],
  ])('rejects %s', async (_label, body) => {
    await expect(run(UpdateItemDto, body)).rejects.toThrow();
  });

  it('accepts a 400-character quotation description and null clears', async () => {
    await expect(
      run(UpdateItemDto, { quotationDescription: 'x'.repeat(400), brand: null, barcode: null }),
    ).resolves.toBeDefined();
  });
});
