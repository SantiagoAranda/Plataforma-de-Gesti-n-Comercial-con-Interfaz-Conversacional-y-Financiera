import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service"; // ajustá si ya lo tenés distinto
import { UpdateItemDto } from "./dto/update-item.dto";
import { ItemStatus } from '@prisma/client';
import { AddItemImageDto } from "./dto/add-item-image.dto";
import { CreateItemDto } from "./dto/create-item.dto";

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateItemDto) {
    return this.prisma.item.create({
      data: {
        businessId,
        type: dto.type,
        name: dto.name,
        price: dto.price,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.item.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(businessId: string, id: string) {
  const item = await this.prisma.item.findFirst({
    where: { id, businessId },
    include: { images: { orderBy: { order: "asc" } } },
  });
  if (!item) throw new NotFoundException("Item not found");
  return item;
}
async update(businessId: string, id: string, dto: UpdateItemDto) {
  const existing = await this.prisma.item.findFirst({ where: { id, businessId } });
  if (!existing) throw new NotFoundException("Item not found");

  const nextType = dto.type ?? existing.type;

  // si queda como SERVICE, durationMinutes no puede quedar null/undefined
  const nextDuration =
    nextType === "SERVICE"
      ? (dto.durationMinutes ?? existing.durationMinutes ?? 0)
      : null;

  if (nextType === "SERVICE" && (nextDuration === null || nextDuration === undefined)) {
    throw new BadRequestException("durationMinutes is required for SERVICE");
  }

  return this.prisma.item.update({
    where: { id }, // seguro porque validamos antes con businessId
    data: {
      type: dto.type,
      name: dto.name,
      price: dto.price,
      description: dto.description === undefined ? undefined : (dto.description ?? null),
      durationMinutes:
        dto.durationMinutes === undefined && dto.type === undefined ? undefined : nextDuration,
    },
    include: { images: { orderBy: { order: "asc" } } },
  });
}
async setStatus(businessId: string, id: string, status: ItemStatus) {
  const existing = await this.prisma.item.findFirst({ where: { id, businessId } });
  if (!existing) throw new NotFoundException("Item not found");

  return this.prisma.item.update({
    where: { id },
    data: { status },
  });
}
async remove(businessId: string, id: string) {
  const existing = await this.prisma.item.findFirst({ where: { id, businessId } });
  if (!existing) throw new NotFoundException("Item not found");

  await this.prisma.$transaction([
    this.prisma.itemImage.deleteMany({ where: { itemId: id } }),
    this.prisma.item.delete({ where: { id } }),
  ]);

  return { ok: true };
}
async addImage(businessId: string, itemId: string, dto: AddItemImageDto) {
  const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId } });
  if (!item) throw new NotFoundException("Item not found");

  const nextOrder =
    dto.order ??
    ((await this.prisma.itemImage.aggregate({
      where: { itemId },
      _max: { order: true },
    }))._max.order ?? 0) + 1;

  // si por algún motivo el order choca, Prisma tirará error por unique(itemId, order)
  return this.prisma.itemImage.create({
    data: { itemId, url: dto.url, order: nextOrder },
  });
}
async deleteImage(businessId: string, itemId: string, imageId: string) {
  const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId } });
  if (!item) throw new NotFoundException("Item not found");

  const img = await this.prisma.itemImage.findFirst({ where: { id: imageId, itemId } });
  if (!img) throw new NotFoundException("Image not found");

  await this.prisma.itemImage.delete({ where: { id: imageId } });
  return { ok: true };
}

}
