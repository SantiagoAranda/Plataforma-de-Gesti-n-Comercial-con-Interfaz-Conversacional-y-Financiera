import { Prisma, TaxDirection, TaxType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { AccountingService } from './accounting.service';
import {
  ManualPaidOutflowPaymentMethod,
  ManualPaidOutflowType,
} from './dto/create-manual-paid-outflow.dto';

describe('AccountingService automatic order postings', () => {
  const businessId = 'business-1';
  const orderId = 'order-1';

  const pucNames: Record<string, string> = {
    '1105': 'Caja',
    '1110': 'Bancos',
    '1355': 'Anticipo de impuestos y contribuciones',
    '1435': 'Mercancias no fabricadas por la empresa',
    '2408': 'Impuesto sobre las ventas por pagar',
    '4135': 'Comercio al por mayor y al por menor',
    '5195': 'Diversos',
    '6135': 'Comercio al por mayor y al por menor',
  };

  const pucSubcuentaNames: Record<string, string> = {
    '110505': 'Caja general',
    '111005': 'Moneda nacional',
    '135515': 'Retencion en la fuente',
    '135517': 'Impuesto a las ventas retenido',
    '135518': 'Impuesto de industria y comercio retenido',
    '413595': 'Venta de otros productos',
    '519595': 'Otros',
  };

  function pucCuenta(code: string) {
    return {
      code,
      name: pucNames[code] ?? code,
      grupo: null,
    };
  }

  function pucSubcuenta(code: string) {
    return {
      code,
      name: pucSubcuentaNames[code] ?? code,
      cuentaCode: code.slice(0, 4),
      active: true,
      cuenta: pucCuenta(code.slice(0, 4)),
    };
  }

  function createService() {
    const prisma = {
      pucCuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(pucCuenta(where.code)),
        ),
      },
      pucSubcuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(pucSubcuenta(where.code)),
        ),
      },
    } as any;

    const tx = {
      inventoryMovement: {
        findMany: jest.fn(),
      },
      orderFiscalContext: {
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
      saleTaxLine: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
      salesTaxRule: {
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
      accountingMovement: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: `movement-${data.pucCuentaCode ?? data.pucSubcuentaId}-${data.nature}`,
            ...data,
            pucCuenta: data.pucCuentaCode ? pucCuenta(data.pucCuentaCode) : null,
            pucSubcuenta: data.pucSubcuentaId
              ? pucSubcuenta(data.pucSubcuentaId)
              : null,
          }),
        ),
      },
    } as any;

    return { service: new AccountingService(prisma), prisma, tx };
  }

  function order(overrides: Record<string, any> = {}) {
    return {
      id: orderId,
      total: new Prisma.Decimal(10000),
      customerName: 'Victoria',
      accountingPostedAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-01T10:00:00.000Z'),
      paymentMethod: 'CASH',
      items: [
        {
          itemTypeSnapshot: 'PRODUCT',
          item: { type: 'PRODUCT' },
        },
      ],
      ...overrides,
    } as any;
  }

  function createdLines(tx: any) {
    return tx.accountingMovement.create.mock.calls.map(([call]: any[]) => ({
      code: call.data.pucSubcuentaId ?? call.data.pucCuentaCode,
      cuenta: call.data.pucCuentaCode,
      subcuenta: call.data.pucSubcuentaId,
      nature: call.data.nature,
      amount: call.data.amount.toString(),
      detail: call.data.detail,
      taxType: call.data.metadata?.taxType,
    }));
  }

  function totalsByNature(createCalls: any[]) {
    return createCalls.reduce(
      (totals, [call]) => {
        const amount = new Prisma.Decimal(call.data.amount);
        if (call.data.nature === 'DEBIT') {
          totals.debit = totals.debit.add(amount);
        } else {
          totals.credit = totals.credit.add(amount);
        }
        return totals;
      },
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );
  }

  it('posts cash and income defaults to existing six-digit PUC subaccounts', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      { totalValue: new Prisma.Decimal(4000) },
    ]);

    await service.postOrderMovements(tx, businessId, order());

    const lines = createdLines(tx);
    expect(lines.map((line) => [line.code, line.nature, line.amount])).toEqual([
      ['110505', 'DEBIT', '10000'],
      ['413595', 'CREDIT', '10000'],
      ['6135', 'DEBIT', '4000'],
      ['1435', 'CREDIT', '4000'],
    ]);
    expect(lines[0].cuenta).toBeNull();
    expect(lines[0].subcuenta).toBe('110505');
    expect(lines[1].cuenta).toBeNull();
    expect(lines[1].subcuenta).toBe('413595');

    const totals = totalsByNature(tx.accountingMovement.create.mock.calls);
    expect(totals.debit.toString()).toBe('14000');
    expect(totals.credit.toString()).toBe('14000');
  });

  it('posts bank transfer net received to 111005 without forcing cash', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({ paymentMethod: 'BANK_TRANSFER' }),
    );

    const lines = createdLines(tx);
    expect(lines[0].code).toBe('111005');
    expect(lines[0].subcuenta).toBe('111005');
  });

  it('keeps service income semantics while using the shared existing income subaccount', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({
        items: [
          {
            itemNameSnapshot: 'Asesoria',
            itemTypeSnapshot: 'SERVICE',
            lineTotal: new Prisma.Decimal(10000),
            item: { type: 'SERVICE' },
          },
        ],
      }),
    );

    const incomeLine = createdLines(tx)[1];
    expect(incomeLine.code).toBe('413595');
    expect(incomeLine.detail).toBe('Ingreso por servicio - Asesoria');
  });

  it('posts mixed manual order income and costs differentiated by line', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        totalValue: new Prisma.Decimal(4000),
        orderItemId: 'product-line',
        reservationId: null,
      },
      {
        totalValue: new Prisma.Decimal(900),
        orderItemId: 'service-line',
        reservationId: null,
      },
    ]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({
        total: new Prisma.Decimal(20000),
        items: [
          {
            id: 'product-line',
            itemId: 'product-1',
            itemNameSnapshot: 'Producto A',
            itemTypeSnapshot: 'PRODUCT',
            quantity: 1,
            lineTotal: new Prisma.Decimal(10000),
            item: { id: 'product-1', name: 'Producto A', type: 'PRODUCT' },
          },
          {
            id: 'service-line',
            itemId: 'service-1',
            itemNameSnapshot: 'Servicio B',
            itemTypeSnapshot: 'SERVICE',
            quantity: 1,
            lineTotal: new Prisma.Decimal(10000),
            item: { id: 'service-1', name: 'Servicio B', type: 'SERVICE' },
          },
        ],
      }),
    );

    const lines = createdLines(tx);
    expect(lines.map((line) => line.detail)).toEqual([
      'Contrapartida venta mixta',
      'Ingreso por venta de producto - Producto A',
      'Ingreso por servicio - Servicio B',
      'Costo de venta de producto - Producto A',
      'Salida de inventario por venta de producto - Producto A',
      'Consumo de insumos por servicio - Servicio B',
      'Salida de inventario por servicio - Servicio B',
    ]);

    const totals = totalsByNature(tx.accountingMovement.create.mock.calls);
    expect(totals.debit.toString()).toBe('24900');
    expect(totals.credit.toString()).toBe('24900');
  });

  it('resolves six-digit tax line account codes as PUC subaccounts', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);
    tx.orderFiscalContext.findUnique.mockResolvedValue({
      netReceived: new Prisma.Decimal(105500),
    });
    tx.saleTaxLine.findMany.mockResolvedValue([
      {
        taxType: TaxType.RETEFUENTE,
        direction: TaxDirection.WITHHOLD,
        taxAmount: new Prisma.Decimal(2500),
        accountCode: '135515',
        applied: true,
      },
      {
        taxType: TaxType.IMPOCONSUMO,
        direction: TaxDirection.CHARGE,
        taxAmount: new Prisma.Decimal(8000),
        accountCode: '519595',
        applied: true,
      },
    ]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({ total: new Prisma.Decimal(100000) }),
    );

    const lines = createdLines(tx);
    expect(lines.map((line) => [line.code, line.nature, line.amount, line.taxType])).toEqual([
      ['110505', 'DEBIT', '105500', 'NET_RECEIVED'],
      ['135515', 'DEBIT', '2500', 'RETEFUENTE'],
      ['413595', 'CREDIT', '100000', undefined],
      ['519595', 'CREDIT', '8000', 'IMPOCONSUMO'],
    ]);
  });
});

