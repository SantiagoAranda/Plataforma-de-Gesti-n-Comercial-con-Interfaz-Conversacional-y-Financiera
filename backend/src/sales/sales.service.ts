import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { AccountingService } from 'src/accounting/accounting.service';

type AccountingDraftLine = {
  pucCuentaCode?: string;
  pucSubCode?: string;
  debit: number;
  credit: number;
  description?: string;
};
@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) { }

  async create(businessId: string, dto: CreateOrderDto) {
    if (!dto.items.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const itemsFromDb = await this.prisma.item.findMany({
      where: {
        id: { in: dto.items.map((i) => i.itemId) },
        businessId,
      },
    });

    if (itemsFromDb.length !== dto.items.length) {
      throw new BadRequestException('One or more items are invalid');
    }

    let total = 0;

    const orderItemsData = dto.items.map((input) => {
      const item = itemsFromDb.find((i) => i.id === input.itemId)!;

      const lineTotal = Number(item.price) * input.quantity;
      total += lineTotal;

      return {
        businessId,
        itemId: item.id,
        quantity: input.quantity,
        unitPrice: item.price,
        lineTotal,
        itemNameSnapshot: item.name,
        itemTypeSnapshot: item.type,
        durationMinutesSnapshot: item.durationMinutes,
      };
    });

    this.ensureSingleItemType(itemsFromDb);

    const order = await this.prisma.order.create({
      data: {
        businessId,
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        note: dto.note,
        total,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    return order;
  }

  async findAll(businessId: string) {
    return this.prisma.order.findMany({
      where: { businessId },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async confirmOrder(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        businessId,
      },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT orders can be confirmed');
    }

    if (!order.items.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      const accountingEntry = await this.createAccountingEntryFromOrder(
        tx,
        businessId,
        order,
      );

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
        },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      return {
        order: updatedOrder,
        accountingEntry,
      };
    });
  }

  async getOrderOrThrow(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return order;
  }

  async addItem(businessId: string, orderId: string, dto: AddOrderItemDto) {
    const order = await this.getOrderOrThrow(businessId, orderId);

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Order not editable');
    }

    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, businessId, status: 'ACTIVE' },
    });

    if (!item) throw new BadRequestException('Invalid item');

    if (order.items.length > 0) {
      const existingType = this.ensureSingleItemType(order.items);
      if (item.type !== existingType) {
        throw new BadRequestException(
          `Order already contains ${existingType.toLowerCase()}s and cannot mix item types`,
        );
      }
    }

    const unitPrice = item.price;
    const lineTotal = Number(unitPrice) * dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.orderItem.create({
        data: {
          orderId: order.id,
          businessId,
          itemId: item.id,
          quantity: dto.quantity,
          itemNameSnapshot: item.name,
          itemTypeSnapshot: item.type,
          durationMinutesSnapshot: item.durationMinutes,
          unitPrice,
          lineTotal,
        },
      });

      const totals = await tx.orderItem.aggregate({
        where: { orderId: order.id },
        _sum: { lineTotal: true },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { total: totals._sum.lineTotal ?? 0 },
      });

      return created;
    });
  }

  async updateItem(
    businessId: string,
    orderId: string,
    orderItemId: string,
    dto: UpdateOrderItemDto,
  ) {
    const order = await this.getOrderOrThrow(businessId, orderId);

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Order not editable');
    }

    const oi = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId, businessId },
    });

    if (!oi) throw new NotFoundException('OrderItem not found');

    const nextLineTotal = Number(oi.unitPrice) * dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.orderItem.update({
        where: { id: oi.id },
        data: { quantity: dto.quantity, lineTotal: nextLineTotal },
      });

      const totals = await tx.orderItem.aggregate({
        where: { orderId },
        _sum: { lineTotal: true },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { total: totals._sum.lineTotal ?? 0 },
      });

      return updated;
    });
  }

  async removeItem(businessId: string, orderId: string, orderItemId: string) {
    const order = await this.getOrderOrThrow(businessId, orderId);

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Order not editable');
    }

    const oi = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId, businessId },
    });

    if (!oi) throw new NotFoundException('OrderItem not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: oi.id } });

      const totals = await tx.orderItem.aggregate({
        where: { orderId },
        _sum: { lineTotal: true },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { total: totals._sum.lineTotal ?? 0 },
      });

      return { ok: true };
    });
  }

  async getOne(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return order;
  }

  async cancel(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Completed orders cannot be cancelled');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });
  }

  private ensureSingleItemType(
    items: Array<{ type?: 'PRODUCT' | 'SERVICE'; itemTypeSnapshot?: 'PRODUCT' | 'SERVICE' }>,
  ) {
    const types = new Set(
      items.map((i) => i.type ?? i.itemTypeSnapshot).filter(Boolean),
    );

    if (types.size === 0) {
      throw new BadRequestException('Order must contain at least one item type');
    }

    if (types.size > 1) {
      throw new BadRequestException('Order cannot mix products and services');
    }

    return Array.from(types)[0] as 'PRODUCT' | 'SERVICE';
  }
  //Resolver tipo de plantilla
  private resolveOrderTemplateType(
    order: { items: Array<{ itemTypeSnapshot?: 'PRODUCT' | 'SERVICE' }> },
  ): 'PRODUCT' | 'SERVICE' {
    return this.ensureSingleItemType(order.items);
  }

  //Elegir cuenta o subcuenta.
  private buildPucRef(input: {
    cuentaCode?: string | null;
    subCode?: string | null;
  }): { pucCuentaCode?: string; pucSubCode?: string } {
    const cuentaCode = input.cuentaCode ?? undefined;
    const subCode = input.subCode ?? undefined;

    const hasCuenta = !!cuentaCode;
    const hasSub = !!subCode;

    if (hasCuenta && hasSub) {
      throw new BadRequestException(
        'Template account must define either cuenta or subcuenta, not both',
      );
    }

    if (hasSub) {
      return { pucSubCode: subCode };
    }

    if (hasCuenta) {
      return { pucCuentaCode: cuentaCode };
    }

    throw new BadRequestException('Template account is missing');
  }
  //Crear asiento automático desde la orden
  private async createAccountingEntryFromOrder(
    tx: any,
    businessId: string,
    order: any,
  ) {
    const templateType = this.resolveOrderTemplateType(order);

    const template = await tx.salesAccountingTemplate.findUnique({
      where: {
        businessId_type: {
          businessId,
          type: templateType,
        },
      },
    });

    if (!template) {
      throw new BadRequestException(
        `Missing sales accounting template for ${templateType}`,
      );
    }

    const existingEntry = await tx.accountingEntry.findFirst({
      where: {
        sourceOrderId: order.id,
      },
      include: {
        lines: true,
      },
    });

    if (existingEntry) {
      return existingEntry;
    }

    const total = Number(order.total);
    const vatRate = Number(template.vatRate ?? 0);
    const pricesIncludeVat = !!template.pricesIncludeVat;

    let net = total;
    let vat = 0;

    if (vatRate > 0) {
      if (pricesIncludeVat) {
        net = +(total / (1 + vatRate)).toFixed(2);
        vat = +(total - net).toFixed(2);
      } else {
        net = total;
        vat = +(total * vatRate).toFixed(2);
      }
    }

    let debitMain: { pucCuentaCode?: string; pucSubCode?: string };

    const hasCash =
      !!template.debitCashPucCuentaCode || !!template.debitCashPucSubCode;

    const hasReceivable =
      !!template.debitReceivablePucCuentaCode || !!template.debitReceivablePucSubCode;

    if (hasCash) {
      debitMain = this.buildPucRef({
        cuentaCode: template.debitCashPucCuentaCode,
        subCode: template.debitCashPucSubCode,
      });
    } else if (hasReceivable) {
      debitMain = this.buildPucRef({
        cuentaCode: template.debitReceivablePucCuentaCode,
        subCode: template.debitReceivablePucSubCode,
      });
    } else {
      throw new BadRequestException(
        'Template must define a debit account (cash/bank or receivable)',
      );
    }

    const creditIncome = this.buildPucRef({
      cuentaCode: template.creditIncomePucCuentaCode,
      subCode: template.creditIncomePucSubCode,
    });

    const creditVat = this.buildPucRef({
      cuentaCode: template.creditVatPucCuentaCode,
      subCode: template.creditVatPucSubCode,
    });

    const lines: AccountingDraftLine[] = [
      {
        ...debitMain,
        debit: total,
        credit: 0,
        description: `Débito automático por venta ${order.id}`,
      },
      {
        ...creditIncome,
        debit: 0,
        credit: net,
        description: `Ingreso automático por venta ${order.id}`,
      },
    ];

    if (vat > 0) {
      lines.push({
        ...creditVat,
        debit: 0,
        credit: vat,
        description: `IVA generado automático por venta ${order.id}`,
      });
    }

    const debitTotal = lines.reduce((acc, l) => acc + Number(l.debit ?? 0), 0);
    const creditTotal = lines.reduce((acc, l) => acc + Number(l.credit ?? 0), 0);

    if (Math.abs(debitTotal - creditTotal) > 0.0001) {
      throw new BadRequestException('Generated accounting entry is not balanced');
    }

    const entry = await tx.accountingEntry.create({
      data: {
        businessId,
        date: new Date(),
        memo: `Venta automática ${templateType} #${order.id}`,
        status: 'POSTED',
        sourceType: 'SALE',
        sourceOrderId: order.id,
        lines: {
          create: lines.map((l) => ({
            pucCuentaCode: l.pucCuentaCode ?? null,
            pucSubCode: l.pucSubCode ?? null,
            debit: l.debit,
            credit: l.credit,
            description: l.description ?? null,
          })),
        },
      },
      include: {
        lines: true,
      },
    });

    return entry;
  }
}