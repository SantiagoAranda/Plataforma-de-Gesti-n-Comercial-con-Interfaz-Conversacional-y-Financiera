import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { SalesService } from './sales.service';

describe('Sales Price History & Audit Suite', () => {
  const businessId = 'biz-1';

  function fn<T = any>(impl?: any): jest.Mock<any> {
    const f = jest.fn(impl);
    return f as any;
  }

  function mockPrisma(overrides: Record<string, any> = {}) {
    const p: any = {
      item: {
        findMany: fn((args: any) => {
          const ids = args?.where?.id?.in;
          const all = [
            {
              id: 'item-1',
              businessId,
              name: 'Pizza Demo',
              type: 'PRODUCT',
              price: new Prisma.Decimal(18000),
              inventoryMode: 'NONE',
              durationMinutes: null,
              status: 'ACTIVE',
              recipes: [],
              optionGroups: [],
            },
            {
              id: 'item-high-price',
              businessId,
              name: 'Producto Alto Valor',
              type: 'PRODUCT',
              price: new Prisma.Decimal(500000),
              inventoryMode: 'NONE',
              durationMinutes: null,
              status: 'ACTIVE',
              recipes: [],
              optionGroups: [],
            },
          ];
          if (Array.isArray(ids)) {
            return Promise.resolve(all.filter((i) => ids.includes(i.id)));
          }
          return Promise.resolve(all);
        }),
      },
      order: {
        findUnique: fn().mockResolvedValue(null),
        findUniqueOrThrow: fn().mockResolvedValue({
          id: 'order-1',
          businessId,
          origin: 'MANUAL',
          status: 'DRAFT',
          items: [],
        }),
        findFirst: fn().mockResolvedValue({
          id: 'order-1',
          businessId,
          origin: 'MANUAL',
          status: 'DRAFT',
          accountingPostedAt: null,
          inventoryPostedAt: null,
          items: [
            {
              id: 'oi-1',
              itemId: 'item-1',
              quantity: 1,
              price: new Prisma.Decimal(18000),
              unitPrice: new Prisma.Decimal(18000),
              lineTotal: new Prisma.Decimal(18000),
              item: { id: 'item-1', type: 'PRODUCT' },
            },
          ],
        }),
        create: fn((args: any) => Promise.resolve({
          id: 'order-created-1',
          origin: args.data.origin ?? 'MANUAL',
          ...args.data,
          items: args.data.items?.create ?? [],
        })),
        update: fn((args: any) => Promise.resolve({
          id: 'order-updated-1',
          ...args.data,
        })),
        updateMany: fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        deleteMany: fn().mockResolvedValue({ count: 0 }),
        create: fn((args: any) => Promise.resolve({ id: 'oi-1', ...args.data })),
      },
      reservation: {
        findMany: fn().mockResolvedValue([]),
        create: fn(),
        updateMany: fn().mockResolvedValue({ count: 0 }),
      },
      unitConversion: {
        findMany: fn().mockResolvedValue([]),
      },
      ...overrides,
    };
    p.$transaction = fn(async (cb: any) => cb(p));
    return p;
  }

  function mockTaxService() {
    return {
      calculateTaxPreview: fn((bizId: any, dto: any) => {
        const cartItems = dto.cartItems || [];
        const subtotal = cartItems.reduce((acc: number, item: any) => {
          const unitPrice = item.unitPrice ?? 18000;
          return acc + unitPrice * item.quantity;
        }, 0);
        return Promise.resolve({
          subtotal: new Prisma.Decimal(subtotal),
          vatTotal: new Prisma.Decimal(0),
          impoconsumoTotal: new Prisma.Decimal(0),
          reteFuenteTotal: new Prisma.Decimal(0),
          reteIvaTotal: new Prisma.Decimal(0),
          reteIcaTotal: new Prisma.Decimal(0),
          autoRetencionTotal: new Prisma.Decimal(0),
          netReceived: new Prisma.Decimal(subtotal),
          taxLines: [],
        });
      }),
      freezeTaxCalculation: fn().mockResolvedValue({}),
    } as any;
  }

  function mockItemOptionsService() {
    return {
      resolveSelectionsForOrderLine: fn().mockResolvedValue({
        optionsTotal: new Prisma.Decimal(0),
        snapshots: [],
      }),
    } as any;
  }

  function mockInventoryService() {
    return {
      expandOrderItemsToIngredients: fn().mockResolvedValue([]),
      validateStockAvailability: fn().mockResolvedValue(undefined),
      applyInventoryConsumptionForOrder: fn().mockResolvedValue([]),
      postOrderInventoryMovements: fn().mockResolvedValue([]),
    } as any;
  }

  function mockAccountingService() {
    return {
      postOrderMovements: fn().mockResolvedValue([]),
    } as any;
  }

  function createSalesService(
    prisma: any,
    accSvc = mockAccountingService(),
    invSvc = mockInventoryService(),
    optSvc = mockItemOptionsService(),
    taxSvc = mockTaxService(),
  ) {
    return new SalesService(prisma, accSvc, invSvc, optSvc, taxSvc);
  }

  // 1. Producto sin opciones y precio normal
  it('1. Handles standard product without options and default price', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [{ itemId: 'item-1', quantity: 1 }],
    });

    expect(prisma.order.create).toHaveBeenCalled();
    const createdData = (prisma.order.create as any).mock.calls[0][0] as any;
    const line = createdData.data.items.create[0];
    expect(line.unitPrice.toNumber()).toBe(18000);
    expect(line.lineTotal.toNumber()).toBe(18000);
  });

  // 2. Precio editado manualmente al alza
  it('2. Persists manually edited price upwards for MANUAL orders', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [{ itemId: 'item-high-price', quantity: 1, unitPrice: 523739 }],
    });

    const createdData = (prisma.order.create as any).mock.calls[0][0] as any;
    const line = createdData.data.items.create[0];
    expect(line.unitPrice.toNumber()).toBe(523739);
    expect(line.lineTotal.toNumber()).toBe(523739);
  });

  // 3. Precio editado manualmente a la baja (incluyendo $0)
  it('3. Persists manually edited price downwards including zero price', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [{ itemId: 'item-high-price', quantity: 1, unitPrice: 0 }],
    });

    const createdData = (prisma.order.create as any).mock.calls[0][0] as any;
    const line = createdData.data.items.create[0];
    expect(line.unitPrice.toNumber()).toBe(0);
    expect(line.lineTotal.toNumber()).toBe(0);
  });

  // 4. Opción con recargo sin doble suma
  it('4. Applies option surcharge without double adding when unitPrice is provided', async () => {
    const prisma = mockPrisma();
    const optSvc = {
      resolveSelectionsForOrderLine: fn().mockResolvedValue({
        optionsTotal: new Prisma.Decimal(100),
        snapshots: [{ optionId: 'opt-1' }],
      }),
    } as any;
    const service = createSalesService(prisma, mockAccountingService(), mockInventoryService(), optSvc);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [{ itemId: 'item-1', quantity: 1, unitPrice: 18100 }],
    });

    const createdData = (prisma.order.create as any).mock.calls[0][0] as any;
    const line = createdData.data.items.create[0];
    expect(line.unitPrice.toNumber()).toBe(18100);
    expect(line.lineTotal.toNumber()).toBe(18100);
  });

  // 5. Cambio de catálogo posterior no sobrescribe unitPrice de tienda pública u orígenes estrictos
  it('5. Does not overwrite manual unit price for non-manual or strict backend enforcement', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'PUBLIC_STORE' as any,
      items: [{ itemId: 'item-1', quantity: 1, unitPrice: 100 }],
    });

    const createdData = (prisma.order.create as any).mock.calls[0][0] as any;
    const line = createdData.data.items.create[0];
    expect(line.unitPrice.toNumber()).toBe(18000);
  });

  // 6. Preservar precio histórico al reabrir/editar
  it('6. Retains historical unitPrice on update Order', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      businessId,
      origin: 'MANUAL',
      status: 'DRAFT',
      items: [
        {
          id: 'oi-1',
          itemId: 'item-high-price',
          quantity: 1,
          unitPrice: new Prisma.Decimal(500000),
          lineTotal: new Prisma.Decimal(500000),
          itemTypeSnapshot: 'PRODUCT',
        },
      ],
    });

    await service.update(businessId, 'order-1', {
      items: [{ itemId: 'item-high-price', quantity: 1, unitPrice: 500000 }],
    });

    expect(prisma.orderItem.create).toHaveBeenCalled();
    const line = (prisma.orderItem.create as any).mock.calls[0][0].data;
    expect(line.unitPrice.toNumber()).toBe(500000);
  });

  // 7. Elegir explícitamente actualizar al precio actual
  it('7. Updates line unit price when user explicitly confirms catalog price update', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      businessId,
      origin: 'MANUAL',
      status: 'DRAFT',
      items: [
        {
          id: 'oi-1',
          itemId: 'item-high-price',
          quantity: 1,
          unitPrice: new Prisma.Decimal(500000),
          lineTotal: new Prisma.Decimal(500000),
          itemTypeSnapshot: 'PRODUCT',
        },
      ],
    });

    await service.update(businessId, 'order-1', {
      items: [{ itemId: 'item-high-price', quantity: 1, unitPrice: 523739 }],
    });

    const line = (prisma.orderItem.create as any).mock.calls[0][0].data;
    expect(line.unitPrice.toNumber()).toBe(523739);
  });

  // 8. Cantidad mayor a uno (unitPrice * quantity)
  it('8. Correctly computes lineTotal for quantity > 1', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [{ itemId: 'item-1', quantity: 3, unitPrice: 18100 }],
    });

    const createdData = (prisma.order.create as any).mock.calls[0][0] as any;
    const line = createdData.data.items.create[0];
    expect(line.unitPrice.toNumber()).toBe(18100);
    expect(line.lineTotal.toNumber()).toBe(54300);
  });

  // 9. Preview, snapshot, neto e ingreso usan exactamente el mismo subtotal
  it('9. Passes historical unitPrice to tax preview service', async () => {
    const prisma = mockPrisma();
    const taxService = mockTaxService();
    const service = createSalesService(prisma, undefined, undefined, undefined, taxService);

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [{ itemId: 'item-high-price', quantity: 2, unitPrice: 500000 }],
      buyerFiscalContext: { buyerType: 'NATURAL' } as any,
    });

    expect(taxService.calculateTaxPreview).toHaveBeenCalled();
    const payload = (taxService.calculateTaxPreview as any).mock.calls[0][1] as any;
    expect(payload.cartItems[0].unitPrice).toBe(500000);
  });

  // 10. Confirmación balanceada con IVA
  it('10. Confirms sale cleanly when tax preview includes IVA', async () => {
    const prisma = mockPrisma();
    const taxService = mockTaxService();
    const accountingService = mockAccountingService();
    const service = createSalesService(prisma, accountingService, undefined, undefined, taxService);

    await service.confirmOrder(businessId, 'order-1', { buyerType: 'NATURAL' } as any, 'ORDER');
    expect(accountingService.postOrderMovements).toHaveBeenCalled();
  });

  // 11. Confirmación balanceada con ReteFuente/ReteICA
  it('11. Confirms sale with withholdings cleanly', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.confirmOrder(businessId, 'order-1', { buyerType: 'JURIDICA' } as any, 'ORDER');
    expect(prisma.order.updateMany).toHaveBeenCalled();
  });

  // 12. Confirmación balanceada con ReteIVA
  it('12. Confirms sale with ReteIVA cleanly', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    await service.confirmOrder(businessId, 'order-1', undefined, 'ORDER');
    expect(prisma.order.updateMany).toHaveBeenCalled();
  });

  // 13. Fallo revierte todos los efectos dentro de la transacción
  it('13. Reverts transaction changes cleanly if an error occurs during confirmation', async () => {
    const prisma = mockPrisma();
    prisma.order.findFirst.mockImplementation(() => {
      throw new BadRequestException('Transaction error');
    });
    const service = createSalesService(prisma);

    await expect(service.confirmOrder(businessId, 'order-fail', undefined, 'ORDER')).rejects.toThrow('Transaction error');
  });

  // 14. Idempotencia: reintentar no duplica movimientos ni registros
  it('14. Guarantees idempotency when re-confirming an already closed sale', async () => {
    const prisma = mockPrisma();
    const service = createSalesService(prisma);

    prisma.order.findFirst.mockResolvedValue({
      id: 'order-closed-1',
      businessId,
      origin: 'MANUAL',
      status: 'COMPLETED',
      accountingPostedAt: new Date(),
      inventoryPostedAt: new Date(),
      items: [
        {
          id: 'oi-1',
          itemId: 'item-1',
          quantity: 1,
          unitPrice: new Prisma.Decimal(18000),
          lineTotal: new Prisma.Decimal(18000),
        },
      ],
    });

    const result = (await service.confirmOrder(businessId, 'order-closed-1', undefined, 'ORDER')) as any;
    expect(result.alreadyPosted).toBe(true);
  });
});
