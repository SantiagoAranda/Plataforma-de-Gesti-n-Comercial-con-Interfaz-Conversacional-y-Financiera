import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateReservationDto) {
    if (dto.startMinute >= dto.endMinute) {
      throw new BadRequestException('Invalid time range');
    }

    // Verificar que el servicio pertenece al negocio
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

    const dateOnly = new Date(dto.date);
    dateOnly.setHours(0, 0, 0, 0);

    // Validar solapamiento
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
            startMinute: {
              lt: dto.endMinute,
            },
          },
          {
            endMinute: {
              gt: dto.startMinute,
            },
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
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        date: dateOnly,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
      },
    });
  }

  async findByDate(businessId: string, date: string) {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

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
}
