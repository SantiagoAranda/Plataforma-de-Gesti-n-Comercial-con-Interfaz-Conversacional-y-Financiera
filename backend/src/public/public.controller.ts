import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  BadRequestException,
  Patch,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';

@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  /* =========================================================
     SERVICIOS (RESERVAS)
  ========================================================== */

  @Get(':slug/services')
  async getServices(@Param('slug') slug: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) throw new BadRequestException('Business not found');

    const services = await this.prisma.item.findMany({
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

    return services.map((s) => ({
      ...s,
      price: Number(s.price),
    }));
  }

  @Post(':slug/reserve')
  async createReservation(
    @Param('slug') slug: string,
    @Body() dto: CreateReservationDto,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
    });

    if (!business) throw new BadRequestException('Business not found');
    if (dto.startMinute >= dto.endMinute)
      throw new BadRequestException('Invalid time range');

    const item = await this.prisma.item.findFirst({
      where: {
        id: dto.itemId,
        businessId: business.id,
        type: 'SERVICE',
      },
    });

    if (!item) throw new BadRequestException('Invalid service');

    const dateOnly = new Date(dto.date);
    dateOnly.setHours(0, 0, 0, 0);

    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        businessId: business.id,
        itemId: dto.itemId,
        date: dateOnly,
        status: { not: 'CANCELLED' },
        AND: [
          { startMinute: { lt: dto.endMinute } },
          { endMinute: { gt: dto.startMinute } },
        ],
      },
    });

    if (overlapping)
      throw new BadRequestException('Time slot already booked');

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
      publicToken: reservation.publicToken,
    };
  }

  @Get('reservation/:token')
  async getReservation(@Param('token') token: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { publicToken: token },
    });

    if (!reservation)
      throw new BadRequestException('Reservation not found');

    return reservation;
  }

  @Patch('reservation/:token/cancel')
  async cancelReservation(@Param('token') token: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { publicToken: token },
    });

    if (!reservation)
      throw new BadRequestException('Reservation not found');

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CANCELLED' },
    });
  }

  /* =========================================================
     ITEMS (CATÁLOGO)
  ========================================================== */

  @Get(':slug/items')
  async listPublicItems(
    @Param('slug') slug: string,
    @Query('type') type?: string,
  ) {
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

    return {
      business,
      data: data.map((item) => ({
        ...item,
        price: Number(item.price),
      })),
    };
  }

  @Get(':slug/items/:itemId')
  async getPublicItem(
    @Param('slug') slug: string,
    @Param('itemId') itemId: string,
  ) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true },
    });

    if (!business) throw new NotFoundException('Business not found');

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        status: 'ACTIVE',
      },
      include: { images: { orderBy: { order: 'asc' } } },
    });

    if (!item) throw new NotFoundException('Item not found');

    return {
      business,
      item: {
        ...item,
        price: Number(item.price),
      },
    };
  }

  /* =========================================================
     ÓRDENES PÚBLICAS (COMPRAS)
  ========================================================== */

  @Post(':slug/order')
  async createOrder(
    @Param('slug') slug: string,
    @Body()
    body: {
      customerName: string;
      customerWhatsapp: string;
      items: { itemId: string; quantity: number }[];
      note?: string;
    },
  ) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) throw new BadRequestException('Business not found');
    if (!body.items || body.items.length === 0)
      throw new BadRequestException('Order must contain items');

    const dbItems = await this.prisma.item.findMany({
      where: {
        id: { in: body.items.map((i) => i.itemId) },
        businessId: business.id,
        status: 'ACTIVE',
      },
    });

    if (dbItems.length !== body.items.length)
      throw new BadRequestException('Invalid items');

    const order = await this.prisma.order.create({
      data: {
        businessId: business.id,
        customerName: body.customerName,
        customerWhatsapp: body.customerWhatsapp,
        note: body.note,
        status: 'DRAFT',
        items: {
          create: body.items.map((inputItem) => {
            const item = dbItems.find((i) => i.id === inputItem.itemId)!;
            const quantity = inputItem.quantity ?? 1;

            const unitPrice = item.price;
            const lineTotal = unitPrice.mul(quantity);

            return {
              businessId: business.id,
              itemId: item.id,
              quantity,
              itemNameSnapshot: item.name,
              itemTypeSnapshot: item.type,
              durationMinutesSnapshot: item.durationMinutes,
              unitPrice,
              lineTotal,
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
      publicToken: order.publicToken,
    };
  }

  @Get('order/:token')
  async getOrder(@Param('token') token: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicToken: token },
      include: {
        items: true,
        business: {
          select: { name: true, phoneWhatsapp: true },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return {
      ...order,
      total: Number(order.total),
      items: order.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
    };
  }

  @Patch('order/:token/cancel')
  async cancelOrder(@Param('token') token: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicToken: token },
    });

    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
  }

  @Patch('order/:token/confirm')
  async confirmOrder(@Param('token') token: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicToken: token },
    });

    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  }
}