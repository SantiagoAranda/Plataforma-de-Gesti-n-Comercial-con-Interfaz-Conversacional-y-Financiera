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

  private formatDateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(minutes: number) {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');

    const m = (minutes % 60)
      .toString()
      .padStart(2, '0');

    return `${h}:${m}`;
  }

  private getWeekday(date: Date): Weekday {
    const weekdayMap: Record<number, Weekday> = {
      0: 'SUN',
      1: 'MON',
      2: 'TUE',
      3: 'WED',
      4: 'THU',
      5: 'FRI',
      6: 'SAT',
    };

    return weekdayMap[date.getDay()];
  }

  private async getAvailabilitySlotsForItem(
    businessId: string,
    item: { id: string; durationMinutes: number | null },
    date: Date,
    excludeReservationId?: string,
  ) {
    const weekday = this.getWeekday(date);

    const [windows, reservations, blocks] = await Promise.all([
      this.prisma.serviceScheduleWindow.findMany({
        where: {
          businessId,
          weekday,
          OR: [{ itemId: item.id }, { itemId: null }],
        },
        orderBy: { startMinute: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          businessId,
          itemId: item.id,
          date,
          status: { not: 'CANCELLED' },
          ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        },
        select: {
          startMinute: true,
          endMinute: true,
        },
      }),
      this.prisma.serviceScheduleBlock.findMany({
        where: {
          businessId,
          date,
          OR: [{ itemId: item.id }, { itemId: null }],
        },
      }),
    ]);

    if (windows.length === 0) return [];

    const duration = item.durationMinutes ?? 60;
    const slots: string[] = [];

    for (const window of windows) {
      let cursor = window.startMinute;

      while (cursor + duration <= window.endMinute) {
        const start = cursor;
        const end = cursor + duration;

        const overlap = reservations.some(
          (reservation) => start < reservation.endMinute && end > reservation.startMinute,
        );

        const blocked = blocks.some((block) => {
          if (block.startMinute === null && block.endMinute === null) {
            return true;
          }

          return (
            start < (block.endMinute ?? 0) &&
            end > (block.startMinute ?? 0)
          );
        });

        if (!overlap && !blocked) {
          slots.push(this.formatTime(start));
        }

        cursor += duration;
      }
    }

    return slots;
  }

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

    const selectedDate = this.parseDateOnly(date);
    return this.getAvailabilitySlotsForItem(business.id, item, selectedDate);
  }

  async getAvailabilityCalendar(slug: string, itemId: string, month: string) {
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

    const { year, monthIndex } = this.parseMonth(month);
    const firstDay = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const lastDay = new Date(year, monthIndex + 1, 0, 0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cursor = new Date(firstDay);
    const availableDates: string[] = [];

    while (cursor <= lastDay) {
      if (cursor >= today) {
        const slots = await this.getAvailabilitySlotsForItem(
          business.id,
          item,
          new Date(cursor),
        );

        if (slots.length > 0) {
          availableDates.push(this.formatDateOnly(cursor));
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return availableDates;
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

      const selectedDate = this.parseDateOnly(date);

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

      const availableSlots = await this.getAvailabilitySlotsForItem(
        business.id,
        item,
        selectedDate,
      );
      const requestedSlot = this.formatTime(startMinute);

      if (!availableSlots.includes(requestedSlot)) {
        throw new BadRequestException('Time slot already reserved or unavailable');
      }

      const reservation = await tx.reservation.create({
        data: {
          businessId: business.id,
          itemId,
          customerName,
          customerWhatsapp,
          date: selectedDate,
          startMinute,
          endMinute,
          status: 'PENDING',
          origin: 'PUBLIC_STORE',
        },
      });

      console.log(`[PublicService] Created reservation origin: ${reservation.origin}`);
      return reservation;
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
        origin: 'PUBLIC_STORE',
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

    console.log(`[PublicService] Created order origin: ${order.origin}`);

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
