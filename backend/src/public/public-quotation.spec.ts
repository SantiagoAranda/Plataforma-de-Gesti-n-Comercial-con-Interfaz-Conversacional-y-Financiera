import { BadRequestException } from '@nestjs/common';
import { PublicService } from './public.service';

const ITEM = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';

function setup(visibleCount = 1) {
  const prisma = { item: { count: jest.fn().mockResolvedValue(visibleCount) } };
  const quotations = {
    create: jest.fn().mockResolvedValue({
      id: 'q1',
      publicToken: 'tok',
      displayNumber: 'COT-0001',
      customer: { name: 'Ana' },
    }),
  };
  const push = { notifyQuotationRequested: jest.fn().mockResolvedValue(undefined) };
  const service = new PublicService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    push as any,
    undefined,
    undefined,
    undefined,
    quotations as any,
  );
  jest.spyOn(service as any, 'findActiveBusiness').mockResolvedValue({ id: 'biz' });
  return { service, prisma, quotations, push };
}

const dto = (over: object = {}) =>
  ({
    idempotencyKey: KEY,
    customerName: 'Ana',
    customerWhatsapp: '573001112233',
    items: [{ itemId: ITEM, quantity: 2 }],
    ...over,
  }) as any;

describe('PublicService.createQuotation', () => {
  it('crea la cotización con origen de tienda, solo id y cantidad, y avisa al negocio', async () => {
    const { service, quotations, push } = setup();
    // Un cliente malicioso intenta fijar el precio: el DTO público no lo propaga.
    const result = await service.createQuotation(
      'tienda',
      dto({ items: [{ itemId: ITEM, quantity: 2, unitPrice: 1, name: 'x' }] }),
    );

    expect(result).toEqual({
      message: 'Quotation created',
      quotationId: 'tok',
      number: 'COT-0001',
    });
    const [businessId, sent, origin] = quotations.create.mock.calls[0];
    expect(businessId).toBe('biz');
    expect(origin).toBe('PUBLIC_STORE');
    expect(sent.idempotencyKey).toBe(KEY);
    expect(sent.items).toEqual([{ itemId: ITEM, quantity: 2 }]);
    expect(push.notifyQuotationRequested).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz', quotationId: 'q1', displayNumber: 'COT-0001' }),
    );
  });

  it('rechaza productos que la tienda no publica', async () => {
    const { service, quotations } = setup(0);
    await expect(service.createQuotation('tienda', dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(quotations.create).not.toHaveBeenCalled();
  });

  it('un fallo del push no rompe la cotización', async () => {
    const { service, push } = setup();
    push.notifyQuotationRequested.mockRejectedValue(new Error('push caído'));
    await expect(service.createQuotation('tienda', dto())).resolves.toMatchObject({
      number: 'COT-0001',
    });
  });
});