describe('AccountingService manual paid expense postings', () => {
  const businessId = 'business-1';
  const userId = 'user-1';

  function clase(code: string, name: string) {
    return { code, name };
  }

  function grupo(code: string, name: string, claseCode: string) {
    return {
      code,
      name,
      claseCode,
      clase: clase(claseCode, claseCode === '5' ? 'Gastos' : 'Costos'),
    };
  }

  function cuenta(code: string, name: string, claseCode = '5') {
    return {
      code,
      name,
      grupoCode: code.slice(0, 2),
      grupo: grupo(code.slice(0, 2), claseCode === '5' ? 'Gastos operacionales' : 'Costo de ventas', claseCode),
    };
  }

  function subcuenta(
    code: string,
    name: string,
    parentName = 'Servicios',
    claseCode = '5',
    active = true,
  ) {
    return {
      code,
      name,
      cuentaCode: code.slice(0, 4),
      active,
      cuenta: cuenta(code.slice(0, 4), parentName, claseCode),
    };
  }

  function createManualService() {
    const expenseSub = subcuenta(
      '513525',
      'Acueducto y alcantarillado',
      'Servicios',
      '5',
    );
    const energySub = subcuenta('513530', 'Energia electrica', 'Servicios', '5');
    const costSub = subcuenta(
      '613520',
      'Venta de productos en almacenes no especializados',
      'Comercio al por mayor y al por menor',
      '6',
    );
    const assetSub = subcuenta('110505', 'Caja general', 'Caja', '1');
    const bankSub = subcuenta('111005', 'Moneda nacional', 'Bancos', '1');

    const subcuentas: Record<string, any> = {
      [expenseSub.code]: expenseSub,
      [energySub.code]: energySub,
      [costSub.code]: costSub,
      [assetSub.code]: assetSub,
      [bankSub.code]: bankSub,
    };

    const tx = {
      pucCuenta: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(null)),
      },
      pucSubcuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(subcuentas[where.code] ?? null),
        ),
      },
      accountingMovement: {
        create: jest.fn(({ data }: any) => {
          const selectedSub = data.pucSubcuentaId
            ? subcuentas[data.pucSubcuentaId]
            : null;
          return Promise.resolve({
            id: `movement-${data.pucSubcuentaId}-${data.nature}`,
            ...data,
            pucCuenta: null,
            pucSubcuenta: selectedSub,
          });
        }),
      },
    };

    const prisma = {
      user: {
        findFirst: jest.fn(() => Promise.resolve({ id: userId })),
      },
      pucSubcuenta: {
        findMany: jest.fn(() => Promise.resolve([expenseSub, energySub])),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    } as any;

    return { service: new AccountingService(prisma), prisma, tx };
  }

  function expenseDto(overrides: Record<string, any> = {}) {
    return {
      counterpartyName: 'Empresa de servicios',
      amount: 100000,
      description: 'Pago de acueducto',
      paymentMethod: ManualPaidOutflowPaymentMethod.CASH,
      type: ManualPaidOutflowType.EXPENSE,
      categoryId: '513525',
      ...overrides,
    };
  }

  it('lists selectable six-digit expense subaccounts and finds 513525', async () => {
    const { service, prisma } = createManualService();

    const result = await service.listManualPaidOutflowCategories(
      ManualPaidOutflowType.EXPENSE,
      '513525',
    );

    expect(prisma.pucSubcuenta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          cuenta: { grupo: { claseCode: '5' } },
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: '513525',
        code: '513525',
        name: 'Acueducto y alcantarillado',
        type: ManualPaidOutflowType.EXPENSE,
        parentName: 'Servicios',
        isSelectable: true,
        pucKind: 'SUBCUENTA',
      }),
    ]);
  });

  it('lists lightweight expense groups without loading PUC accounts', () => {
    const { service, prisma } = createManualService();

    const result = service.listExpenseGroups();

    expect(prisma.pucSubcuenta.findMany).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'services',
          label: 'Servicios',
          icon: 'Zap',
          pucPrefix: '5135',
        }),
      ]),
    );
  });

  it('lists real six-digit expense accounts only after selecting a group', async () => {
    const { service, prisma } = createManualService();

    const result = await service.listExpenseGroupAccounts('services', '513525');

    expect(prisma.pucSubcuenta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          cuenta: { grupo: { claseCode: '5' } },
          OR: expect.arrayContaining([
            { code: { startsWith: '5135' } },
          ]),
        }),
        take: 120,
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        code: '513525',
        name: 'Acueducto y alcantarillado',
        parentName: 'Servicios',
      }),
    ]);
  });

  it('creates a balanced paid expense using the selected six-digit PUC', async () => {
    const { service, tx } = createManualService();

    await service.createManualPaidOutflow(businessId, userId, expenseDto());

    const calls = tx.accountingMovement.create.mock.calls.map(
      ([call]: any[]) => call.data,
    );
    expect(calls.map((line: any) => [line.pucSubcuentaId, line.nature, line.amount.toString()])).toEqual([
      ['513525', 'DEBIT', '100000'],
      ['110505', 'CREDIT', '100000'],
    ]);

    const totals = calls.reduce(
      (acc: any, line: any) => {
        const amount = new Prisma.Decimal(line.amount);
        if (line.nature === 'DEBIT') acc.debit = acc.debit.add(amount);
        if (line.nature === 'CREDIT') acc.credit = acc.credit.add(amount);
        return acc;
      },
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );
    expect(totals.debit.toString()).toBe('100000');
    expect(totals.credit.toString()).toBe('100000');
  });

  it('rejects costs in the paid expense flow', async () => {
    const { service, tx } = createManualService();

    await expect(
      service.createManualPaidOutflow(
        businessId,
        userId,
        expenseDto({
          type: ManualPaidOutflowType.COST,
          categoryId: '613520',
        }),
      ),
    ).rejects.toThrow('Este flujo solo permite registrar gastos');
    expect(tx.accountingMovement.create).not.toHaveBeenCalled();
  });

  it('rejects accounts that are not expenses', async () => {
    const { service, tx } = createManualService();

    await expect(
      service.createManualPaidOutflow(
        businessId,
        userId,
        expenseDto({ categoryId: '110505' }),
      ),
    ).rejects.toThrow('La categoria seleccionada no corresponde a gastos');
    expect(tx.accountingMovement.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService simple tax dashboard projection', () => {
  const businessId = 'business-1';

  function createSummaryService(overrides: Record<string, any> = {}) {
    let orderFindManyCalls = 0;
    const prisma = {
      order: {
        findMany: jest.fn(() => {
          orderFindManyCalls += 1;
          return Promise.resolve(orderFindManyCalls === 1 ? [] : overrides.orders ?? []);
        }),
      },
      reservation: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
      accountingMovement: {
        findMany: jest.fn(() => Promise.resolve(overrides.movements ?? [])),
      },
      businessTaxProfile: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            overrides.hasSimpleResponsibility === false
              ? null
              : {
                  responsibilities: [
                    { responsibility: { code: '47' } },
                  ],
                },
          ),
        ),
      },
      businessSimpleTaxConfig: {
        findUnique: jest.fn(() =>
          Promise.resolve(overrides.config ?? {
            enabled: true,
            taxYear: 2026,
            groupCode: '2',
          }),
        ),
      },
      simpleTaxPeriod: {
        findUnique: jest.fn(() => Promise.resolve(overrides.period ?? null)),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      simpleTaxRateBracket: {
        findFirst: jest.fn(() =>
          Promise.resolve(overrides.bracket ?? {
            groupCode: '2',
            groupName: 'Grupo 2',
            lowerUvt: new Prisma.Decimal(0),
            upperUvt: new Prisma.Decimal(1000),
            rate: new Prisma.Decimal('0.016'),
          }),
        ),
      },
    } as any;

    return { service: new AccountingService(prisma), prisma };
  }

  const saleMovement = (amount: number) => ({
    pucCuentaCode: null,
    pucSubcuentaId: '413595',
    amount: new Prisma.Decimal(amount),
    nature: 'CREDIT',
  });

  const movement = (code: string, nature: 'DEBIT' | 'CREDIT', amount: number) => ({
    pucCuentaCode: null,
    pucSubcuentaId: code,
    amount: new Prisma.Decimal(amount),
    nature,
  });

  const completedOrder = (subtotal: number, total = subtotal) => ({
    total: new Prisma.Decimal(total),
    fiscalContext: { subtotal: new Prisma.Decimal(subtotal) },
  });

  it('does not return a simple tax projection for non-RST businesses', async () => {
    const { service } = createSummaryService({
      hasSimpleResponsibility: false,
      movements: [saleMovement(20000000)],
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toBeUndefined();
    expect(result.balanceTotal).toBe(11700000);
  });

  it('projects monthly RST with the minimum group rate and avoids the 35% provision', async () => {
    const { service, prisma } = createSummaryService({
      movements: [saleMovement(20000000)],
      orders: [completedOrder(20000000, 23800000)],
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-15T00:00:00',
      to: '2026-01-15T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        enabled: true,
        configured: true,
        taxYear: 2026,
        month: 1,
        periodNumber: 1,
        groupCode: '2',
        groupName: 'Grupo 2',
        estimatedRate: 0.016,
        grossIncomeBase: 20000000,
        estimatedSimpleTax: 320000,
        netProfitBeforeSimpleTax: 20000000,
        netProfitAfterSimpleTax: 19680000,
        source: 'MONTHLY_MIN_RATE',
      }),
    );
    expect(result.balanceTotal).toBe(19680000);
    expect(result.impuestosReservas.iva).toBe(0);
    expect(result.impuestosReservas.retenciones).toBe(320000);
    expect(result.impuestosReservas.fondosReserva).toBe(0);
    expect(prisma.simpleTaxPeriod.update).not.toHaveBeenCalled();
    expect(prisma.simpleTaxPeriod.upsert).not.toHaveBeenCalled();
  });

  it('uses fiscal subtotal for the RST base instead of total with IVA', async () => {
    const { service } = createSummaryService({
      movements: [saleMovement(1190000)],
      orders: [completedOrder(1000000, 1190000)],
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection?.grossIncomeBase).toBe(1000000);
    expect(result.simpleTaxProjection?.estimatedSimpleTax).toBe(16000);
  });

  it('returns a configuration message for RST businesses without group', async () => {
    const { service } = createSummaryService({
      movements: [saleMovement(20000000)],
      config: { enabled: true, taxYear: 2026, groupCode: null },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        enabled: true,
        configured: false,
        message: expect.stringContaining('Configura el grupo'),
      }),
    );
    expect(result.balanceTotal).toBe(11700000);
  });

  it('uses posted period actual tax as information without duplicating the 519595 expense', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(50000000),
        movement('519595', 'DEBIT', 800000),
        movement('219595', 'CREDIT', 800000),
      ],
      orders: [completedOrder(50000000)],
      period: {
        status: 'POSTED',
        groupCode: '2',
        groupName: 'Grupo 2',
        appliedRate: new Prisma.Decimal('0.016'),
        taxableGrossIncome: new Prisma.Decimal(50000000),
        netSimpleTax: new Prisma.Decimal(800000),
      },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-03-01T00:00:00',
      to: '2026-03-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        source: 'POSTED_ACTUAL',
        periodStatus: 'POSTED',
        estimatedRate: 0.016,
        grossIncomeBase: 50000000,
        estimatedSimpleTax: 800000,
        netProfitBeforeSimpleTax: 49200000,
        netProfitAfterSimpleTax: 49200000,
      }),
    );
    expect(result.gastosAdministrativos.nominaSueldos).toBe(480000);
    expect(result.balanceTotal).toBe(49200000);
    expect(result.impuestosReservas.iva).toBe(0);
    expect(result.impuestosReservas.retenciones).toBe(0);
    expect(result.impuestosReservas.fondosReserva).toBe(0);
  });

  it('keeps PAID payment movements out of profit and does not duplicate RST', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(50000000),
        movement('519595', 'DEBIT', 800000),
        movement('219595', 'CREDIT', 800000),
        movement('219595', 'DEBIT', 800000),
        movement('111005', 'CREDIT', 800000),
      ],
      orders: [completedOrder(50000000)],
      period: {
        status: 'PAID',
        groupCode: '2',
        groupName: 'Grupo 2',
        appliedRate: new Prisma.Decimal('0.016'),
        taxableGrossIncome: new Prisma.Decimal(50000000),
        netSimpleTax: new Prisma.Decimal(800000),
      },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-03-01T00:00:00',
      to: '2026-03-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        source: 'POSTED_ACTUAL',
        periodStatus: 'PAID',
        estimatedSimpleTax: 800000,
        netProfitBeforeSimpleTax: 49200000,
        netProfitAfterSimpleTax: 49200000,
      }),
    );
    expect(result.balanceTotal).toBe(49200000);
    expect(result.impuestosReservas.retenciones).toBe(0);
  });
});
