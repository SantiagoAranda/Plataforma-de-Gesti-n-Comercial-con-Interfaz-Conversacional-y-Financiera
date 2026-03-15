// Simplified accounting service: only PUC utilities remain after removing
// the legacy double-entry accounting model.
import {
  BadRequestException,
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
  debitCashPucSubcuentaId: '110505',
  creditIncomePucSubcuentaIdByType: {
    PRODUCT: '413595',
    SERVICE: '417095',
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

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  /* ========= Accounting Movements (nuevo modelo) ========= */

  private parseDateBoundary(
    value: string,
    boundary: 'start' | 'end',
  ) {
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

  private async loadSubcuentaOrThrow(pucSubcuentaId: string) {
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
    if (!sub || !sub.active)
      throw new BadRequestException('PUC subcuenta inválida o inactiva');
    return sub;
  }

  async createMovement(businessId: string, dto: CreateAccountingMovementDto) {
    const sub = await this.loadSubcuentaOrThrow(dto.pucSubcuentaId);

    const movement = await this.prisma.accountingMovement.create({
      data: {
        businessId,
        pucSubcuentaId: dto.pucSubcuentaId,
        amount: dto.amount,
        nature: dto.nature,
        date: new Date(dto.date),
        detail: dto.detail,
        originType: dto.originType,
        originId: dto.originId ?? null,
      },
    });

    return {
      ...movement,
      pucCode: sub.code,
      pucName: sub.name,
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

    const itemType =
      order.items[0]?.itemTypeSnapshot ?? order.items[0]?.item?.type ?? 'PRODUCT';
    const [debitSubaccount, creditSubaccount] = await Promise.all([
      this.loadSubcuentaOrThrow(
        ORDER_ACCOUNTING_DEFAULTS.debitCashPucSubcuentaId,
      ),
      this.loadSubcuentaOrThrow(
        ORDER_ACCOUNTING_DEFAULTS.creditIncomePucSubcuentaIdByType[
          itemType === 'SERVICE' ? 'SERVICE' : 'PRODUCT'
        ],
      ),
    ]);

    const amount = Number(order.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Order total must be greater than zero');
    }

    const customerName = order.customerName?.trim();
    const detailSuffix = customerName ? ` - ${customerName}` : '';
    const date = order.accountingPostedAt ?? order.updatedAt ?? new Date();

    // In the current model an "asiento" is represented as multiple
    // AccountingMovement rows sharing the same originType/originId.
    const movements = await Promise.all([
      tx.accountingMovement.create({
        data: {
          businessId,
          pucSubcuentaId: debitSubaccount.code,
          amount,
          nature: MovementNature.DEBIT,
          date,
          detail: `Contrapartida venta ${itemType.toLowerCase()}${detailSuffix}`,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
        },
      }),
      tx.accountingMovement.create({
        data: {
          businessId,
          pucSubcuentaId: creditSubaccount.code,
          amount,
          nature: MovementNature.CREDIT,
          date,
          detail: `Ingreso por venta ${itemType.toLowerCase()}${detailSuffix}`,
          originType: AccountingMovementOriginType.ORDER,
          originId: order.id,
        },
      }),
    ]);

    return movements.map((movement, index) => {
      const subaccount = index === 0 ? debitSubaccount : creditSubaccount;
      return {
        ...movement,
        pucCode: subaccount.code,
        pucName: subaccount.name,
      };
    });
  }

  async findAllMovements(businessId: string, q: AccountingMovementsQueryDto) {
    const where: any = { businessId };

    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = this.parseDateBoundary(q.from, 'start');
      if (q.to) {
        where.date.lte = this.parseDateBoundary(q.to, 'end');
      }
    }

    if (q.pucSubcuentaId) where.pucSubcuentaId = q.pucSubcuentaId;
    if (q.originType) where.originType = q.originType;
    if (q.search) {
      where.OR = [
        { detail: { contains: q.search, mode: 'insensitive' } },
        { pucSubcuenta: { code: { contains: q.search } } },
        { pucSubcuenta: { name: { contains: q.search, mode: 'insensitive' } } },
      ];
    }

    const movements = await this.prisma.accountingMovement.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
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
      },
    });

    return movements.map(m => ({
      ...m,
      pucCode: m.pucSubcuenta?.code,
      pucName: m.pucSubcuenta?.name,
    }));
  }

  async findOneMovement(businessId: string, id: string) {
    const movement = await this.prisma.accountingMovement.findFirst({
      where: { id, businessId },
      include: {
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
      },
    });
    if (!movement) throw new NotFoundException('Movimiento no encontrado');
    return {
      ...movement,
      pucCode: movement.pucSubcuenta?.code,
      pucName: movement.pucSubcuenta?.name,
    };
  }

  async updateMovement(
    businessId: string,
    id: string,
    dto: UpdateAccountingMovementDto,
  ) {
    await this.findOneMovement(businessId, id);

    let sub: any = null;
    if (dto.pucSubcuentaId) {
      sub = await this.loadSubcuentaOrThrow(dto.pucSubcuentaId);
    }

    const updated = await this.prisma.accountingMovement.update({
      where: { id },
      data: {
        ...(sub
          ? {
              pucSubcuentaId: sub.code,
            }
          : {}),
        amount: dto.amount ?? undefined,
        nature: dto.nature ?? undefined,
        date: dto.date ? new Date(dto.date) : undefined,
        detail: dto.detail ?? undefined,
        originType: dto.originType ?? undefined,
        originId: dto.originId ?? undefined,
      },
      include: {
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
      },
    });

    return {
      ...updated,
      pucCode: updated.pucSubcuenta?.code,
      pucName: updated.pucSubcuenta?.name,
    };
  }

  async removeMovement(businessId: string, id: string) {
    await this.findOneMovement(businessId, id);
    await this.prisma.accountingMovement.delete({ where: { id } });
    return { ok: true, id };
  }

  async searchPuc(q: string) {
    const query = (q ?? '').trim();
    if (!query) return [];

    const [cuentas, subcuentas] = await this.prisma.$transaction([
      this.prisma.pucCuenta.findMany({
        where: {
          OR: [
            { code: { contains: query } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
        orderBy: { code: 'asc' },
      }),
      this.prisma.pucSubcuenta.findMany({
        where: {
          active: true,
          OR: [
            { code: { contains: query } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
        orderBy: { code: 'asc' },
      }),
    ]);

    return [
      ...cuentas.map((c) => ({
        kind: 'CUENTA' as const,
        code: c.code,
        name: c.name,
      })),
      ...subcuentas.map((s) => ({
        kind: 'SUBCUENTA' as const,
        code: s.code,
        name: s.name,
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
