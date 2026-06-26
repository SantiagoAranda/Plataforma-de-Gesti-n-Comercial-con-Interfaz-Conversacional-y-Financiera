import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingMovementOriginType,
  MovementNature,
  Prisma,
  TaxDirection,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingMovementsQueryDto } from './dto/accounting-movements-query.dto';
import { CreateAccountingMovementDto } from './dto/create-accounting-movement.dto';
import { UpdateAccountingMovementDto } from './dto/update-accounting-movement.dto';

const ORDER_ACCOUNTING_DEFAULTS = {
  // Use active subaccounts from prisma/seed-data/puc_subcuenta.csv.
  // The current seed does not include 413505 or 240805.
  debitCashPucCode: '110505',
  debitBankTransferPucCode: '111005',
  inventoryPucCode: '1435',
  costPucCodeByType: {
    PRODUCT: '6135',
    SERVICE: '6135',
  },
  creditIncomePucCodeByType: {
    PRODUCT: '413595',
    SERVICE: '413595',
  },
} as const;

type OrderForPosting = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        item: true,
      },
    },
  },
}>;

type MovementWithPucRelations = Prisma.AccountingMovementGetPayload<{
  include: {
    pucCuenta: {
      include: {
        grupo: {
          include: {
            clase: true,
          },
        },
      },
    },
    pucSubcuenta: {
      include: {
        cuenta: {
          include: {
            grupo: {
              include: {
                clase: true,
              },
            },
          },
        },
      },
    },
  },
}>;

type ResolvedPucReference = {
  kind: 'CUENTA' | 'SUBCUENTA';
  code: string;
  name: string;
  cuentaCode?: string;
};

type AccountingItemType = 'PRODUCT' | 'SERVICE';

