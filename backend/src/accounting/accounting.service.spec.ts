import { Prisma, SimpleTaxFilingMode, TaxDirection, TaxType } from '@prisma/client';
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
    const prisma = {
      $queryRaw: jest.fn(() =>
        Promise.resolve(
          overrides.groupMappings ?? [
            {
              id: 'mapping-2',
              taxYear: 2026,
              ciiuCode: '4711',
              groupCode: '2',
              groupName: 'Grupo 2',
              source: 'TEST',
              active: true,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
        ),
      ),
      order: {
        findMany: jest.fn(({ where }: any = {}) => {
          if (where?.archived === true) return Promise.resolve([]);
          const orders = overrides.orders ?? [];
          const range =
            where?.OR?.[0]?.accountingPostedAt ?? where?.OR?.[1]?.createdAt;
          if (!range) return Promise.resolve(orders);
          return Promise.resolve(
            orders.filter((order: any) => {
              const date = order.accountingPostedAt ?? order.createdAt;
              return (
                (!range.gte || date >= range.gte) &&
                (!range.lt || date < range.lt)
              );
            }),
          );
        }),
      },
      reservation: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
      accountingMovement: {
        findMany: jest.fn(({ where }: any = {}) => {
          const movements = overrides.movements ?? [];
          const matchesDate = (movement: any) => {
            if (!where?.date || !movement.date) return true;
            return (
              (!where.date.gte || movement.date >= where.date.gte) &&
              (!where.date.lte || movement.date <= where.date.lte)
            );
          };
          if (where?.pucSubcuentaId) {
            return Promise.resolve(
              movements.filter(
                (movement: any) =>
                  movement.pucSubcuentaId === where.pucSubcuentaId &&
                  matchesDate(movement),
              ),
            );
          }
          return Promise.resolve(movements.filter(matchesDate));
        }),
      },
      businessTaxProfile: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            overrides.hasSimpleResponsibility === false
              ? null
              : {
                  mainCiiuCode: overrides.mainCiiuCode ?? '4711',
                  mainCiiuDescription: overrides.mainCiiuDescription ?? 'Comercio al por menor',
                  taxSettingsEnabled: overrides.taxSettingsEnabled !== false,
                  responsibilities: [
                    { responsibility: { code: '47' } },
                  ],
                },
          ),
        ),
      },
      economicActivityCiiu: {
        findUnique: jest.fn(() =>
          Promise.resolve({ description: 'Comercio al por menor' }),
        ),
      },
      businessSimpleTaxConfig: {
        findUnique: jest.fn(() =>
          Promise.resolve(overrides.config ?? {
            enabled: true,
            taxYear: 2026,
            groupCode: '2',
            filingMode: SimpleTaxFilingMode.BIMONTHLY_ADVANCE,
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

  const movement = (
    code: string,
    nature: 'DEBIT' | 'CREDIT',
    amount: number,
    date?: Date,
  ) => ({
    pucCuentaCode: null,
    pucSubcuentaId: code,
    amount: new Prisma.Decimal(amount),
    nature,
    date,
  });

  const completedOrder = (
    subtotal: number,
    total = subtotal,
    date = new Date('2026-01-15T10:00:00.000Z'),
  ) => ({
    total: new Prisma.Decimal(total),
    fiscalContext: { subtotal: new Prisma.Decimal(subtotal) },
    accountingPostedAt: date,
    createdAt: date,
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

  it('projects RST from RUT mapping without BusinessSimpleTaxConfig.groupCode', async () => {
    const { service } = createSummaryService({
      movements: [saleMovement(20000000)],
      config: { enabled: true, taxYear: 2026, groupCode: null },
      orders: [completedOrder(20000000)],
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        enabled: true,
        configured: true,
        groupCode: '2',
        estimatedSimpleTax: 320000,
      }),
    );
    expect(result.balanceTotal).toBe(19680000);
  });

  it('uses posted period actual tax as information without duplicating the 519595 expense', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(50000000),
        movement('519595', 'DEBIT', 800000),
        movement('219595', 'CREDIT', 800000),
      ],
      orders: [completedOrder(50000000, 50000000, new Date('2026-03-15T10:00:00.000Z'))],
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
      orders: [completedOrder(50000000, 50000000, new Date('2026-03-15T10:00:00.000Z'))],
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

  it('allocates a paid bimonthly RST period to July even when 519595 is dated at period end', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(3000000),
        movement('6135', 'DEBIT', 10920, new Date('2026-07-09T00:00:00.000Z')),
        movement('519595', 'DEBIT', 36000, new Date('2026-08-31T23:59:59.999Z')),
        movement('219595', 'CREDIT', 36000, new Date('2026-08-31T23:59:59.999Z')),
        movement('219595', 'DEBIT', 36000, new Date('2026-07-09T00:00:00.000Z')),
        movement('111005', 'CREDIT', 36000, new Date('2026-07-09T00:00:00.000Z')),
      ],
      orders: [
        completedOrder(3000000, 3000000, new Date('2026-07-09T10:00:00.000Z')),
      ],
      period: {
        status: 'PAID',
        groupCode: '1',
        groupName: 'Grupo 1',
        appliedRate: new Prisma.Decimal('0.012'),
        taxableGrossIncome: new Prisma.Decimal(3000000),
        netSimpleTax: new Prisma.Decimal(36000),
      },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-07-01T00:00:00',
      to: '2026-07-31T23:59:59',
    } as any);

    expect(result.operacionComercial.ventasNetas).toBe(3000000);
    expect(result.operacionComercial.costosMercancia).toBe(10920);
    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        source: 'POSTED_ACTUAL',
        periodStatus: 'PAID',
        estimatedSimpleTax: 36000,
        netProfitBeforeSimpleTax: 2989080,
        netProfitAfterSimpleTax: 2953080,
      }),
    );
  });

  it('allocates posted RST proportionally by monthly sales inside the bimonthly period', async () => {
    const julyOrder = completedOrder(
      3000000,
      3000000,
      new Date('2026-07-09T10:00:00.000Z'),
    );
    const augustOrder = completedOrder(
      1000000,
      1000000,
      new Date('2026-08-09T10:00:00.000Z'),
    );
    const period = {
      status: 'PAID',
      groupCode: '1',
      groupName: 'Grupo 1',
      appliedRate: new Prisma.Decimal('0.012'),
      taxableGrossIncome: new Prisma.Decimal(4000000),
      netSimpleTax: new Prisma.Decimal(48000),
    };

    const july = await createSummaryService({
      movements: [saleMovement(3000000)],
      orders: [julyOrder, augustOrder],
      period,
    }).service.getSummary(businessId, {
      from: '2026-07-01T00:00:00',
      to: '2026-07-31T23:59:59',
    } as any);

    const august = await createSummaryService({
      movements: [saleMovement(1000000)],
      orders: [julyOrder, augustOrder],
      period,
    }).service.getSummary(businessId, {
      from: '2026-08-01T00:00:00',
      to: '2026-08-31T23:59:59',
    } as any);

    expect(july.simpleTaxProjection?.estimatedSimpleTax).toBe(36000);
    expect(august.simpleTaxProjection?.estimatedSimpleTax).toBe(12000);
  });

  it('does not discount posted RST twice when 519595 is already included in the month', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(1000000),
        movement('519595', 'DEBIT', 12000, new Date('2026-08-31T23:59:59.999Z')),
      ],
      orders: [
        completedOrder(3000000, 3000000, new Date('2026-07-09T10:00:00.000Z')),
        completedOrder(1000000, 1000000, new Date('2026-08-09T10:00:00.000Z')),
      ],
      period: {
        status: 'PAID',
        groupCode: '1',
        groupName: 'Grupo 1',
        appliedRate: new Prisma.Decimal('0.012'),
        taxableGrossIncome: new Prisma.Decimal(4000000),
        netSimpleTax: new Prisma.Decimal(48000),
      },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-08-01T00:00:00',
      to: '2026-08-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        estimatedSimpleTax: 12000,
        netProfitBeforeSimpleTax: 988000,
        netProfitAfterSimpleTax: 988000,
      }),
    );
  });

  it('shows pending configuration when RUT CIIU has no RST mapping', async () => {
    const { service } = createSummaryService({
      movements: [saleMovement(3000000)],
      groupMappings: [],
    });

    const result = await service.getSummary(businessId, {
      from: '2026-07-01T00:00:00',
      to: '2026-07-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        configured: false,
        estimatedSimpleTax: 0,
        groupResolution: expect.objectContaining({ status: 'NOT_FOUND' }),
      }),
    );
  });

  it('shows review pending when RUT CIIU maps to multiple RST groups', async () => {
    const { service } = createSummaryService({
      movements: [saleMovement(3000000)],
      groupMappings: [
        {
          id: 'mapping-1',
          taxYear: 2026,
          ciiuCode: '4921',
          groupCode: '1',
          groupName: 'Grupo 1',
          source: 'TEST',
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'mapping-2',
          taxYear: 2026,
          ciiuCode: '4921',
          groupCode: '2',
          groupName: 'Grupo 2',
          source: 'TEST',
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      mainCiiuCode: '4921',
    });

    const result = await service.getSummary(businessId, {
      from: '2026-07-01T00:00:00',
      to: '2026-07-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        configured: false,
        estimatedSimpleTax: 0,
        groupResolution: expect.objectContaining({ status: 'AMBIGUOUS' }),
      }),
    );
  });

  it('shows annual exception projection as informative when there is no posted history', async () => {
    const { service, prisma } = createSummaryService({
      movements: [saleMovement(20000000)],
      orders: [completedOrder(20000000)],
      config: {
        enabled: true,
        taxYear: 2026,
        groupCode: '2',
        filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
      },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        source: 'MONTHLY_MIN_RATE',
        filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
        informativeOnly: true,
        estimatedSimpleTax: 320000,
        netProfitBeforeSimpleTax: 20000000,
        netProfitAfterSimpleTax: 19680000,
        message: expect.stringContaining('declaracion anual'),
      }),
    );
    expect(result.balanceTotal).toBe(19680000);
    expect(result.impuestosReservas.iva).toBe(0);
    expect(result.impuestosReservas.retenciones).toBe(320000);
    expect(prisma.simpleTaxPeriod.update).not.toHaveBeenCalled();
    expect(prisma.simpleTaxPeriod.upsert).not.toHaveBeenCalled();
  });

  it('uses annual exception posted history as already reflected in accounting', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(20000000),
        movement('519595', 'DEBIT', 320000),
        movement('219595', 'CREDIT', 320000),
      ],
      orders: [completedOrder(20000000)],
      config: {
        enabled: true,
        taxYear: 2026,
        groupCode: '2',
        filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
      },
      period: {
        status: 'POSTED',
        groupCode: '2',
        groupName: 'Grupo 2',
        appliedRate: new Prisma.Decimal('0.016'),
        taxableGrossIncome: new Prisma.Decimal(20000000),
        netSimpleTax: new Prisma.Decimal(320000),
      },
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        source: 'POSTED_ACTUAL',
        filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
        informativeOnly: true,
        periodStatus: 'POSTED',
        estimatedSimpleTax: 320000,
        netProfitBeforeSimpleTax: 19680000,
        netProfitAfterSimpleTax: 19680000,
        message: expect.stringContaining('reflejado en Contabilidad'),
      }),
    );
    expect(result.balanceTotal).toBe(19680000);
    expect(result.impuestosReservas.retenciones).toBe(0);
  });

  it('uses annual exception RST movements as posted actual when no period is found', async () => {
    const { service } = createSummaryService({
      movements: [
        saleMovement(20000000),
        movement('519595', 'DEBIT', 320000),
        movement('219595', 'CREDIT', 320000),
      ],
      orders: [completedOrder(20000000)],
      config: {
        enabled: true,
        taxYear: 2026,
        groupCode: '2',
        filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
      },
      period: null,
    });

    const result = await service.getSummary(businessId, {
      from: '2026-01-01T00:00:00',
      to: '2026-01-31T23:59:59',
    } as any);

    expect(result.simpleTaxProjection).toEqual(
      expect.objectContaining({
        source: 'POSTED_ACTUAL',
        estimatedSimpleTax: 320000,
        netProfitBeforeSimpleTax: 19680000,
        netProfitAfterSimpleTax: 19680000,
        message: expect.stringContaining('historico'),
      }),
    );
    expect(result.balanceTotal).toBe(19680000);
  });
});
