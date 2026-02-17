import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateOrderDto) {
    if (!dto.items.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // Buscar todos los items del negocio
    const itemsFromDb = await this.prisma.item.findMany({
      where: {
        id: { in: dto.items.map(i => i.itemId) },
        businessId,
      },
    });

    if (itemsFromDb.length !== dto.items.length) {
      throw new BadRequestException('One or more items are invalid');
    }

    let total = 0;

    const orderItemsData = dto.items.map(input => {
      const item = itemsFromDb.find(i => i.id === input.itemId)!;

      const lineTotal =
        Number(item.price) * input.quantity;

      total += lineTotal;

      return {
        businessId,
        itemId: item.id,
        quantity: input.quantity,
        unitPrice: item.price,
        lineTotal,
        itemNameSnapshot: item.name,
        itemTypeSnapshot: item.type,
        durationMinutesSnapshot: item.durationMinutes,
      };
    });

    const order = await this.prisma.order.create({
      data: {
        businessId,
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        note: dto.note,
        total,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: true,
      },
    });

    return order;
  }

  async findAll(businessId: string) {
    return this.prisma.order.findMany({
      where: { businessId },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
