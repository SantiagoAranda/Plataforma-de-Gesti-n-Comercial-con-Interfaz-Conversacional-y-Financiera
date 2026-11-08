import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    @Optional()
    private availability: AvailabilityService = new AvailabilityService(prisma),
  ) {}

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
      ),
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

  private async getBusinessService(businessId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId,
        type: 'SERVICE',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        durationMinutes: true,
      },
    });

    if (!item) {
      const service = await this.prisma.item.findFirst({
        where: { id: itemId, businessId, type: 'SERVICE' },
        select: { id: true },
      });
      if (service) {
        throw new BadRequestException(
          'El servicio no estÃ¡ disponible para nuevas reservas.',
        );
      }
      throw new BadRequestException('Invalid service');
    }

    return item;
  }

  async create(businessId: string, dto: CreateReservationDto) {
    if (dto.startMinute >= dto.endMinute) {
      throw new BadRequestException('Invalid time range');
    }

    await this.getBusinessService(businessId, dto.itemId);

    const dateOnly = this.parseDateOnly(dto.date);

    await this.availability.assertNoOverlap({
      businessId,
      itemId: dto.itemId,
      date: dateOnly,
      startMinute: dto.startMinute,
      endMinute: dto.endMinute,
    });

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
    return this.availability.getSlots({
      businessId,
      itemId: item.id,
      durationMinutes: item.durationMinutes,
      date: this.parseDateOnly(date),
    });
  }

  async getAvailabilityCalendar(
    businessId: string,
    itemId: string,
    month: string,
  ) {
    const item = await this.getBusinessService(businessId, itemId);
    return this.availability.getAvailableDates({
      businessId,
      itemId: item.id,
      durationMinutes: item.durationMinutes,
      ...this.parseMonth(month),
    });
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

    await this.availability.assertNoOverlap({
      businessId,
      itemId: reservation.itemId,
      date: dateOnly,
      startMinute: dto.startMinute,
      endMinute: dto.endMinute,
      excludeReservationId: id,
    });

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
