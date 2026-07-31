import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BuyerFiscalContextDto } from './create-order.dto';

describe('BuyerFiscalContextDto', () => {
  it('normalizes optional buyer strings and country code', async () => {
    const dto = plainToInstance(BuyerFiscalContextDto, {
      buyerDv: '',
      buyerAddress: '  Calle 1  ',
      buyerPhone: ' 3001234567 ',
      buyerCountryCode: ' co ',
      buyerMunicipalityCode: ' 11001 ',
      buyerTributeCode: ' 01 ',
      buyerIsFinalConsumer: true,
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.buyerDv).toBeUndefined();
    expect(dto.buyerAddress).toBe('Calle 1');
    expect(dto.buyerPhone).toBe('3001234567');
    expect(dto.buyerCountryCode).toBe('CO');
    expect(dto.buyerMunicipalityCode).toBe('11001');
    expect(dto.buyerTributeCode).toBe('01');
    expect(dto.buyerIsFinalConsumer).toBe(true);
  });

  it('validates only structural formats without external catalogs', async () => {
    const dto = plainToInstance(BuyerFiscalContextDto, {
      buyerDv: 'A',
      buyerCountryCode: 'COL',
      buyerMunicipalityCode: '11A01',
      buyerTributeCode: '',
    });

    const fields = (await validate(dto)).map((error) => error.property);
    expect(fields).toEqual(
      expect.arrayContaining([
        'buyerDv',
        'buyerCountryCode',
        'buyerMunicipalityCode',
      ]),
    );
    expect(fields).not.toContain('buyerTributeCode');
  });
});
