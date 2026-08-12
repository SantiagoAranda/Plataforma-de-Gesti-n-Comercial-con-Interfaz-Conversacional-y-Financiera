import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { UpsertPurchasePresentationDto } from './dto/purchase-presentation.dto';
import { IngredientsService } from './ingredients.service';

describe('IngredientsService purchase presentations', () => {
  const businessId = 'business-1';
  const ingredientId = 'ingredient-1';

  function createHarness(initial: any[] = []) {
    const units: Record<string, any> = {
      'unit-g': {
        id: 'unit-g',
        code: 'G',
        name: 'Gramo',
        symbol: 'g',
        kind: 'WEIGHT',
        isActive: true,
      },
      'unit-kg': {
        id: 'unit-kg',
        code: 'KG',
        name: 'Kilogramo',
        symbol: 'kg',
        kind: 'WEIGHT',
        isActive: true,
      },
      'unit-l': {
        id: 'unit-l',
        code: 'L',
        name: 'Litro',
        symbol: 'l',
        kind: 'VOLUME',
        isActive: true,
      },
      'unit-box': {
        id: 'unit-box',
        code: 'BOX',
        name: 'Caja',
        symbol: 'caja',
        kind: 'COMMERCIAL',
        isActive: true,
      },
      'unit-bag': {
        id: 'unit-bag',
        code: 'BAG',
        name: 'Bulto',
        symbol: 'bulto',
        kind: 'COMMERCIAL',
        isActive: true,
      },
    };
    const presentations = initial.map((row) => ({ ...row }));
    let sequence = presentations.length;
    const decorated = (row: any) => ({
      ...row,
      purchaseUnit: units[row.purchaseUnitId],
      contentUnit: units[row.contentUnitId],
    });
    const matches = (row: any, where: any) =>
      Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
        if (
          key === 'id' &&
          typeof value === 'object' &&
          value.not !== undefined
        )
          return row.id !== value.not;
        return value === undefined || row[key] === value;
      });
    const sortRows = (rows: any[]) =>
      [...rows].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const dateOrder =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return dateOrder || a.id.localeCompare(b.id);
      });
    const ipp = {
      findFirst: jest.fn(async ({ where }: any) => {
        const rows = sortRows(
          presentations.filter((row) => matches(row, where)),
        );
        return rows[0] ? decorated(rows[0]) : null;
      }),
      findMany: jest.fn(async ({ where, select }: any) => {
        const rows = sortRows(
          presentations.filter((row) => matches(row, where)),
        );
        if (!select) return rows.map(decorated);
        return rows.map((row) =>
          Object.fromEntries(
            Object.keys(select)
              .filter((key) => select[key])
              .map((key) => [key, row[key]]),
          ),
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `presentation-${++sequence}`,
          createdAt: new Date(
            `2026-01-${String(sequence).padStart(2, '0')}T00:00:00.000Z`,
          ),
          ...data,
        };
        presentations.push(row);
        return decorated(row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = presentations.find(
          (candidate) => candidate.id === where.id,
        );
        if (!row) throw new Error('presentation not found');
        Object.assign(row, data);
        return decorated(row);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = presentations.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = presentations.find(
          (candidate) => candidate.id === where.id,
        );
        if (!row) throw new Error('presentation not found');
        return decorated(row);
      }),
    };
    const prisma: any = {
      ingredient: {
        findFirst: jest.fn(async () => ({
          id: ingredientId,
          businessId,
          stockUnitId: 'unit-g',
        })),
      },
      unit: {
        findUnique: jest.fn(async ({ where }: any) => units[where.id] ?? null),
      },
      unitConversion: {
        findUnique: jest.fn(async ({ where }: any) => {
          const { fromUnitId, toUnitId } = where.fromUnitId_toUnitId;
          if (fromUnitId === 'unit-kg' && toUnitId === 'unit-g') {
            return {
              factor: new Prisma.Decimal(1000),
              fromUnit: units[fromUnitId],
              toUnit: units[toUnitId],
            };
          }
          return null;
        }),
      },
      ingredientPurchasePresentation: ipp,
      $transaction: jest.fn(async (operation: any) => operation(prisma)),
    };
    return { service: new IngredientsService(prisma), prisma, presentations };
  }

  const dto = (overrides: Record<string, unknown> = {}) => ({
    name: 'Caja',
    purchaseUnitId: 'unit-box',
    innerQuantity: '24',
    innerUnitLabel: ' paquete ',
    contentQuantity: '500',
    contentUnitId: 'unit-g',
    isActive: true,
    ...overrides,
  });

  it('uses identity factor without UnitConversion and promotes the first active row', async () => {
    const { service, prisma, presentations } = createHarness();

    const result = await service.createPurchasePresentation(
      businessId,
      ingredientId,
      dto() as any,
    );

    expect(result.factorToBaseUnit.toString()).toBe('12000');
    expect(result.innerUnitLabel).toBe('paquete');
    expect(result.isDefault).toBe(true);
    expect(
      presentations.filter((row) => row.isActive && row.isDefault),
    ).toHaveLength(1);
    expect(prisma.unitConversion.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('reactivates and updates the oldest inactive row for the same commercial unit', async () => {
    const old = {
      id: 'presentation-old',
      businessId,
      ingredientId,
      name: 'Caja vieja',
      purchaseUnitId: 'unit-box',
      innerQuantity: new Prisma.Decimal(1),
      innerUnitLabel: 'unidad',
      contentQuantity: new Prisma.Decimal(12000),
      contentUnitId: 'unit-g',
      isActive: false,
      isDefault: false,
      createdAt: new Date('2025-01-01'),
    };
    const { service, presentations } = createHarness([old]);

    const result = await service.createPurchasePresentation(
      businessId,
      ingredientId,
      dto() as any,
    );

    expect(result.id).toBe('presentation-old');
    expect(presentations).toHaveLength(1);
    expect(result.isActive).toBe(true);
    expect(result.isDefault).toBe(true);
    expect(result.innerQuantity.toString()).toBe('24');
  });

  it('promotes the oldest remaining active row when deactivating the default', async () => {
    const rows = [
      {
        id: 'default',
        businessId,
        ingredientId,
        name: 'Caja',
        purchaseUnitId: 'unit-box',
        innerQuantity: new Prisma.Decimal(24),
        innerUnitLabel: 'paquete',
        contentQuantity: new Prisma.Decimal(500),
        contentUnitId: 'unit-g',
        isActive: true,
        isDefault: true,
        createdAt: new Date('2025-01-01'),
      },
      {
        id: 'next',
        businessId,
        ingredientId,
        name: 'Bulto',
        purchaseUnitId: 'unit-bag',
        innerQuantity: new Prisma.Decimal(10),
        innerUnitLabel: 'paquete',
        contentQuantity: new Prisma.Decimal(500),
        contentUnitId: 'unit-g',
        isActive: true,
        isDefault: false,
        createdAt: new Date('2025-01-02'),
      },
    ];
    const { service, presentations } = createHarness(rows);

    await service.deactivatePurchasePresentation(
      businessId,
      ingredientId,
      'default',
    );

    expect(presentations.find((row) => row.id === 'default')).toMatchObject({
      isActive: false,
      isDefault: false,
    });
    expect(presentations.find((row) => row.id === 'next')).toMatchObject({
      isActive: true,
      isDefault: true,
    });
  });

  it('requires a direct conversion in the exact content-to-stock direction', async () => {
    const { service } = createHarness();
    await expect(
      service.createPurchasePresentation(
        businessId,
        ingredientId,
        dto({ contentUnitId: 'unit-l' }) as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects factorToBaseUnit and decimal inputs beyond six places at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { ...dto(), factorToBaseUnit: '12000' },
        { type: 'body', metatype: UpsertPurchasePresentationDto },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      pipe.transform(dto({ innerQuantity: '1.1234567' }), {
        type: 'body',
        metatype: UpsertPurchasePresentationDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['0', '-1'])('rejects non-positive innerQuantity %s', async (innerQuantity) => {
    const { service } = createHarness();
    await expect(
      service.createPurchasePresentation(
        businessId,
        ingredientId,
        dto({ innerQuantity }) as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
