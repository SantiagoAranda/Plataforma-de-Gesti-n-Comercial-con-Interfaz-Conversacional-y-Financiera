import { Injectable, BadRequestException } from '@nestjs/common';
import { Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  private parseDateOnly(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
    if (!match) throw new BadRequestException('Invalid date');

    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        0,
        0,
        0,
        0,
      )
    );
  }

  private parseMonth(value: string) {
    const match = /^(\d{4})-(\d{2})$/.exec((value ?? '').trim());
    if (!match) throw new BadRequestException('Invalid month');

    return {
      year: Number(match[1]),
      monthIndex: Number(match[2]) - 1,
    };
  }

  private formatDateOnly(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(minutes: number) {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
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

    return weekdayMap[date.getUTCDay()];
  }

  private async getAvailabilitySlotsForItem(
    businessId: string,
    item: { id: string; durationMinutes: number | null },
    date: Date,
    hasSpecificWindows: boolean,
    excludeReservationId?: string,
  ) {
    const weekday = this.getWeekday(date);

    const [windows, reservations, blocks] = await Promise.all([
      this.prisma.serviceScheduleWindow.findMany({
        where: {
          businessId,
          weekday,
          itemId: hasSpecificWindows ? item.id : null,
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
        select: { startMinute: true, endMinute: true },
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

    // 1. Windows are already filtered at the database query level based on item-specific priority.
    const filteredWindows = windows;

    // 2. Fusionar ventanas superpuestas o contiguas para verificar la continuidad
    const mergedWindows: { startMinute: number; endMinute: number }[] = [];
    for (const w of filteredWindows) {
      const last = mergedWindows[mergedWindows.length - 1];
      if (last && last.endMinute >= w.startMinute) {
        last.endMinute = Math.max(last.endMinute, w.endMinute);
      } else {
        mergedWindows.push({ startMinute: w.startMinute, endMinute: w.endMinute });
      }
    }

    const duration = item.durationMinutes ?? 60;
    // 3. Incremento fijo para no descartar franjas (ej. 30 minutos) -> Ajustado a 60
    const step = 60;
    const slots: string[] = [];

    // Past slots filter based on America/Bogota
    const nowInBusiness = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const today = new Date(
      Date.UTC(
        nowInBusiness.getFullYear(),
        nowInBusiness.getMonth(),
        nowInBusiness.getDate(),
        0,
        0,
        0,
        0,
      )
    );
    const currentMinutes = nowInBusiness.getHours() * 60 + nowInBusiness.getMinutes();

    for (const window of mergedWindows) {
      let cursor = window.startMinute;
      if (cursor % 60 !== 0) {
        cursor = cursor + (60 - (cursor % 60)); // Redondea al siguiente minuto 00
      }

      while (cursor + duration <= window.endMinute) {
        if (cursor % 60 !== 0) {
          cursor += step;
          continue;
        }

        const start = cursor;
        const end = cursor + duration;

        if (date.getTime() === today.getTime() && start <= currentMinutes) {
          cursor += step;
          continue;
        }

        const overlap = reservations.some(
          (res) => Math.max(start, res.startMinute) < Math.min(end, res.endMinute),
        );

        const blocked = blocks.some((block) => {
          if (block.startMinute === null && block.endMinute === null) return true;
          return start < (block.endMinute ?? 0) && end > (block.startMinute ?? 0);
        });

        if (!overlap && !blocked) slots.push(this.formatTime(start));

        cursor += step;
      }
    }

    return slots;
  }

  private async getBusinessService(businessId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId,
        type: 'SERVICE',
      },
      select: {
        id: true,
        durationMinutes: true,
      },
    });

    if (!item) throw new BadRequestException('Invalid service');

    return item;
  }

  async create(businessId: string, dto: CreateReservationDto) {
    if (dto.startMinute >= dto.endMinute) {
      throw new BadRequestException('Invalid time range');
    }

    const item = await this.prisma.item.findFirst({
      where: {
        id: dto.itemId,
        businessId,
        type: 'SERVICE',
      },
    });

    if (!item) {
      throw new BadRequestException('Invalid service');
    }

    const dateOnly = this.parseDateOnly(dto.date);

    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        businessId,
        itemId: dto.itemId,
        date: dateOnly,
        status: {
          not: 'CANCELLED',
        },
        AND: [
          {
            startMinute: { lt: dto.endMinute },
          },
          {
            endMinute: { gt: dto.startMinute },
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('Time slot already booked');
    }

    return this.prisma.reservation.create({
      data: {
        businessId,
        itemId: dto.itemId,
        customerName: dto.customerName?.trim() || null,
        customerWhatsapp: dto.customerWhatsapp?.trim() || null,
        date: dateOnly,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
      },
    });
  }

  async findByDate(businessId: string, date: string) {
    const dateOnly = this.parseDateOnly(date);

    return this.prisma.reservation.findMany({
      where: {
        businessId,
        date: dateOnly,
      },
      orderBy: {
        startMinute: 'asc',
      },
    });
  }

  async getAvailability(businessId: string, itemId: string, date: string) {
    const item = await this.getBusinessService(businessId, itemId);
    const dateOnly = this.parseDateOnly(date);
    const specificWindowsCount = await this.prisma.serviceScheduleWindow.count({
      where: { businessId, itemId: item.id },
    });
    const hasSpecificWindows = specificWindowsCount > 0;
    return this.getAvailabilitySlotsForItem(businessId, item, dateOnly, hasSpecificWindows);
  }

  async getAvailabilityCalendar(businessId: string, itemId: string, month: string) {
    const item = await this.getBusinessService(businessId, itemId);
    const { year, monthIndex } = this.parseMonth(month);
    const firstDay = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
    
    const nowInBusiness = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const today = new Date(
      Date.UTC(
        nowInBusiness.getFullYear(),
        nowInBusiness.getMonth(),
        nowInBusiness.getDate(),
        0,
        0,
        0,
        0,
      )
    );

    const specificWindowsCount = await this.prisma.serviceScheduleWindow.count({
      where: { businessId, itemId: item.id },
    });
    const hasSpecificWindows = specificWindowsCount > 0;

    const cursor = new Date(firstDay);
    const availableDates: string[] = [];

    while (cursor <= lastDay) {
      if (cursor >= today) {
        const slots = await this.getAvailabilitySlotsForItem(
          businessId,
          item,
          new Date(cursor),
          hasSpecificWindows,
        );

        if (slots.length > 0) {
          availableDates.push(this.formatDateOnly(cursor));
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return availableDates;
  }

  async cancel(businessId: string, id: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        businessId,
      },
    });

    if (!reservation) {
      throw new BadRequestException('Reservation not found');
    }

    return this.prisma.reservation.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
    });
  }

  async confirm(businessId: string, id: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        businessId,
      },
    });

    if (!reservation) {
      throw new BadRequestException('Reservation not found');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException(
        'Only PENDING reservations can be confirmed',
      );
    }

    return this.prisma.reservation.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
      },
    });
  }

  async reschedule(
    businessId: string,
    id: string,
    dto: { date: string; startMinute: number; endMinute: number },
  ) {
    if (dto.startMinute >= dto.endMinute) {
      throw new BadRequestException('Invalid time range');
    }

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        businessId,
      },
    });

    if (!reservation) {
      throw new BadRequestException('Reservation not found');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException(
        'Only PENDING reservations can be rescheduled',
      );
    }

    const dateOnly = this.parseDateOnly(dto.date);

    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        businessId,
        itemId: reservation.itemId,
        date: dateOnly,
        status: {
          not: 'CANCELLED',
        },
        id: { not: id },
        AND: [
          {
            startMinute: { lt: dto.endMinute },
          },
          {
            endMinute: { gt: dto.startMinute },
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('Time slot already booked');
    }

    return this.prisma.reservation.update({
      where: { id },
      data: {
        date: dateOnly,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
      },
    });
  }
}
