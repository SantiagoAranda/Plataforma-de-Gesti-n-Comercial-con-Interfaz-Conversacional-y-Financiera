import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';

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

      const lineTotal = Number(item.price) * input.quantity;
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

  async confirmOrder(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        businessId,
      },
    });
if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT orders can be confirmed');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
      },
      include: {
        items: true,
      },
    });

    return updatedOrder;
  }

  async getOrderOrThrow(businessId: string, orderId: string) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: { items: true },
  });
  if (!order) throw new NotFoundException("Order not found");
  return order;
}
async addItem(businessId: string, orderId: string, dto: AddOrderItemDto) {
  // 1) Verificar orden del negocio
  const order = await this.getOrderOrThrow(businessId, orderId);

  // (opcional) bloquear si status no permite editar
  if (order.status !== "DRAFT") throw new BadRequestException("Order not editable");

  // 2) Traer item real del catálogo (solo del mismo negocio y activo)
  const item = await this.prisma.item.findFirst({
    where: { id: dto.itemId, businessId, status: "ACTIVE" },
  });
  if (!item) throw new BadRequestException("Invalid item");

  // 3) Calcular precios/snapshots
  const unitPrice = item.price; // Decimal
  // si usás Decimal, lineTotal preferible en Decimal también
  // Prisma Decimal soporta multiplicación manual si convertís, pero simple: (Number(...) * qty) y luego toFixed
  const lineTotal = Number(unitPrice) * dto.quantity;

  // 4) Transacción: crear OrderItem + actualizar total
  return this.prisma.$transaction(async (tx) => {
    const created = await tx.orderItem.create({
      data: {
        orderId: order.id,
        businessId,
        itemId: item.id,
        quantity: dto.quantity,
        itemNameSnapshot: item.name,
        itemTypeSnapshot: item.type,
        durationMinutesSnapshot: item.durationMinutes,
        unitPrice: unitPrice,
        lineTotal: lineTotal,
      },
    });

    const totals = await tx.orderItem.aggregate({
      where: { orderId: order.id },
      _sum: { lineTotal: true },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { total: totals._sum.lineTotal ?? 0 },
    });

    return created;
  });
}

async updateItem(
  businessId: string,
  orderId: string,
  orderItemId: string,
  dto: UpdateOrderItemDto,
) {
  const order = await this.getOrderOrThrow(businessId, orderId);

  // Bloquear edición si no es DRAFT
  if (order.status !== 'DRAFT') {
    throw new BadRequestException('Order not editable');
  }

  const oi = await this.prisma.orderItem.findFirst({
    where: { id: orderItemId, orderId, businessId },
  });
  if (!oi) throw new NotFoundException('OrderItem not found');

  const nextLineTotal = Number(oi.unitPrice) * dto.quantity;

  return this.prisma.$transaction(async (tx) => {
    const updated = await tx.orderItem.update({
      where: { id: oi.id },
      data: { quantity: dto.quantity, lineTotal: nextLineTotal },
    });

    const totals = await tx.orderItem.aggregate({
      where: { orderId },
      _sum: { lineTotal: true },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { total: totals._sum.lineTotal ?? 0 },
    });

    return updated;
  });
}

async removeItem(businessId: string, orderId: string, orderItemId: string) {
  const order = await this.getOrderOrThrow(businessId, orderId);

  // Bloquear edición si no es DRAFT
  if (order.status !== 'DRAFT') {
    throw new BadRequestException('Order not editable');
  }

  const oi = await this.prisma.orderItem.findFirst({
    where: { id: orderItemId, orderId, businessId },
  });
  if (!oi) throw new NotFoundException('OrderItem not found');

  return this.prisma.$transaction(async (tx) => {
    await tx.orderItem.delete({ where: { id: oi.id } });

    const totals = await tx.orderItem.aggregate({
      where: { orderId },
      _sum: { lineTotal: true },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { total: totals._sum.lineTotal ?? 0 },
    });

    return { ok: true };
  });
}

async getOne(businessId: string, orderId: string) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: { items: true },
  });
  if (!order) throw new NotFoundException('Order not found');
  return order;
}

async cancel(businessId: string, orderId: string) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, businessId },
  });
  if (!order) throw new NotFoundException('Order not found');

  // regla simple MVP: no cancelar si ya está COMPLETED
  if (order.status === 'COMPLETED') {
    throw new BadRequestException('Completed orders cannot be cancelled');
  }

  return this.prisma.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
    include: { items: true },
  });
}

}
