import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingMovementOriginType,
  MovementNature,
  OrderStatus,
  Prisma,
  SimpleTaxPeriodStatus,
  SimpleTaxPeriodType,
  TaxDirection,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingMovementsQueryDto } from './dto/accounting-movements-query.dto';
import { CreateAccountingMovementDto } from './dto/create-accounting-movement.dto';
import { UpdateAccountingMovementDto } from './dto/update-accounting-movement.dto';
import {
  CreateManualPaidOutflowDto,
  ManualPaidOutflowPaymentMethod,
  ManualPaidOutflowType,
} from './dto/create-manual-paid-outflow.dto';

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

const MANUAL_PAID_OUTFLOW_DEFAULTS = {
  cashPucCode: '110505',
  transferPucCode: '111005',
} as const;

const SIMPLE_TAX_RESPONSIBILITY_CODE = '47';

type ExpenseGroupDefinition = {
  id: string;
  label: string;
  icon: string;
  description: string;
  prefixes: string[];
  nameIncludes?: string[];
};

const EXPENSE_GROUPS: ExpenseGroupDefinition[] = [
  {
    id: 'personnel',
    label: 'Gastos de personal',
    icon: 'Users',
    description: 'Sueldos, auxilios y pagos al equipo',
    prefixes: ['5105', '5205'],
  },
  {
    id: 'honorarios',
    label: 'Honorarios',
    icon: 'BriefcaseBusiness',
    description: 'Servicios profesionales y asesorias',
    prefixes: ['5110', '5210'],
  },
  {
    id: 'taxes',
    label: 'Impuestos',
    icon: 'Landmark',
    description: 'Impuestos, tasas y contribuciones',
    prefixes: ['5115', '5215'],
  },
  {
    id: 'rent',
    label: 'Arrendamientos',
    icon: 'Building2',
    description: 'Alquileres, arriendos y espacios',
    prefixes: ['5120', '5220'],
  },
  {
    id: 'services',
    label: 'Servicios',
    icon: 'Zap',
    description: 'Servicios publicos y pagos recurrentes',
    prefixes: ['5135', '5235'],
  },
  {
    id: 'maintenance',
    label: 'Mantenimiento',
    icon: 'Wrench',
    description: 'Reparaciones y conservacion de activos',
    prefixes: ['5145', '5245'],
  },
  {
    id: 'transport',
    label: 'Transporte',
    icon: 'Truck',
    description: 'Movilidad, fletes y traslados',
    prefixes: ['5130', '5155', '5230', '5255'],
  },
  {
    id: 'marketing',
    label: 'Publicidad / Marketing',
    icon: 'Megaphone',
    description: 'Promocion, relaciones publicas y presencia comercial',
    prefixes: ['5195', '5295'],
    nameIncludes: ['publicidad', 'propaganda', 'representacion', 'relaciones publicas'],
  },
  {
    id: 'other',
    label: 'Otros',
    icon: 'MoreHorizontal',
    description: 'Gastos diversos no clasificados',
    prefixes: ['5195', '5295', '5305', '5315', '5395'],
  },
] as const;

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

  private parseOccurredAt(value?: string) {
    if (!value) return new Date();

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Fecha del movimiento invalida');
    }

    return date;
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

  async listManualPaidOutflowCategories(type?: string, q?: string) {
    const normalizedType = String(type ?? '').toUpperCase();
    if (normalizedType && normalizedType !== ManualPaidOutflowType.EXPENSE) {
      return [];
    }

    const subcuentas = await this.prisma.pucSubcuenta.findMany({
      where: {
        active: true,
        cuenta: {
          grupo: {
            claseCode: '5',
          },
        },
      },
      include: {
        cuenta: {
          include: {
            grupo: {
              include: { clase: true },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    const query = this.normalizeSearchText(q ?? '');
    const filteredSubcuentas = query
      ? subcuentas.filter((subcuenta) => {
          const searchable = [
            subcuenta.code,
            subcuenta.name,
            subcuenta.cuenta.name,
            subcuenta.cuenta.grupo.name,
          ]
            .map((value) => this.normalizeSearchText(value))
            .join(' ');

          return searchable.includes(query);
        })
      : subcuentas;

    return filteredSubcuentas.map((subcuenta) => ({
      id: subcuenta.code,
      code: subcuenta.code,
      name: subcuenta.name,
      type: ManualPaidOutflowType.EXPENSE,
      parentName: subcuenta.cuenta.name,
      isSelectable: true,
      pucCode: subcuenta.code,
      pucName: subcuenta.name,
      pucKind: 'SUBCUENTA' as const,
      group: {
        code: subcuenta.cuenta.grupo.code,
        name: subcuenta.cuenta.grupo.name,
      },
      clase: {
        code: subcuenta.cuenta.grupo.clase.code,
        name: subcuenta.cuenta.grupo.clase.name,
      },
    }));
  }

  listExpenseGroups() {
    return EXPENSE_GROUPS.map(({ prefixes, nameIncludes, ...group }) => ({
      ...group,
      pucPrefix: prefixes[0],
    }));
  }

  private expenseGroupOrThrow(groupId: string) {
    const group = EXPENSE_GROUPS.find((item) => item.id === groupId);
    if (!group) {
      throw new NotFoundException('Categoria de gasto no encontrada');
    }
    return group;
  }

  private serializeExpenseAccount(subcuenta: any) {
    return {
      id: subcuenta.code,
      code: subcuenta.code,
      name: subcuenta.name,
      type: ManualPaidOutflowType.EXPENSE,
      parentName: subcuenta.cuenta.name,
      isSelectable: true,
      pucCode: subcuenta.code,
      pucName: subcuenta.name,
      pucKind: 'SUBCUENTA' as const,
      group: {
        code: subcuenta.cuenta.grupo.code,
        name: subcuenta.cuenta.grupo.name,
      },
      clase: {
        code: subcuenta.cuenta.grupo.clase.code,
        name: subcuenta.cuenta.grupo.clase.name,
      },
    };
  }

  async listExpenseGroupAccounts(groupId: string, q?: string) {
    const group = this.expenseGroupOrThrow(groupId);

    const subcuentas = await this.prisma.pucSubcuenta.findMany({
      where: {
        active: true,
        cuenta: {
          grupo: {
            claseCode: '5',
          },
        },
        OR: group.prefixes.map((prefix) => ({
          code: { startsWith: prefix },
        })),
      },
      include: {
        cuenta: {
          include: {
            grupo: {
              include: { clase: true },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
      take: 120,
    });

    const normalizedNameIncludes = (group as any).nameIncludes?.map((value: string) =>
      this.normalizeSearchText(value),
    );
    const query = this.normalizeSearchText(q ?? '');

    const filtered = subcuentas.filter((subcuenta) => {
      const searchable = [
        subcuenta.code,
        subcuenta.name,
        subcuenta.cuenta.name,
        subcuenta.cuenta.grupo.name,
      ]
        .map((value) => this.normalizeSearchText(value))
        .join(' ');

      const matchesGroupNames =
        !normalizedNameIncludes?.length ||
        normalizedNameIncludes.some((needle: string) =>
          searchable.includes(needle),
        );

      const matchesQuery = !query || searchable.includes(query);

      return matchesGroupNames && matchesQuery;
    });

    return filtered.slice(0, 80).map((subcuenta) =>
      this.serializeExpenseAccount(subcuenta),
    );
  }

  async createManualPaidOutflow(
    businessId: string,
    userId: string,
    dto: CreateManualPaidOutflowDto,
  ) {
    if (!businessId) {
      throw new BadRequestException('businessId es obligatorio');
    }

    const businessUser = await this.prisma.user.findFirst({
      where: { id: userId, businessId },
      select: { id: true },
    });

    if (!businessUser) {
      throw new ForbiddenException('El usuario no pertenece al negocio');
    }

    const counterpartyName = dto.counterpartyName?.trim();
    const description = dto.description?.trim();

    if (!counterpartyName) {
      throw new BadRequestException('Beneficiario obligatorio');
    }
    if (!description) {
      throw new BadRequestException('Descripcion obligatoria');
    }

    const amount = new Prisma.Decimal(dto.amount ?? 0).toDecimalPlaces(2);
    if (!amount.isPositive()) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }

    const categoryCode = dto.categoryId?.trim();
    if (!categoryCode) {
      throw new BadRequestException('Categoria obligatoria');
    }
    if (dto.type !== ManualPaidOutflowType.EXPENSE) {
      throw new BadRequestException('Este flujo solo permite registrar gastos');
    }

    const creditPucCode =
      dto.paymentMethod === ManualPaidOutflowPaymentMethod.CASH
        ? MANUAL_PAID_OUTFLOW_DEFAULTS.cashPucCode
        : MANUAL_PAID_OUTFLOW_DEFAULTS.transferPucCode;

    const occurredAt = this.parseOccurredAt(dto.occurredAt);
    const originId = `manual-outflow-${randomUUID()}`;

    const movements = await this.prisma.$transaction(async (tx) => {
      const [categoryCuenta, categorySubcuenta, creditSubcuenta, creditCuenta] =
        await Promise.all([
          tx.pucCuenta.findUnique({
            where: { code: categoryCode },
            include: {
              grupo: {
                include: { clase: true },
              },
            },
          }),
          tx.pucSubcuenta.findUnique({
            where: { code: categoryCode },
            include: {
              cuenta: {
                include: {
                  grupo: {
                    include: { clase: true },
                  },
                },
              },
            },
          }),
          tx.pucSubcuenta.findUnique({
            where: { code: creditPucCode },
            include: {
              cuenta: {
                include: {
                  grupo: {
                    include: { clase: true },
                  },
                },
              },
            },
          }),
          tx.pucCuenta.findUnique({
            where: { code: creditPucCode },
            include: {
              grupo: {
                include: { clase: true },
              },
            },
          }),
        ]);

      const categoryClass =
        categorySubcuenta?.cuenta.grupo.claseCode ??
        categoryCuenta?.grupo.claseCode;

      if (!categoryCuenta && !categorySubcuenta) {
        throw new BadRequestException('Categoria contable invalida');
      }
      if (categoryCuenta && !categorySubcuenta) {
        throw new BadRequestException(
          'Debe seleccionarse una subcuenta PUC de gasto imputable',
        );
      }
      if (categorySubcuenta && !categorySubcuenta.active) {
        throw new BadRequestException('Categoria contable inactiva');
      }
      if (categoryClass !== '5') {
        throw new BadRequestException(
          'La categoria seleccionada no corresponde a gastos',
        );
      }

      const debitReference: ResolvedPucReference = {
        kind: 'SUBCUENTA',
        code: categorySubcuenta!.code,
        name: categorySubcuenta!.name,
        cuentaCode: categorySubcuenta!.cuentaCode,
      };

      const creditReference: ResolvedPucReference | null = creditSubcuenta
        ? {
            kind: 'SUBCUENTA',
            code: creditSubcuenta.code,
            name: creditSubcuenta.name,
            cuentaCode: creditSubcuenta.cuentaCode,
          }
        : creditCuenta
          ? {
              kind: 'CUENTA',
              code: creditCuenta.code,
              name: creditCuenta.name,
            }
          : null;

      if (!creditReference || (creditSubcuenta && !creditSubcuenta.active)) {
        throw new BadRequestException(
          dto.paymentMethod === ManualPaidOutflowPaymentMethod.CASH
            ? 'La cuenta de Caja no existe o esta inactiva'
            : 'La cuenta de Bancos no existe o esta inactiva',
        );
      }

      const metadata: Prisma.InputJsonObject = {
        kind: 'MANUAL_PAID_OUTFLOW',
        source: 'MANUAL',
        type: dto.type,
        counterpartyName,
        paymentMethod: dto.paymentMethod,
        accountingCategoryId: categoryCode,
        debitPucCode: debitReference.code,
        creditPucCode: creditReference.code,
        createdBy: userId,
      };

      const commonData = {
        businessId,
        amount,
        date: occurredAt,
        originType: AccountingMovementOriginType.MANUAL,
        originId,
        metadata,
      };

      const debitMovement = await tx.accountingMovement.create({
        data: {
          ...commonData,
          ...this.movementPucData(debitReference),
          nature: MovementNature.DEBIT,
          detail: `${description} - ${counterpartyName}`,
        },
        include: this.movementInclude(),
      });

      const creditMovement = await tx.accountingMovement.create({
        data: {
          ...commonData,
          ...this.movementPucData(creditReference),
          nature: MovementNature.CREDIT,
          detail: `Pago ${dto.paymentMethod === ManualPaidOutflowPaymentMethod.CASH ? 'en efectivo' : 'por transferencia'} - ${counterpartyName}`,
        },
        include: this.movementInclude(),
      });

      return [debitMovement, creditMovement];
    });

    return {
      ok: true,
      originId,
      movements: movements.map((movement) => this.serializeMovement(movement)),
    };
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
    
    const simpleTaxProjection = await this.buildSimpleTaxProjection(
      businessId,
      q,
      Math.round(profitBeforeTax),
    );
    const isOpenSimpleTaxEstimate =
      simpleTaxProjection?.enabled &&
      simpleTaxProjection.configured &&
      simpleTaxProjection.source === 'MONTHLY_MIN_RATE';
    const hasConfiguredSimpleTaxProjection =
      simpleTaxProjection?.enabled && simpleTaxProjection.configured;

    const taxProvision = isOpenSimpleTaxEstimate
      ? simpleTaxProjection.estimatedSimpleTax
      : hasConfiguredSimpleTaxProjection
        ? 0
        : profitBeforeTax > 0
        ? profitBeforeTax * 0.35
        : 0;
    const netIncome = profitBeforeTax - taxProvision;
    const legalReserve = hasConfiguredSimpleTaxProjection
      ? 0
      : netIncome > 0
        ? netIncome * 0.10
        : 0;
    const netProfit = netIncome - legalReserve;
    if (simpleTaxProjection?.source === 'POSTED_ACTUAL') {
      simpleTaxProjection.netProfitBeforeSimpleTax = Math.round(netProfit);
      simpleTaxProjection.netProfitAfterSimpleTax = Math.round(netProfit);
    }

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
        iva: isOpenSimpleTaxEstimate ? 0 : Math.round(taxProvision * 0.50),
        retenciones: isOpenSimpleTaxEstimate
          ? Math.round(taxProvision)
          : Math.round(taxProvision * 0.50),
        fondosReserva: Math.round(legalReserve),
      },
      simpleTaxProjection,
    };
  }

  private async buildSimpleTaxProjection(
    businessId: string,
    q: AccountingMovementsQueryDto,
    netProfitBeforeSimpleTax: number,
  ) {
    const hasSimpleResponsibility = await this.businessHasSimpleResponsibility(businessId);
    if (!hasSimpleResponsibility) return undefined;

    const projectionRange = this.resolveSimpleTaxProjectionRange(q);
    const config = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
    });

    const periodNumber = this.getBimonthlyPeriodNumber(projectionRange.month);
    const periodRange = this.getBimonthlyRange(projectionRange.taxYear, periodNumber);
    const base = {
      enabled: true,
      configured: Boolean(config?.enabled && config.groupCode),
      taxYear: projectionRange.taxYear,
      periodNumber,
      month: projectionRange.month,
      periodStart: this.formatDateOnly(periodRange.start),
      periodEnd: this.formatDateOnly(periodRange.end),
      projectionStart: this.formatDateOnly(projectionRange.start),
      projectionEnd: this.formatDateOnly(
        new Date(projectionRange.endExclusive.getTime() - 1),
      ),
      groupCode: config?.groupCode ?? '',
      groupName: undefined as string | undefined,
      estimatedRate: 0,
      grossIncomeBase: 0,
      estimatedSimpleTax: 0,
      netProfitBeforeSimpleTax,
      netProfitAfterSimpleTax: netProfitBeforeSimpleTax,
      source: 'MONTHLY_MIN_RATE' as const,
      periodStatus: undefined as SimpleTaxPeriodStatus | undefined,
      message: undefined as string | undefined,
    };

    if (!config?.enabled || !config.groupCode) {
      return {
        ...base,
        message: 'Configura el grupo del Regimen Simple para estimar el impuesto.',
      };
    }

    const existingPeriod = await this.prisma.simpleTaxPeriod.findUnique({
      where: {
        businessId_taxYear_periodNumber: {
          businessId,
          taxYear: projectionRange.taxYear,
          periodNumber,
        },
      },
    });

    if (
      existingPeriod?.status === SimpleTaxPeriodStatus.POSTED ||
      existingPeriod?.status === SimpleTaxPeriodStatus.PAID
    ) {
      const actualTax = Number(existingPeriod.netSimpleTax ?? 0);
      return {
        ...base,
        configured: true,
        groupCode: existingPeriod.groupCode || config.groupCode,
        groupName: existingPeriod.groupName ?? undefined,
        estimatedRate: Number(existingPeriod.appliedRate ?? 0),
        grossIncomeBase: Number(existingPeriod.taxableGrossIncome ?? 0),
        estimatedSimpleTax: Math.round(actualTax),
        netProfitAfterSimpleTax: netProfitBeforeSimpleTax,
        source: 'POSTED_ACTUAL' as const,
        periodStatus: existingPeriod.status,
        message:
          existingPeriod.status === SimpleTaxPeriodStatus.PAID
            ? 'Periodo pagado. El gasto ya esta reflejado en Contabilidad.'
            : 'Periodo cerrado. El gasto ya esta reflejado en Contabilidad.',
      };
    }

    const bracket = await this.prisma.simpleTaxRateBracket.findFirst({
      where: {
        taxYear: projectionRange.taxYear,
        periodType: SimpleTaxPeriodType.BIMONTHLY,
        groupCode: config.groupCode,
        active: true,
      },
      orderBy: { lowerUvt: 'asc' },
    });

    if (!bracket) {
      return {
        ...base,
        configured: false,
        groupCode: config.groupCode,
        message: 'No hay tarifas del Regimen Simple configuradas para este grupo y ano.',
      };
    }

    const grossIncomeBase = await this.calculateSimpleTaxProjectionGrossIncome(
      businessId,
      projectionRange.start,
      projectionRange.endExclusive,
    );
    const estimatedRate = Number(bracket.rate);
    const estimatedSimpleTax = grossIncomeBase.mul(bracket.rate);
    const estimatedSimpleTaxNumber = Math.round(Number(estimatedSimpleTax));

    return {
      ...base,
      configured: true,
      groupCode: config.groupCode,
      groupName: bracket.groupName,
      estimatedRate,
      grossIncomeBase: Math.round(Number(grossIncomeBase)),
      estimatedSimpleTax: estimatedSimpleTaxNumber,
      netProfitAfterSimpleTax: netProfitBeforeSimpleTax - estimatedSimpleTaxNumber,
      source: 'MONTHLY_MIN_RATE' as const,
      periodStatus: existingPeriod?.status,
      message: 'Estimacion usando tarifa minima del grupo. No genera asiento contable hasta presentar el bimestre.',
    };
  }

  private async businessHasSimpleResponsibility(businessId: string) {
    const profile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      include: {
        responsibilities: {
          include: { responsibility: true },
        },
      },
    });

    return Boolean(
      profile?.responsibilities.some(
        (item) => item.responsibility.code === SIMPLE_TAX_RESPONSIBILITY_CODE,
      ),
    );
  }

  private async calculateSimpleTaxProjectionGrossIncome(
    businessId: string,
    start: Date,
    endExclusive: Date,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        businessId,
        status: OrderStatus.COMPLETED,
        archived: false,
        OR: [
          { accountingPostedAt: { gte: start, lt: endExclusive } },
          {
            accountingPostedAt: null,
            createdAt: { gte: start, lt: endExclusive },
          },
        ],
      },
      select: {
        total: true,
        fiscalContext: {
          select: { subtotal: true },
        },
      },
    });

    return orders.reduce(
      (total, order) => total.add(order.fiscalContext?.subtotal ?? order.total),
      new Prisma.Decimal(0),
    );
  }

  private resolveSimpleTaxProjectionRange(q: AccountingMovementsQueryDto) {
    const anchor = q.from
      ? this.parseDateBoundary(q.from, 'start')
      : q.to
        ? this.parseDateBoundary(q.to, 'start')
        : new Date();
    const taxYear = anchor.getFullYear();
    const monthIndex = anchor.getMonth();
    const start = new Date(taxYear, monthIndex, 1, 0, 0, 0, 0);
    const endExclusive = new Date(taxYear, monthIndex + 1, 1, 0, 0, 0, 0);

    return {
      taxYear,
      month: monthIndex + 1,
      start,
      endExclusive,
    };
  }

  private getBimonthlyPeriodNumber(month: number) {
    return Math.floor((month - 1) / 2) + 1;
  }

  private getBimonthlyRange(taxYear: number, periodNumber: number) {
    const startMonth = (periodNumber - 1) * 2;
    const start = new Date(taxYear, startMonth, 1, 0, 0, 0, 0);
    const endExclusive = new Date(taxYear, startMonth + 2, 1, 0, 0, 0, 0);
    const end = new Date(endExclusive.getTime() - 1);
    return { start, end, endExclusive };
  }

  private formatDateOnly(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
