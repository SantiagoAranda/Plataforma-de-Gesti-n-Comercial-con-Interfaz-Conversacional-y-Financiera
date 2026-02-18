import { Controller, Get, Param, Post, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';

@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get(':slug/services')
  async getServices(@Param('slug') slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    return this.prisma.item.findMany({
      where: {
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        price: true,
        durationMinutes: true,
      },
    });
  }

  @Post(':slug/reserve')
  async createReservation(
    @Param('slug') slug: string,
    @Body() dto: CreateReservationDto,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    if (dto.startMinute >= dto.endMinute) {
      throw new BadRequestException('Invalid time range');
    }

    const item = await this.prisma.item.findFirst({
      where: {
        id: dto.itemId,
        businessId: business.id,
        type: 'SERVICE',
      },
    });

    if (!item) {
      throw new BadRequestException('Invalid service');
    }

    const dateOnly = new Date(dto.date);
    dateOnly.setHours(0, 0, 0, 0);

    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        businessId: business.id,
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
        businessId: business.id,
        itemId: dto.itemId,
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        date: dateOnly,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
      },
    });
  }
}
