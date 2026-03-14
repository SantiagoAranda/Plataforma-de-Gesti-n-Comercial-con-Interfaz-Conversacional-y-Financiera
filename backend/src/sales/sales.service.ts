import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
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
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
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

      if (!order.items.length) {
        throw new BadRequestException('Order must contain at least one item');
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestException('Cancelled orders cannot be confirmed');
      }

      if (order.accountingPostedAt) {
        return {
          order,
          accountingCreated: false,
          alreadyPosted: true,
        };
      }

      const confirmableStatuses: OrderStatus[] = ['DRAFT', 'SENT', 'COMPLETED'];

      if (!confirmableStatuses.includes(order.status)) {
        throw new BadRequestException('Order cannot be confirmed');
      }

      const postingDate = new Date();
      const claim = await tx.order.updateMany({
        where: {
          id: orderId,
          businessId,
          accountingPostedAt: null,
          status: { in: confirmableStatuses },
        },
        data: {
          status: 'COMPLETED',
          accountingPostedAt: postingDate,
        },
      });

      if (claim.count === 0) {
        const currentOrder = await tx.order.findFirst({
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

        if (!currentOrder) throw new NotFoundException('Order not found');

        return {
          order: currentOrder,
          accountingCreated: false,
          alreadyPosted: Boolean(currentOrder.accountingPostedAt),
        };
      }

      const finalizedOrder = {
        ...order,
        status: 'COMPLETED' as const,
        accountingPostedAt: postingDate,
        updatedAt: postingDate,
      };

      const movements = await this.accountingService.postOrderMovements(
        tx,
        businessId,
        finalizedOrder,
      );

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
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
        accountingCreated: true,
        alreadyPosted: false,
        movements,
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

    const editableStatuses: OrderStatus[] = ['DRAFT', 'SENT'];
    if (!editableStatuses.includes(order.status)) {
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

    const editableStatuses: OrderStatus[] = ['DRAFT', 'SENT'];
    if (!editableStatuses.includes(order.status)) {
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

    const editableStatuses: OrderStatus[] = ['DRAFT', 'SENT'];
    if (!editableStatuses.includes(order.status)) {
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

  async update(businessId: string, orderId: string, dto: UpdateOrderDto) {
    const order = await this.getOrderOrThrow(businessId, orderId);

    const editableStatuses: OrderStatus[] = ['DRAFT', 'SENT'];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException('Order not editable in current status');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update general info if provided
      await tx.order.update({
        where: { id: orderId },
        data: {
          customerName: dto.customerName,
          customerWhatsapp: dto.customerWhatsapp,
          note: dto.note,
        },
      });

      // 2. Handle Items Sync if provided
      if (dto.items) {
        // Validate items exist and belong to business
        const itemsFromDb = await tx.item.findMany({
          where: {
            id: { in: dto.items.map((i) => i.itemId) },
            businessId,
          },
        });

        if (itemsFromDb.length !== dto.items.length) {
          throw new BadRequestException('One or more items are invalid');
        }

        this.ensureSingleItemType(itemsFromDb);

        // Delete existing items
        await tx.orderItem.deleteMany({
          where: { orderId },
        });

        // Create new items
        let newTotal = 0;
        const newOrderItems = dto.items.map((input) => {
          const item = itemsFromDb.find((i) => i.id === input.itemId)!;
          const lineTotal = Number(item.price) * input.quantity;
          newTotal += lineTotal;

          return {
            orderId,
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

        await tx.orderItem.createMany({
          data: newOrderItems,
        });

        // Update total
        await tx.order.update({
          where: { id: orderId },
          data: { total: newTotal },
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });
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
}
