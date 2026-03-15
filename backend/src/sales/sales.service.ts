import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

export type UnifiedSourceType = 'ORDER' | 'RESERVATION';
export type UnifiedStatus = 'PENDIENTE' | 'CERRADO' | 'CANCELADO';

export interface UnifiedSaleDto {
  id: string;
  sourceType: UnifiedSourceType;
  customerName: string;
  customerWhatsapp: string;
  total: number;
  status: UnifiedStatus;
  createdAt: Date;
  scheduledAt?: string;
  type: 'PRODUCTO' | 'SERVICIO';
  items: Array<{
    name: string;
    qty: number;
    price: number;
    itemId: string;
    durationMin?: number | null;
  }>;
}
@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) { }

  private parseDateOnly(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
    if (!match) {
      throw new BadRequestException('Invalid date');
    }

    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      0,
      0,
      0,
      0,
    );
  }

  private parseMonth(value: string) {
    const match = /^(\d{4})-(\d{2})$/.exec((value ?? '').trim());
    if (!match) {
      throw new BadRequestException('Invalid month');
    }

    return {
      year: Number(match[1]),
      monthIndex: Number(match[2]) - 1,
    };
  }

  private formatDateOnly(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(minutes: number) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  private parseScheduledAt(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
      (value ?? '').trim(),
    );
    if (!match) {
      throw new BadRequestException('Invalid scheduledAt');
    }

    const dateOnly = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      0,
      0,
      0,
      0,
    );
    const startMinute = Number(match[4]) * 60 + Number(match[5]);

    return { dateOnly, startMinute };
  }

  private async getReservationAvailabilitySlots(
    businessId: string,
    itemId: string,
    date: Date,
    durationMinutes: number,
    excludeReservationId?: string,
  ) {
    const weekdayMap: Record<number, Weekday> = {
      0: 'SUN',
      1: 'MON',
      2: 'TUE',
      3: 'WED',
      4: 'THU',
      5: 'FRI',
      6: 'SAT',
    };
    const weekday = weekdayMap[date.getDay()];

    const [windows, blocks, reservations] = await Promise.all([
      this.prisma.serviceScheduleWindow.findMany({
        where: {
          businessId,
          weekday,
          OR: [{ itemId }, { itemId: null }],
        },
        orderBy: { startMinute: 'asc' },
      }),
      this.prisma.serviceScheduleBlock.findMany({
        where: {
          businessId,
          date,
          OR: [{ itemId }, { itemId: null }],
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          businessId,
          itemId,
          date,
          status: { not: 'CANCELLED' },
          ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        },
        select: { startMinute: true, endMinute: true },
      }),
    ]);

    const slots: string[] = [];

    for (const window of windows) {
      let cursor = window.startMinute;

      while (cursor + durationMinutes <= window.endMinute) {
        const start = cursor;
        const end = cursor + durationMinutes;

        const blocked = blocks.some((block) => {
          if (block.startMinute === null || block.endMinute === null) {
            return true;
          }
          return start < block.endMinute && end > block.startMinute;
        });

        const overlapping = reservations.some(
          (reservation) => start < reservation.endMinute && end > reservation.startMinute,
        );

        if (!blocked && !overlapping) {
          slots.push(this.formatTime(start));
        }

        cursor += durationMinutes;
      }
    }

    return slots;
  }

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

  async findAll(businessId: string): Promise<UnifiedSaleDto[]> {
    const [orders, reservations] = await Promise.all([
      this.prisma.order.findMany({
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
      }),
      this.prisma.reservation.findMany({
        where: { businessId },
        include: {
          item: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const mappedOrders: UnifiedSaleDto[] = orders.map((o) => ({
      id: o.id,
      sourceType: 'ORDER',
      customerName: o.customerName,
      customerWhatsapp: o.customerWhatsapp,
      total: Number(o.total),
      status: this.mapOrderStatus(o.status),
      createdAt: o.createdAt,
      type: o.items[0]?.itemTypeSnapshot === 'SERVICE' ? 'SERVICIO' : 'PRODUCTO',
      items: o.items.map((it) => ({
        name: it.itemNameSnapshot,
        qty: it.quantity,
        price: Number(it.lineTotal),
        itemId: it.itemId,
        durationMin: it.durationMinutesSnapshot ?? null,
      })),
    }));

    const mappedReservations: UnifiedSaleDto[] = reservations.map((r) => ({
      id: r.id,
      sourceType: 'RESERVATION',
      customerName: r.customerName,
      customerWhatsapp: r.customerWhatsapp,
      total: Number(r.item.price),
      status: this.mapReservationStatus(r.status),
      createdAt: r.createdAt,
      scheduledAt: this.toScheduledAt(r.date, r.startMinute),
      type: 'SERVICIO',
      items: [
        {
          name: r.item.name,
          qty: 1,
          price: Number(r.item.price),
          itemId: r.itemId,
          durationMin: r.item.durationMinutes ?? null,
        },
      ],
    }));

    return [...mappedOrders, ...mappedReservations].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  private toScheduledAt(date: Date, startMinute: number) {
    return `${this.formatDateOnly(date)}T${this.formatTime(startMinute)}:00`;
  }

  private mapOrderStatus(status: string): UnifiedStatus {
    if (status === 'COMPLETED') return 'CERRADO';
    if (status === 'CANCELLED') return 'CANCELADO';
    return 'PENDIENTE';
  }

  private mapReservationStatus(status: string): UnifiedStatus {
    if (status === 'CONFIRMED') return 'CERRADO';
    if (status === 'CANCELLED') return 'CANCELADO';
    return 'PENDIENTE';
  }

  async confirmOrder(
    businessId: string,
    id: string,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    if (sourceType === 'RESERVATION') {
      return this.confirmReservation(businessId, id);
    }

    return this.prisma.$transaction(async (tx) => {
      // ... (KEEP EXISTING Order logic but use id instead of orderId)
      const order = await tx.order.findFirst({
        where: { id, businessId },
        include: {
          items: { include: { item: true } },
        },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (!order.items.length)
        throw new BadRequestException('Order must contain at least one item');
      if (order.status === 'CANCELLED')
        throw new BadRequestException('Cancelled orders cannot be confirmed');
      if (order.accountingPostedAt)
        return { order, accountingCreated: false, alreadyPosted: true };

      const confirmableStatuses: OrderStatus[] = ['DRAFT', 'SENT', 'COMPLETED'];
      if (!confirmableStatuses.includes(order.status))
        throw new BadRequestException('Order cannot be confirmed');

      const postingDate = new Date();
      const claim = await tx.order.updateMany({
        where: {
          id,
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
          where: { id, businessId },
          include: { items: { include: { item: true } } },
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
        finalizedOrder as any,
      );

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { item: true } } },
      });

      return {
        order: updatedOrder,
        accountingCreated: true,
        alreadyPosted: false,
        movements,
      };
    });
  }

  private async confirmReservation(businessId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.reservation.findFirst({
        where: { id, businessId },
        include: { item: true },
      });

      if (!res) throw new NotFoundException('Reservation not found');
      if (res.status === 'CANCELLED')
        throw new BadRequestException('Cancelled reservations cannot be confirmed');

      const existingMovements = await tx.accountingMovement.findMany({
        where: {
          businessId,
          originType: 'ORDER',
          originId: id,
        },
      });

      const updated =
        res.status === 'CONFIRMED'
          ? res
          : await tx.reservation.update({
              where: { id },
              data: { status: 'CONFIRMED' },
              include: { item: true },
            });

      const virtualOrder = this.mapReservationToVirtualOrder(updated);
      const shouldPostAccounting = existingMovements.length === 0;
      const movements = shouldPostAccounting
        ? await this.accountingService.postOrderMovements(
            tx,
            businessId,
            virtualOrder as any,
          )
        : existingMovements;

      return {
        order: virtualOrder, // Frontend expects something that looks like an order/sale
        accountingCreated: shouldPostAccounting,
        alreadyPosted: !shouldPostAccounting,
        movements,
        isReservation: true,
      };
    });
  }

  async getReservationAvailability(
    businessId: string,
    reservationId: string,
    query: { month?: string; date?: string },
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, businessId },
      include: { item: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const duration =
      reservation.item.durationMinutes ??
      Math.max(1, reservation.endMinute - reservation.startMinute);

    if (query.date) {
      const dateOnly = this.parseDateOnly(query.date);
      return this.getReservationAvailabilitySlots(
        businessId,
        reservation.itemId,
        dateOnly,
        duration,
        reservation.id,
      );
    }

    if (!query.month) {
      throw new BadRequestException('month or date is required');
    }

    const { year, monthIndex } = this.parseMonth(query.month);
    const firstDay = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const lastDay = new Date(year, monthIndex + 1, 0, 0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cursor = new Date(firstDay);
    const availableDates: string[] = [];

    while (cursor <= lastDay) {
      const current = new Date(cursor);
      if (current >= today || this.formatDateOnly(current) === this.formatDateOnly(reservation.date)) {
        const slots = await this.getReservationAvailabilitySlots(
          businessId,
          reservation.itemId,
          current,
          duration,
          reservation.id,
        );

        if (slots.length > 0) {
          availableDates.push(this.formatDateOnly(current));
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return availableDates;
  }

  private mapReservationToVirtualOrder(res: any) {
    // Falls back to current item price if no snapshot (as per user request)
    const price = res.item.price;

    return {
      id: res.id,
      businessId: res.businessId,
      status: 'COMPLETED', // compatible with Accounting logic
      customerName: res.customerName,
      customerWhatsapp: res.customerWhatsapp,
      total: price,
      updatedAt: res.updatedAt,
      createdAt: res.createdAt,
      items: [
        {
          id: `virtual-oi-${res.id}`,
          itemId: res.itemId,
          quantity: 1,
          itemNameSnapshot: res.item.name,
          itemTypeSnapshot: 'SERVICE',
          durationMinutesSnapshot: res.item.durationMinutes,
          unitPrice: price,
          lineTotal: price,
          item: res.item,
        },
      ],
    };
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

  async cancel(
    businessId: string,
    id: string,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    if (sourceType === 'RESERVATION') {
      return this.prisma.reservation.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { item: true },
      });
    }

    const order = await this.prisma.order.findFirst({
      where: { id, businessId },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Completed orders cannot be cancelled');
    }

    return this.prisma.order.update({
      where: { id },
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

  async update(
    businessId: string,
    orderId: string,
    dto: UpdateOrderDto,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    if (sourceType === 'RESERVATION') {
      return this.updateReservation(businessId, orderId, dto);
    }

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

  private async updateReservation(
    businessId: string,
    id: string,
    dto: UpdateOrderDto,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, businessId },
      include: { item: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException('Reservation not editable in current status');
    }

    const data: any = {
      customerName: dto.customerName,
      customerWhatsapp: dto.customerWhatsapp,
      note: dto.note,
    };

    if (dto.scheduledAt) {
      const { dateOnly, startMinute } = this.parseScheduledAt(dto.scheduledAt);
      const duration =
        reservation.item.durationMinutes ??
        Math.max(1, reservation.endMinute - reservation.startMinute);
      const endMinute = startMinute + duration;
      const availableSlots = await this.getReservationAvailabilitySlots(
        businessId,
        reservation.itemId,
        dateOnly,
        duration,
        reservation.id,
      );

      if (!availableSlots.includes(this.formatTime(startMinute))) {
        throw new BadRequestException('Selected time is outside service availability');
      }

      data.date = dateOnly;
      data.startMinute = startMinute;
      data.endMinute = endMinute;
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data,
      include: { item: true },
    });

    return {
      id: updated.id,
      sourceType: 'RESERVATION' as const,
      customerName: updated.customerName,
      customerWhatsapp: updated.customerWhatsapp,
      total: Number(updated.item.price),
      status: this.mapReservationStatus(updated.status),
      createdAt: updated.createdAt,
      scheduledAt: this.toScheduledAt(updated.date, updated.startMinute),
      type: 'SERVICIO' as const,
      items: [
        {
          name: updated.item.name,
          qty: 1,
          price: Number(updated.item.price),
          itemId: updated.itemId,
          durationMin: updated.item.durationMinutes ?? null,
        },
      ],
    };
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
