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
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingMovementsQueryDto } from './dto/accounting-movements-query.dto';
import { CreateAccountingMovementDto } from './dto/create-accounting-movement.dto';
import { UpdateAccountingMovementDto } from './dto/update-accounting-movement.dto';

const ORDER_ACCOUNTING_DEFAULTS = {
  debitCashPucCode: '1105',
  debitBankTransferPucCode: '1110',
  creditIncomePucCodeByType: {
    PRODUCT: '4135',
    SERVICE: '4235',
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

  private async resolveAutomaticPostingReferences(order: OrderForPosting) {
    const itemType =
      order.items[0]?.itemTypeSnapshot ?? order.items[0]?.item?.type ?? 'PRODUCT';
    const paymentMethod = this.resolveOrderPaymentMethod(order);

    const debitPucCode =
      paymentMethod === 'BANK_TRANSFER'
        ? ORDER_ACCOUNTING_DEFAULTS.debitBankTransferPucCode
        : ORDER_ACCOUNTING_DEFAULTS.debitCashPucCode;

    const creditPucCode =
      ORDER_ACCOUNTING_DEFAULTS.creditIncomePucCodeByType[
        itemType === 'SERVICE' ? 'SERVICE' : 'PRODUCT'
      ];

    const [debitReference, creditReference] = await Promise.all([
      this.loadPucReferenceOrThrow({ pucCuentaCode: debitPucCode }),
      this.loadPucReferenceOrThrow({ pucCuentaCode: creditPucCode }),
    ]);

    return { debitReference, creditReference, itemType };
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

    const { debitReference, creditReference, itemType } =
      await this.resolveAutomaticPostingReferences(order);

    const amount = Number(order.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Order total must be greater than zero');
    }

    const customerName = order.customerName?.trim();
    const detailSuffix = customerName ? ` - ${customerName}` : '';
    const date = order.accountingPostedAt ?? order.updatedAt ?? new Date();

    const movements = await Promise.all([
      tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(debitReference),
          amount,
          nature: MovementNature.DEBIT,
          date,
          detail: `Contrapartida venta ${itemType.toLowerCase()}${detailSuffix}`,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
        },
        include: this.movementInclude(),
      }),
      tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(creditReference),
          amount,
          nature: MovementNature.CREDIT,
          date,
          detail: `Ingreso por venta ${itemType.toLowerCase()}${detailSuffix}`,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
        },
        include: this.movementInclude(),
      }),
    ]);

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
    if (q.search) {
      if (!where.AND) where.AND = [];
      (where.AND as Prisma.AccountingMovementWhereInput[]).push({
        OR: [
          { detail: { contains: q.search, mode: 'insensitive' } },
          { pucSubcuenta: { code: { contains: q.search } } },
          { pucSubcuenta: { name: { contains: q.search, mode: 'insensitive' } } },
          { pucCuenta: { code: { contains: q.search } } },
          { pucCuenta: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      });
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
}
