import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async listPublicItems(slug: string, type?: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) return { business: null, data: [] };

    const where: any = {
      businessId: business.id,
      status: 'ACTIVE',
    };

    if (type) where.type = type as any;

    const data = await this.prisma.item.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { images: { orderBy: { order: 'asc' } } },
    });

    return {
      business,
      data: data.map((item) => ({
        ...item,
        price: Number(item.price),
      })),
    };
  }

  async getAvailability(slug: string, itemId: string, date: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) throw new BadRequestException('Business not found');

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
      },
    });

    if (!item) throw new BadRequestException('Service not found');

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const duration = item.durationMinutes ?? 60;

const weekdayMap = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
];

const weekdayEnum = weekdayMap[targetDate.getDay()];

    const windows = await this.prisma.serviceScheduleWindow.findMany({
      where: {
        businessId: business.id,
        weekday: weekdayEnum as any,
        OR: [{ itemId: null }, { itemId: item.id }],
      },
    });

    if (!windows.length) return [];

    let slots: number[] = [];

    for (const w of windows) {
      let current = w.startMinute;

      while (current + duration <= w.endMinute) {
        slots.push(current);
        current += duration;
      }
    }

    const blocks = await this.prisma.serviceScheduleBlock.findMany({
      where: {
        businessId: business.id,
        date: targetDate,
        OR: [{ itemId: null }, { itemId: item.id }],
      },
    });

    slots = slots.filter((slot) => {
      const slotEnd = slot + duration;

      return !blocks.some((b) => {
        if (b.startMinute == null && b.endMinute == null) return true;

        const blockStart = b.startMinute ?? 0;
        const blockEnd = b.endMinute ?? 1440;

        return slot < blockEnd && slotEnd > blockStart;
      });
    });

    const reservations = await this.prisma.reservation.findMany({
      where: {
        businessId: business.id,
        itemId: item.id,
        date: targetDate,
        status: { not: 'CANCELLED' },
      },
    });

    slots = slots.filter(
      (slot) =>
        !reservations.some(
          (r) => slot < r.endMinute && slot + duration > r.startMinute,
        ),
    );

    return slots.map((min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });
  }

  async createReservation(slug: string, body: any) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) throw new BadRequestException('Business not found');

    const targetDate = new Date(body.date);
    targetDate.setHours(0, 0, 0, 0);

    return this.prisma.reservation.create({
      data: {
        businessId: business.id,
        itemId: body.itemId,
        customerName: body.customerName,
        customerWhatsapp: body.customerWhatsapp,
        date: targetDate,
        startMinute: body.startMinute,
        endMinute: body.endMinute,
        status: 'PENDING',
      },
    });
  }
}