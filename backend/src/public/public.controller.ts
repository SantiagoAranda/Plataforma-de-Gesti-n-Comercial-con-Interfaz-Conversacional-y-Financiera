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
      select: { id: true },
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
      ...item,
      price: Number(item.price),
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

    if (!body.customerName || !body.customerWhatsapp)
      throw new BadRequestException('Customer data required');

    if (!body.items || body.items.length === 0)
      throw new BadRequestException('Order must contain items');

    for (const item of body.items) {
      if (!item.quantity || item.quantity <= 0)
        throw new BadRequestException('Invalid quantity');
    }

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
        status: 'SENT',
        sentAt: new Date(),
        items: {
          create: body.items.map((inputItem) => {
            const item = dbItems.find((i) => i.id === inputItem.itemId)!;
            const quantity = inputItem.quantity;

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
      orderId: order.publicToken, // 🔐 usamos token seguro
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

    if (order.status === 'CANCELLED')
      throw new BadRequestException('Order already cancelled');

    if (order.status === 'COMPLETED')
      throw new BadRequestException(
        'Completed orders cannot be cancelled',
      );

    return this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
  }

  @Get(':slug/reservations')
  async getReservationsByDate(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('itemId') itemId: string,
  ) {
    const business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) throw new BadRequestException('Business not found');

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        businessId: business.id,
        itemId,
        date: dateOnly,
        status: { not: 'CANCELLED' },
      },
      select: {
        startMinute: true,
        endMinute: true,
      },
    });

    return reservations;
  }
}