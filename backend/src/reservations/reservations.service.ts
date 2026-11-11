import {
  Injectable,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityService,
  formatDateKey,
  RESERVATION_ERRORS,
  toBookingConflict,
} from '../availability/availability.service';
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
        throw new BadRequestException(RESERVATION_ERRORS.serviceInactive);
      }
      throw new BadRequestException('Invalid service');
    }

    return item;
  }

  async create(businessId: string, dto: CreateReservationDto) {
    return this.prisma
      .$transaction(async (tx) => {
        const slot = await this.availability.reserveSlot(tx, {
          businessId,
          itemId: dto.itemId,
          date: dto.date,
          startMinute: dto.startMinute,
          requestedEndMinute: dto.endMinute,
        });

        return tx.reservation.create({
          data: {
            businessId,
            itemId: slot.itemId,
            customerName: dto.customerName?.trim() || null,
            customerWhatsapp: dto.customerWhatsapp?.trim() || null,
            date: slot.date,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
          },
        });
      })
      .catch((error) => {
        throw toBookingConflict(error);
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

  // PENDING only: a CONFIRMED reservation carries inventory and accounting, whose
  // reversal is SalesService.cancel(RESERVATION). Confirmation lives in SalesService too.
  async cancel(businessId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const { reservation, alreadyCancelled } =
        await this.availability.lockReservationForCancellation(
          tx,
          businessId,
          id,
        );
      if (alreadyCancelled) return reservation;
      if (reservation.status !== 'PENDING') {
        throw new ConflictException(
          RESERVATION_ERRORS.confirmedCancelRequiresSales,
        );
      }
      return tx.reservation.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });
  }

  async reschedule(
    businessId: string,
    id: string,
    dto: { date: string; startMinute: number; endMinute: number },
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        const reservation = await this.availability.lockReservationRow(
          tx,
          businessId,
          id,
        );

        if (!reservation) {
          throw new BadRequestException(RESERVATION_ERRORS.notFound);
        }

        if (reservation.status !== 'PENDING') {
          throw new BadRequestException(
            'Solo se pueden reprogramar reservas pendientes.',
          );
        }

        // Same slot: nothing moves, so historical values are kept untouched.
        if (
          dto.date === formatDateKey(reservation.date) &&
          dto.startMinute === reservation.startMinute
        ) {
          return reservation;
        }

        const slot = await this.availability.reserveSlot(tx, {
          businessId,
          itemId: reservation.itemId,
          date: dto.date,
          startMinute: dto.startMinute,
          requestedEndMinute: dto.endMinute,
          excludeReservationId: id,
          allowInactiveService: true,
          extraLockKeys: [
            { businessId, itemId: reservation.itemId, date: reservation.date },
          ],
        });

        return tx.reservation.update({
          where: { id },
          data: {
            date: slot.date,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
          },
        });
      })
      .catch((error) => {
        throw toBookingConflict(error);
      });
  }
}
