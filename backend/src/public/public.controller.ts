import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';
import { NotFoundException } from '@nestjs/common';

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
          { startMinute: { lt: dto.endMinute } },
          { endMinute: { gt: dto.startMinute } },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('Time slot already booked');
    }

    const reservation = await this.prisma.reservation.create({
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

    return {
      message: 'Reservation created',
      reservationId: reservation.id,
      editUrl: `/public/reservation/${reservation.publicToken}`,
    };
  }

  @Get('reservation/:token')
  async getReservation(@Param('token') token: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { publicToken: token },
    });

    if (!reservation) {
      throw new BadRequestException('Reservation not found');
    }

    return reservation;
  }

  @Patch('reservation/:token/cancel')
  async cancelByToken(@Param('token') token: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { publicToken: token },
    });

    if (!reservation) {
      throw new BadRequestException('Reservation not found');
    }

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'CANCELLED',
      },
    });
  }

 @Get(':slug/items')
async listPublicItems(@Param('slug') slug: string, @Query('type') type?: string) {
  const business = await this.prisma.business.findFirst({
    where: { slug, status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
  });

  if (!business) return { business: null, data: [] };

  const where: any = { businessId: business.id, status: 'ACTIVE' };
  if (type) where.type = type;

  const data = await this.prisma.item.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { images: { orderBy: { order: 'asc' } } },
  });

  return { business, data };
}

@Get(':slug/items/:itemId')
async getPublicItem(@Param('slug') slug: string, @Param('itemId') itemId: string) {
  const business = await this.prisma.business.findFirst({
    where: { slug, status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
  });

  if (!business) throw new NotFoundException('Business not found');

  const item = await this.prisma.item.findFirst({
    where: { id: itemId, businessId: business.id, status: 'ACTIVE' },
    include: { images: { orderBy: { order: 'asc' } } },
  });

  if (!item) throw new NotFoundException('Item not found');

  return { business, item };
}
}
