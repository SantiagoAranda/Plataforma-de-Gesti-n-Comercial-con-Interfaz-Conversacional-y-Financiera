import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { Weekday } from '@prisma/client';

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  /* =====================================================
     ITEMS
  ===================================================== */

  async listPublicItems(slug: string, type?: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true },
    });

    if (!business) {
      return { business: null, data: [] };
    }

    const where: any = {
      businessId: business.id,
      status: 'ACTIVE',
    };

    if (type) where.type = type;

    const data = await this.prisma.item.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        images: { orderBy: { order: 'asc' } },
      },
    });

    return {
      business,
      data: data.map((item) => ({
        ...item,
        price: Number(item.price),
      })),
    };
  }

  /* =====================================================
     AVAILABILITY (CALCULA SLOTS DISPONIBLES)
  ===================================================== */

  async getAvailability(slug: string, itemId: string, date: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business)
      throw new BadRequestException('Business not found');

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
      },
    });

    if (!item)
      throw new BadRequestException('Invalid service');

    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    const weekdayMap: Record<number, Weekday> = {
      0: 'SUN',
      1: 'MON',
      2: 'TUE',
      3: 'WED',
      4: 'THU',
      5: 'FRI',
      6: 'SAT',
    };

    const weekday = weekdayMap[selectedDate.getDay()];

    const windows = await this.prisma.serviceScheduleWindow.findMany({
      where: {
        businessId: business.id,
        weekday,
        OR: [{ itemId: item.id }, { itemId: null }],
      },
      orderBy: { startMinute: 'asc' },
    });

    if (windows.length === 0) return [];

    const reservations = await this.prisma.reservation.findMany({
      where: {
        businessId: business.id,
        itemId,
        date: selectedDate,
        status: { not: 'CANCELLED' },
      },
      select: {
        startMinute: true,
        endMinute: true,
      },
    });

    const blocks = await this.prisma.serviceScheduleBlock.findMany({
      where: {
        businessId: business.id,
        date: selectedDate,
        OR: [{ itemId: item.id }, { itemId: null }],
      },
    });

    const duration = item.durationMinutes ?? 60;

    const slots: string[] = [];

    const formatTime = (minutes: number) => {
      const h = Math.floor(minutes / 60)
        .toString()
        .padStart(2, '0');

      const m = (minutes % 60)
        .toString()
        .padStart(2, '0');

      return `${h}:${m}`;
    };

    for (const window of windows) {
      let cursor = window.startMinute;

      while (cursor + duration <= window.endMinute) {
        const start = cursor;
        const end = cursor + duration;

        const overlap = reservations.some(
          (r) => start < r.endMinute && end > r.startMinute,
        );

        const blocked = blocks.some((b) => {
          if (b.startMinute === null && b.endMinute === null)
            return true;

          return (
            start < (b.endMinute ?? 0) &&
            end > (b.startMinute ?? 0)
          );
        });

        if (!overlap && !blocked) {
          slots.push(formatTime(start));
        }

        cursor += duration;
      }
    }

    return slots;
  }

  /* =====================================================
     CREATE RESERVATION
  ===================================================== */

  async createReservation(slug: string, body: any) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business)
      throw new BadRequestException('Business not found');

    return this.prisma.$transaction(async (tx) => {
      const {
        itemId,
        customerName,
        customerWhatsapp,
        date,
        startMinute,
        endMinute,
      } = body;

      if (!customerName || !customerWhatsapp)
        throw new BadRequestException('Customer data required');

      if (startMinute >= endMinute)
        throw new BadRequestException('Invalid time range');

      const selectedDate = new Date(date);
      selectedDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today)
        throw new BadRequestException('Cannot reserve past dates');

      const item = await tx.item.findFirst({
        where: {
          id: itemId,
          businessId: business.id,
          type: 'SERVICE',
          status: 'ACTIVE',
        },
      });

      if (!item)
        throw new BadRequestException('Invalid service');

      const overlapping = await tx.reservation.findFirst({
        where: {
          businessId: business.id,
          itemId,
          date: selectedDate,
          status: { not: 'CANCELLED' },
          startMinute: { lt: endMinute },
          endMinute: { gt: startMinute },
        },
      });

      if (overlapping)
        throw new BadRequestException(
          'Time slot already reserved',
        );

      return tx.reservation.create({
        data: {
          businessId: business.id,
          itemId,
          customerName,
          customerWhatsapp,
          date: selectedDate,
          startMinute,
          endMinute,
          status: 'CONFIRMED',
        },
      });
    });
  }

  /* =====================================================
     CREATE ORDER
  ===================================================== */

  async createOrder(slug: string, dto: CreatePublicOrderDto) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business)
      throw new BadRequestException('Business not found');

    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException('Order must contain items');

    const dbItems = await this.prisma.item.findMany({
      where: {
        id: { in: dto.items.map((i) => i.itemId) },
        businessId: business.id,
        status: 'ACTIVE',
      },
    });

    if (dbItems.length !== dto.items.length)
      throw new BadRequestException('Invalid items');

    const order = await this.prisma.order.create({
      data: {
        businessId: business.id,
        status: 'SENT',
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        sentAt: new Date(),

        items: {
          create: dto.items.map((input) => {
            const item = dbItems.find(
              (i) => i.id === input.itemId,
            )!;

            const quantity = input.quantity;
            const unitPrice = item.price;
            const lineTotal = unitPrice.mul(quantity);

            return {
              businessId: business.id,
              itemId: item.id,
              quantity,
              unitPrice,
              lineTotal,
              itemNameSnapshot: item.name,
              itemTypeSnapshot: item.type,
              durationMinutesSnapshot:
                item.durationMinutes,
            };
          }),
        },
      },
      include: { items: true },
    });

    const total = order.items.reduce(
      (acc, i) => acc + Number(i.lineTotal),
      0,
    );

    await this.prisma.order.update({
      where: { id: order.id },
      data: { total },
    });

    return {
      message: 'Order created',
      orderId: order.publicToken,
    };
  }
}