type PostingLine = {
  id: string;
  itemId: string | null;
  name: string;
  type: AccountingItemType;
  amount: Prisma.Decimal;
};

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  private normalizeDetail(detail?: string | null) {
    const trimmed = detail?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeSearchText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private parsePucSelection(input: {
    pucCuentaCode?: string | null;
    pucSubcuentaId?: string | null;
  }) {
    const pucCuentaCode = input.pucCuentaCode?.trim() || null;
    const pucSubcuentaId = input.pucSubcuentaId?.trim() || null;
    const selectedCount =
      Number(Boolean(pucCuentaCode)) + Number(Boolean(pucSubcuentaId));

    if (selectedCount !== 1) {
      throw new BadRequestException(
        'Debe informarse una cuenta o una subcuenta PUC',
      );
    }

    return { pucCuentaCode, pucSubcuentaId };
  }

  private movementPucData(reference: ResolvedPucReference) {
    return reference.kind === 'CUENTA'
      ? {
          pucCuentaCode: reference.code,
          pucSubcuentaId: null,
        }
      : {
          pucCuentaCode: null,
          pucSubcuentaId: reference.code,
        };
  }

  private async loadPucReferenceOrThrow(input: {
    pucCuentaCode?: string | null;
    pucSubcuentaId?: string | null;
  }) {
    const { pucCuentaCode, pucSubcuentaId } = this.parsePucSelection(input);

    if (pucSubcuentaId) {
      const sub = await this.prisma.pucSubcuenta.findUnique({
        where: { code: pucSubcuentaId },
        include: {
          cuenta: {
            include: {
              grupo: {
                include: { clase: true },
              },
            },
          },
        },
      });

      if (!sub || !sub.active) {
        throw new BadRequestException('PUC subcuenta invalida o inactiva');
      }

      return {
        kind: 'SUBCUENTA' as const,
        code: sub.code,
        name: sub.name,
        cuentaCode: sub.cuentaCode,
      };
    }

    const cuenta = await this.prisma.pucCuenta.findUnique({
      where: { code: pucCuentaCode! },
      include: {
        grupo: {
          include: { clase: true },
        },
      },
    });

    if (!cuenta) {
      throw new BadRequestException('PUC cuenta invalida');
    }

    return {
      kind: 'CUENTA' as const,
      code: cuenta.code,
      name: cuenta.name,
    };
  }

  private async loadDefaultPucReferenceOrThrow(code: string) {
    return this.loadPucReferenceOrThrow(
      code.length === 4 ? { pucCuentaCode: code } : { pucSubcuentaId: code },
    );
  }

  private serializeMovement(movement: MovementWithPucRelations) {
    const selectedPuc = movement.pucSubcuenta ?? movement.pucCuenta;
    const selectedCuenta = movement.pucSubcuenta?.cuenta ?? movement.pucCuenta;
    const selectedGrupo =
      movement.pucSubcuenta?.cuenta?.grupo ?? movement.pucCuenta?.grupo;
    const selectedClase =
      movement.pucSubcuenta?.cuenta?.grupo?.clase ?? movement.pucCuenta?.grupo?.clase;

    return {
      ...movement,
      pucCode: selectedPuc?.code ?? '',
      pucName: selectedPuc?.name ?? '',
      pucKind: movement.pucSubcuenta ? ('SUBCUENTA' as const) : ('CUENTA' as const),
      pucMeta: {
        clase: selectedClase
          ? { code: selectedClase.code, name: selectedClase.name }
          : undefined,
        grupo: selectedGrupo
          ? { code: selectedGrupo.code, name: selectedGrupo.name }
          : undefined,
        cuenta: selectedCuenta
          ? { code: selectedCuenta.code, name: selectedCuenta.name }
          : undefined,
        subcuenta: movement.pucSubcuenta
          ? {
              code: movement.pucSubcuenta.code,
              name: movement.pucSubcuenta.name,
            }
          : undefined,
      },
    };
  }

  private movementInclude() {
    return {
      pucCuenta: {
        include: {
          grupo: {
            include: { clase: true },
          },
        },
      },
      pucSubcuenta: {
        include: {
          cuenta: {
            include: {
              grupo: {
                include: { clase: true },
              },
            },
          },
        },
      },
    } satisfies Prisma.AccountingMovementInclude;
  }

  private async loadMovementOrThrow(businessId: string, id: string) {
    const movement = await this.prisma.accountingMovement.findFirst({
      where: { id, businessId },
      include: this.movementInclude(),
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    return movement;
  }

  private resolveOrderPaymentMethod(order: OrderForPosting | Record<string, any>) {
    const rawValue = String(
      (order as any)?.paymentMethod ?? (order as any)?.paymentType ?? 'CASH',
    ).toUpperCase();

    return rawValue === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';
  }

  private resolveAccountingItemType(item: any): AccountingItemType {
    return (item?.itemTypeSnapshot ?? item?.item?.type) === 'SERVICE'
      ? 'SERVICE'
      : 'PRODUCT';
  }

  private buildPostingLines(
    order: OrderForPosting | Record<string, any>,
  ): PostingLine[] {
    const orderTotal = new Prisma.Decimal((order as any).total ?? 0);
    const lines = ((order as any).items ?? []).map((item: any, index: number) => {
      const quantity = new Prisma.Decimal(item.quantity ?? 1);
      const rawAmount =
        item.lineTotalSnapshot ??
        item.lineTotal ??
        item.price ??
        new Prisma.Decimal(item.unitPrice ?? 0).mul(quantity);

      return {
        id: item.id ?? `accounting-line-${index}`,
        itemId: item.itemId ?? item.item?.id ?? null,
        name:
          item.itemNameSnapshot ??
          item.item?.name ??
          (this.resolveAccountingItemType(item) === 'SERVICE'
            ? 'Servicio'
            : 'Producto'),
        type: this.resolveAccountingItemType(item),
        amount: new Prisma.Decimal(rawAmount ?? 0).toDecimalPlaces(2),
      };
    });

    const lineTotal = lines.reduce(
      (total: Prisma.Decimal, line: PostingLine) => total.add(line.amount),
      new Prisma.Decimal(0),
    );
    const difference = orderTotal.sub(lineTotal).toDecimalPlaces(2);

    if (lines.length > 0 && !difference.isZero()) {
      lines[lines.length - 1].amount = lines[lines.length - 1].amount.add(difference);
    }

    return lines;
  }

  private async resolveIncomeReference(itemType: AccountingItemType) {
    const preferredCode =
      ORDER_ACCOUNTING_DEFAULTS.creditIncomePucCodeByType[itemType];

    try {
      return await this.loadDefaultPucReferenceOrThrow(preferredCode);
    } catch (error) {
      if (
        itemType !== 'SERVICE' ||
        preferredCode === ORDER_ACCOUNTING_DEFAULTS.creditIncomePucCodeByType.PRODUCT
      ) {
        throw error;
      }

      return this.loadDefaultPucReferenceOrThrow(
        ORDER_ACCOUNTING_DEFAULTS.creditIncomePucCodeByType.PRODUCT,
      );
    }
  }

  private async resolveAutomaticDebitReference(order: OrderForPosting) {
    const paymentMethod = this.resolveOrderPaymentMethod(order);

    const debitPucCode =
      paymentMethod === 'BANK_TRANSFER'
        ? ORDER_ACCOUNTING_DEFAULTS.debitBankTransferPucCode
        : ORDER_ACCOUNTING_DEFAULTS.debitCashPucCode;

    return this.loadDefaultPucReferenceOrThrow(debitPucCode);
  }

  private async resolveOrderInventoryCosts(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
  ) {
    const saleMovements = await tx.inventoryMovement.findMany({
      where: {
        businessId,
        type: 'SALE',
        OR: [{ orderId }, { reservationId: orderId }],
      },
      select: {
        totalValue: true,
        orderItemId: true,
        reservationId: true,
      },
    });

    return saleMovements;
  }

  private parseDateBoundary(value: string, boundary: 'start' | 'end') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const monthIndex = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);

      return boundary === 'start'
        ? new Date(year, monthIndex, day, 0, 0, 0, 0)
        : new Date(year, monthIndex, day, 23, 59, 59, 999);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date filter');
    }

    return parsed;
  }

  async createMovement(businessId: string, dto: CreateAccountingMovementDto) {
    const reference = await this.loadPucReferenceOrThrow({
      pucCuentaCode: dto.pucCuentaCode,
      pucSubcuentaId: dto.pucSubcuentaId,
    });

    const movement = await this.prisma.accountingMovement.create({
      data: {
        businessId,
        ...this.movementPucData(reference),
        amount: dto.amount,
        nature: dto.nature,
        date: new Date(dto.date),
        detail: this.normalizeDetail(dto.detail),
        originType: dto.originType,
        originId: dto.originId ?? null,
      },
      include: this.movementInclude(),
    });

    return this.serializeMovement(movement);
  }

  async postOrderMovements(
    tx: Prisma.TransactionClient,
    businessId: string,
    order: OrderForPosting,
  ) {
    if (!order.items.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // 1. Cargar contexto fiscal e impuestos
    const fiscalContext = await tx.orderFiscalContext.findUnique({
      where: { orderId: order.id },
    });

    const taxLines = await tx.saleTaxLine.findMany({
      where: { orderId: order.id, applied: true },
    });

    // 2. Determinar montos
    // El débito de Caja/Banco es netReceived si existe contexto fiscal, sino el total de la orden
    const debitAmount = fiscalContext ? fiscalContext.netReceived : new Prisma.Decimal(order.total);
    if (!debitAmount.isPositive() && !fiscalContext) {
      throw new BadRequestException('Order total must be greater than zero');
    }

    const lines = this.buildPostingLines(order).filter((line) =>
      line.amount.isPositive(),
    );
    if (!lines.length) {
      throw new BadRequestException('Order must contain billable items');
    }

    const debitReference = await this.resolveAutomaticDebitReference(order);
    const incomeReferences = new Map<AccountingItemType, ResolvedPucReference>();
    for (const itemType of new Set(lines.map((line) => line.type))) {
      incomeReferences.set(
        itemType,
        await this.resolveIncomeReference(itemType),
      );
    }

    const date = order.accountingPostedAt ?? order.updatedAt ?? new Date();
    const debitDetail =
      lines.length === 1
        ? `Contrapartida ${lines[0].type === 'SERVICE' ? 'servicio' : 'producto'} - ${lines[0].name}`
        : 'Contrapartida venta mixta';

    const movements: any[] = [];

    // --- DEBITS ---
    // A. Caja/Banco (Neto recibido)
    if (debitAmount.gt(0)) {
      const bankMov = await tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(debitReference),
          amount: debitAmount,
          nature: MovementNature.DEBIT,
          date,
          detail: debitDetail,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
          metadata: { kind: 'SALE_TAX', taxType: 'NET_RECEIVED' },
        },
        include: this.movementInclude(),
      });
      movements.push(bankMov);
    }

    // B. Anticipos de Retenciones (RETEFUENTE, RETEIVA, RETEICA) que son débitos
    for (const tLine of taxLines.filter((l) => l.direction === TaxDirection.WITHHOLD)) {
      const code = tLine.accountCode;
      const ref = await this.loadPucReferenceOrThrow(
        code.length === 4 ? { pucCuentaCode: code } : { pucSubcuentaId: code }
      );
      const withholdingMov = await tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(ref),
          amount: tLine.taxAmount,
          nature: MovementNature.DEBIT,
          date,
          detail: `Anticipo de ${tLine.taxType} retenido por cliente`,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
          metadata: { kind: 'SALE_TAX', taxType: tLine.taxType },
        },
        include: this.movementInclude(),
      });
      movements.push(withholdingMov);
    }

    // --- CREDITS ---
    // A. Ingresos por Ventas (Productos / Servicios)
    movements.push(
      ...(await Promise.all(
        lines.map((line) =>
          tx.accountingMovement.create({
            data: {
              businessId,
              ...this.movementPucData(incomeReferences.get(line.type)!),
              amount: line.amount,
              nature: MovementNature.CREDIT,
              date,
              detail:
                line.type === 'SERVICE'
                  ? `Ingreso por servicio - ${line.name}`
                  : `Ingreso por venta de producto - ${line.name}`,
              originType: AccountingMovementOriginType.ORDER,
              originId: order.id,
            },
            include: this.movementInclude(),
          }),
        ),
      )),
    );

    // B. Impuestos cobrados (IVA, IMPOCONSUMO) que son créditos (pasivos por pagar)
    for (const tLine of taxLines.filter((l) => l.direction === TaxDirection.CHARGE)) {
      const code = tLine.accountCode;
      const ref = await this.loadPucReferenceOrThrow(
        code.length === 4 ? { pucCuentaCode: code } : { pucSubcuentaId: code }
      );
      const taxChargedMov = await tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(ref),
          amount: tLine.taxAmount,
          nature: MovementNature.CREDIT,
          date,
          detail: `${tLine.taxType} generado en venta`,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
          metadata: { kind: 'SALE_TAX', taxType: tLine.taxType },
        },
        include: this.movementInclude(),
      });
      movements.push(taxChargedMov);
    }

    // --- AUTORRETENCIONES (Cuentas Espejo, solo si postToAccounting = true) ---
    for (const tLine of taxLines.filter((l) => l.direction === TaxDirection.SELF)) {
      let rule = null;
      if (fiscalContext?.saleConcept) {
        rule = await tx.salesTaxRule.findFirst({
          where: {
            businessId,
            taxType: tLine.taxType,
            direction: TaxDirection.SELF,
            active: true,
            saleConcept: fiscalContext.saleConcept,
          },
        });
      }
      if (!rule) {
        rule = await tx.salesTaxRule.findFirst({
          where: {
            businessId,
            taxType: tLine.taxType,
            direction: TaxDirection.SELF,
            active: true,
            saleConcept: null,
          },
        });
      }

      if (rule && rule.postToAccounting) {
        const refCredito = await this.loadPucReferenceOrThrow(
          tLine.accountCode.length === 4 ? { pucCuentaCode: tLine.accountCode } : { pucSubcuentaId: tLine.accountCode }
        );
        const debitCode = '135515';
        const refDebito = await this.loadDefaultPucReferenceOrThrow(debitCode);

        const autoDeb = await tx.accountingMovement.create({
          data: {
            businessId,
            ...this.movementPucData(refDebito),
            amount: tLine.taxAmount,
            nature: MovementNature.DEBIT,
            date,
            detail: `Autorretención especial de renta - Débito (Anticipo)`,
            originType: AccountingMovementOriginType.ORDER,
            originId: order.id,
            metadata: { kind: 'SALE_TAX', taxType: tLine.taxType },
          },
          include: this.movementInclude(),
        });

        const autoCred = await tx.accountingMovement.create({
          data: {
            businessId,
            ...this.movementPucData(refCredito),
            amount: tLine.taxAmount,
            nature: MovementNature.CREDIT,
            date,
            detail: `Autorretención especial de renta - Crédito (Pasivo)`,
            originType: AccountingMovementOriginType.ORDER,
            originId: order.id,
            metadata: { kind: 'SALE_TAX', taxType: tLine.taxType },
          },
          include: this.movementInclude(),
        });

        movements.push(autoDeb, autoCred);
      }
    }

    const inventoryMovements = await this.resolveOrderInventoryCosts(
      tx,
      businessId,
      order.id,
    );

    if (inventoryMovements.length > 0) {
      const inventoryReference = await this.loadPucReferenceOrThrow({
        pucCuentaCode: ORDER_ACCOUNTING_DEFAULTS.inventoryPucCode,
      });
      const costReferences = new Map<AccountingItemType, ResolvedPucReference>();
      for (const itemType of new Set(lines.map((line) => line.type))) {
        costReferences.set(
          itemType,
          await this.loadPucReferenceOrThrow({
            pucCuentaCode: ORDER_ACCOUNTING_DEFAULTS.costPucCodeByType[itemType],
          }),
        );
      }

      const costByLineId = new Map<string, Prisma.Decimal>();
      const unassignedCost = inventoryMovements.reduce(
        (total, movement) => {
          const value = new Prisma.Decimal(movement.totalValue);
          if (movement.orderItemId) {
            const current =
              costByLineId.get(movement.orderItemId) ?? new Prisma.Decimal(0);
            costByLineId.set(movement.orderItemId, current.add(value));
            return total;
          }
          return total.add(value);
        },
        new Prisma.Decimal(0),
      );

      if (unassignedCost.gt(0)) {
        const reservationLine =
          lines.find((line) => line.type === 'SERVICE') ?? lines[0];
        const current =
          costByLineId.get(reservationLine.id) ?? new Prisma.Decimal(0);
        costByLineId.set(reservationLine.id, current.add(unassignedCost));
      }

      const costMovements = (
        await Promise.all(
          lines.map(async (line) => {
            const lineCost = (
              costByLineId.get(line.id) ?? new Prisma.Decimal(0)
            ).toDecimalPlaces(2);
            if (!lineCost.gt(0)) return [];

            const isService = line.type === 'SERVICE';
            return Promise.all([
              tx.accountingMovement.create({
                data: {
                  businessId,
                  ...this.movementPucData(costReferences.get(line.type)!),
                  amount: lineCost,
                  nature: MovementNature.DEBIT,
                  date,
                  detail: isService
                    ? `Consumo de insumos por servicio - ${line.name}`
                    : `Costo de venta de producto - ${line.name}`,
                  originType: AccountingMovementOriginType.ORDER,
                  originId: order.id,
                },
                include: this.movementInclude(),
              }),
              tx.accountingMovement.create({
                data: {
                  businessId,
                  ...this.movementPucData(inventoryReference),
                  amount: lineCost,
                  nature: MovementNature.CREDIT,
                  date,
                  detail: isService
                    ? `Salida de inventario por servicio - ${line.name}`
                    : `Salida de inventario por venta de producto - ${line.name}`,
                  originType: AccountingMovementOriginType.ORDER,
                  originId: order.id,
                },
                include: this.movementInclude(),
              }),
            ]);
          }),
        )
      ).flat();

      movements.push(...costMovements);
    }

    // --- VALIDACIÓN DE BALANCE (DÉBITOS = CRÉDITOS) ---
    let sumDebits = new Prisma.Decimal(0);
    let sumCredits = new Prisma.Decimal(0);
    for (const mov of movements) {
      const amt = new Prisma.Decimal(mov.amount);
      if (mov.nature === MovementNature.DEBIT) {
        sumDebits = sumDebits.add(amt);
      } else if (mov.nature === MovementNature.CREDIT) {
        sumCredits = sumCredits.add(amt);
      }
    }
    const difference = sumDebits.sub(sumCredits).abs();
    if (difference.gt(new Prisma.Decimal(1.0))) {
      throw new BadRequestException(
        `Desbalance contable detectado en la venta: Débitos ($${sumDebits.toFixed(2)}) y Créditos ($${sumCredits.toFixed(2)}) no coinciden. Diferencia: $${difference.toFixed(2)}`
      );
    }

    return movements.map((movement) => this.serializeMovement(movement));
  }

  async findAllMovements(businessId: string, q: AccountingMovementsQueryDto) {
    const [archivedOrders, archivedReservations] = await Promise.all([
      this.prisma.order.findMany({
        where: { businessId, archived: true },
        select: { id: true },
      }),
      this.prisma.reservation.findMany({
        where: { businessId, archived: true },
        select: { id: true },
      }),
    ]);

    const archivedIds = [
      ...archivedOrders.map((o) => o.id),
      ...archivedReservations.map((r) => r.id),
    ];

    const where: Prisma.AccountingMovementWhereInput = { businessId };

    if (archivedIds.length > 0) {
      where.NOT = {
        originId: { in: archivedIds },
        originType: AccountingMovementOriginType.ORDER,
      };
    }

    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = this.parseDateBoundary(q.from, 'start');
      if (q.to) where.date.lte = this.parseDateBoundary(q.to, 'end');
    }

    if (q.pucSubcuentaId) {
      if (!where.AND) where.AND = [];
      (where.AND as Prisma.AccountingMovementWhereInput[]).push({
        OR: [
          { pucSubcuentaId: q.pucSubcuentaId },
          { pucCuentaCode: q.pucSubcuentaId },
        ],
      });
    }

    if (q.originType) where.originType = q.originType;

    if (q.priceMin !== undefined || q.priceMax !== undefined) {
      where.amount = {};
      if (q.priceMin !== undefined) where.amount.gte = q.priceMin;
      if (q.priceMax !== undefined) where.amount.lte = q.priceMax;
    }

    if (q.search) {
      if (!where.AND) where.AND = [];
      const search = q.search.trim();
      const isNumeric = /^\d+(\.\d+)?$/.test(search);

      let amountMatchIds: string[] = [];
      if (isNumeric) {
        const rawMatches = await this.prisma.$queryRaw<{id: string}[]>`
          SELECT id FROM "AccountingMovement"
          WHERE "businessId" = ${businessId}
          AND CAST(amount AS TEXT) LIKE ${'%' + search + '%'}
        `;
        amountMatchIds = rawMatches.map((r) => r.id);
      }

      const numericOrs: Prisma.AccountingMovementWhereInput[] = [
        { pucCuentaCode: { startsWith: search } },
        { pucSubcuentaId: { startsWith: search } },
        { detail: { contains: search, mode: 'insensitive' } },
        { pucCuenta: { name: { contains: search, mode: 'insensitive' } } },
        { pucSubcuenta: { name: { contains: search, mode: 'insensitive' } } },
      ];

      if (amountMatchIds.length > 0) {
        numericOrs.push({ id: { in: amountMatchIds } });
      }

      const searchFilter: Prisma.AccountingMovementWhereInput = isNumeric
        ? { OR: numericOrs }
        : {
            OR: [
              { detail: { contains: search, mode: 'insensitive' } },
              { pucCuenta: { name: { contains: search, mode: 'insensitive' } } },
              { pucSubcuenta: { name: { contains: search, mode: 'insensitive' } } },
            ],
          };

      (where.AND as Prisma.AccountingMovementWhereInput[]).push(searchFilter);
    }

    const movements = await this.prisma.accountingMovement.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: this.movementInclude(),
    });

    return movements.map((movement) => this.serializeMovement(movement));
  }

  async findOneMovement(businessId: string, id: string) {
    const movement = await this.loadMovementOrThrow(businessId, id);
    return this.serializeMovement(movement);
  }

  async updateMovement(
    businessId: string,
    id: string,
    dto: UpdateAccountingMovementDto,
  ) {
    const existing = await this.loadMovementOrThrow(businessId, id);
    const isManual = existing.originType === AccountingMovementOriginType.MANUAL;

    if (!isManual) {
      const hasForbiddenChange =
        dto.amount !== undefined ||
        dto.nature !== undefined ||
        dto.date !== undefined ||
        dto.originType !== undefined ||
        dto.originId !== undefined;

      if (hasForbiddenChange) {
        throw new ForbiddenException(
          'Los movimientos de ventas solo permiten editar PUC y descripcion',
        );
      }
    }

    const data: Prisma.AccountingMovementUpdateInput = {};
    const wantsToUpdatePuc =
      dto.pucCuentaCode !== undefined || dto.pucSubcuentaId !== undefined;

    if (wantsToUpdatePuc) {
      const currentPuc = {
        pucCuentaCode: existing.pucCuentaCode,
        pucSubcuentaId: existing.pucSubcuentaId,
      };
      const reference = await this.loadPucReferenceOrThrow({
        pucCuentaCode:
          dto.pucCuentaCode === undefined ? currentPuc.pucCuentaCode : dto.pucCuentaCode,
        pucSubcuentaId:
          dto.pucSubcuentaId === undefined
            ? currentPuc.pucSubcuentaId
            : dto.pucSubcuentaId,
      });

      Object.assign(data, this.movementPucData(reference));
    }

    if (dto.detail !== undefined) {
      data.detail = this.normalizeDetail(dto.detail);
    }

    if (isManual) {
      if (dto.amount !== undefined) data.amount = dto.amount;
      if (dto.nature !== undefined) data.nature = dto.nature;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.originType !== undefined) data.originType = dto.originType;
      if (dto.originId !== undefined) data.originId = dto.originId;
    }

    const updated = await this.prisma.accountingMovement.update({
      where: { id },
      data,
      include: this.movementInclude(),
    });

    return this.serializeMovement(updated);
  }

  async removeMovement(businessId: string, id: string) {
    const movement = await this.loadMovementOrThrow(businessId, id);

    if (movement.originType !== AccountingMovementOriginType.MANUAL) {
      throw new ForbiddenException(
        'Los movimientos generados desde ventas no se pueden eliminar',
      );
    }

    await this.prisma.accountingMovement.delete({ where: { id } });
    return { ok: true, id };
  }

  async searchPuc(q: string) {
    const query = (q ?? '').trim();
    if (!query) return [];

    const isNumericQuery = /^\d+$/.test(query);
    const normalizedQuery = this.normalizeSearchText(query);

    if (!normalizedQuery && !isNumericQuery) return [];

    const [cuentas, subcuentas] = isNumericQuery
      ? await this.prisma.$transaction([
          this.prisma.pucCuenta.findMany({
            where: { code: { startsWith: query } },
            take: 20,
            orderBy: { code: 'asc' },
          }),
          this.prisma.pucSubcuenta.findMany({
            where: {
              active: true,
              code: { startsWith: query },
            },
            take: 20,
            orderBy: { code: 'asc' },
          }),
        ])
      : await this.prisma.$transaction([
          this.prisma.pucCuenta.findMany({
            select: { code: true, name: true },
            orderBy: { code: 'asc' },
          }),
          this.prisma.pucSubcuenta.findMany({
            where: { active: true },
            select: { code: true, name: true, cuentaCode: true },
            orderBy: { code: 'asc' },
          }),
        ]);

    const filteredCuentas = isNumericQuery
      ? cuentas
      : cuentas
          .filter((cuenta) => {
            const normalizedName = this.normalizeSearchText(cuenta.name);
            return (
              normalizedName.includes(normalizedQuery) ||
              cuenta.code.startsWith(query)
            );
          })
          .slice(0, 20);

    const filteredSubcuentas = isNumericQuery
      ? subcuentas
      : subcuentas
          .filter((subcuenta) => {
            const normalizedName = this.normalizeSearchText(subcuenta.name);
            return (
              normalizedName.includes(normalizedQuery) ||
              subcuenta.code.startsWith(query)
            );
          })
          .slice(0, 20);

    return [
      ...filteredCuentas.map((c) => ({
        kind: 'CUENTA' as const,
        code: c.code,
        name: c.name,
      })),
      ...filteredSubcuentas.map((s) => ({
        kind: 'SUBCUENTA' as const,
        code: s.code,
        name: s.name,
        parentCode: s.cuentaCode,
      })),
    ];
  }

  async getPuc(code: string) {
    const sub = await this.prisma.pucSubcuenta.findUnique({ where: { code } });
    if (sub) return { kind: 'SUBCUENTA' as const, ...sub };

    const cuenta = await this.prisma.pucCuenta.findUnique({ where: { code } });
    if (cuenta) return { kind: 'CUENTA' as const, ...cuenta };

    throw new NotFoundException('PUC code not found');
  }

  async listPucClases() {
    return this.prisma.pucClase.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    });
  }

  async listPucGrupos(claseCode: string) {
    const code = (claseCode ?? '').trim();
    if (!code) throw new BadRequestException('Query param "clase" is required');

    return this.prisma.pucGrupo.findMany({
      where: { claseCode: code },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, claseCode: true },
    });
  }

  async listPucCuentas(grupoCode: string) {
    const code = (grupoCode ?? '').trim();
    if (!code) throw new BadRequestException('Query param "grupo" is required');

    return this.prisma.pucCuenta.findMany({
      where: { grupoCode: code },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, grupoCode: true },
    });
  }

  async listPucSubcuentas(cuentaCode: string) {
    const code = (cuentaCode ?? '').trim();
    if (!code)
      throw new BadRequestException('Query param "cuenta" is required');

    return this.prisma.pucSubcuenta.findMany({
      where: { cuentaCode: code, active: true },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, cuentaCode: true },
    });
  }

  async getSummary(businessId: string, q: AccountingMovementsQueryDto) {
    const [archivedOrders, archivedReservations] = await Promise.all([
      this.prisma.order.findMany({
        where: { businessId, archived: true },
        select: { id: true },
      }),
      this.prisma.reservation.findMany({
        where: { businessId, archived: true },
        select: { id: true },
      }),
    ]);

    const archivedIds = [
      ...archivedOrders.map((o) => o.id),
      ...archivedReservations.map((r) => r.id),
    ];

    const where: Prisma.AccountingMovementWhereInput = { businessId };

    if (archivedIds.length > 0) {
      where.NOT = {
        originId: { in: archivedIds },
        originType: AccountingMovementOriginType.ORDER,
      };
    }

    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = this.parseDateBoundary(q.from, 'start');
      if (q.to) where.date.lte = this.parseDateBoundary(q.to, 'end');
    }

    const movements = await this.prisma.accountingMovement.findMany({
      where,
      select: {
        pucCuentaCode: true,
        pucSubcuentaId: true,
        amount: true,
        nature: true,
      },
    });

    let grossSales = 0;
    let returns = 0;
    let costs = 0;
    let operatingExpenses = 0;
    let nonOperatingIncome = 0;
    let nonOperatingExpenses = 0;

    for (const r of movements) {
      const code = (r.pucSubcuentaId || r.pucCuentaCode || '').trim();
      if (!code) continue;

      const amount = Number(r.amount ?? 0);
      const first = code.charAt(0);
      
      let signedValue = 0;
      if (first === '4') {
        signedValue = r.nature === 'CREDIT' ? amount : -amount;
      } else if (first === '5' || first === '6') {
        signedValue = r.nature === 'DEBIT' ? amount : -amount;
      } else {
        continue;
      }

      if (code.startsWith('4175')) {
        returns += -signedValue;
      } else if (code.startsWith('41')) {
        grossSales += signedValue;
      } else if (code.startsWith('42')) {
        nonOperatingIncome += signedValue;
      } else if (code.startsWith('61')) {
        costs += signedValue;
      } else if (code.startsWith('51') || code.startsWith('52')) {
        operatingExpenses += signedValue;
      } else if (code.startsWith('53')) {
        nonOperatingExpenses += signedValue;
      }
    }

    const netSales = grossSales - returns;
    const grossProfit = netSales - costs;
    const operatingProfit = grossProfit - operatingExpenses;
    const profitBeforeTax = operatingProfit + nonOperatingIncome - nonOperatingExpenses;
    
    const taxProvision = profitBeforeTax > 0 ? profitBeforeTax * 0.35 : 0;
    const netIncome = profitBeforeTax - taxProvision;
    const legalReserve = netIncome > 0 ? netIncome * 0.10 : 0;
    const netProfit = netIncome - legalReserve;

    return {
      balanceTotal: Math.round(netProfit),
      eficiencia: 85,
      operacionComercial: {
        ventasNetas: Math.round(netSales),
        costosMercancia: Math.round(costs),
        utilidadBruta: Math.round(grossProfit),
        devoluciones: Math.round(returns),
      },
      gastosAdministrativos: {
        nominaSueldos: Math.round(operatingExpenses * 0.60),
        insumosOperativos: Math.round(operatingExpenses * 0.25),
        serviciosFijos: Math.round(operatingExpenses * 0.15 + nonOperatingExpenses),
      },
      impuestosReservas: {
        iva: Math.round(taxProvision * 0.50),
        retenciones: Math.round(taxProvision * 0.50),
        fondosReserva: Math.round(legalReserve),
      },
    };
  }
}
