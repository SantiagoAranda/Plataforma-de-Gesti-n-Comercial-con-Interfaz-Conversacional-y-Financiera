import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service"; // ajustá si ya lo tenés distinto
import { UpdateItemDto } from "./dto/update-item.dto";
import { ItemStatus } from '@prisma/client';
import { AddItemImageDto } from "./dto/add-item-image.dto";
import { CreateItemDto } from "./dto/create-item.dto";

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  private mapItemWithSchedule<T extends { scheduleWindows?: any[] }>(item: T) {
    const { scheduleWindows, ...rest } = item as T & { scheduleWindows?: any[] };
    return {
      ...rest,
      schedule: (scheduleWindows ?? []).map((window) => ({
        weekday: window.weekday,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
      })),
    };
  }

  async create(businessId: string, dto: CreateItemDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.item.create({
          data: {
            id: dto.id, // Prisma usará uuid() si es undefined
            businessId,
            type: dto.type,
            name: dto.name,
            price: dto.price,
            description: dto.description,
            durationMinutes: dto.durationMinutes,
          },
        });

        // 🔥 Si es SERVICE y tiene horarios → crear ventanas
        if (dto.type === 'SERVICE' && dto.schedule?.length) {
          await tx.serviceScheduleWindow.createMany({
            data: dto.schedule.map((s) => ({
              businessId,
              itemId: item.id,
              weekday: s.weekday,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
            })),
          });
        }

        const created = await tx.item.findUniqueOrThrow({
          where: { id: item.id },
          include: {
            images: {
              orderBy: { order: "asc" },
            },
            scheduleWindows: {
              orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
            },
          },
        });

        return this.mapItemWithSchedule(created);
      });
    } catch (error) {
      // Si el error es una colisión de ID único (P2002)
      if (error.code === 'P2002' && dto.id) {
        // Buscamos el item existente para validar que pertenezca al mismo negocio
        const existingItem = await this.prisma.item.findUnique({
          where: { id: dto.id },
          include: {
            images: { orderBy: { order: "asc" } },
            scheduleWindows: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
          },
        });

        // Si existe y es del mismo negocio, lo retornamos como respuesta idempotente
        if (existingItem && existingItem.businessId === businessId) {
          return this.mapItemWithSchedule(existingItem);
        }
      }
      // Si es otro error o la validación de negocio falla, re-lanzamos el error
      throw error;
    }
  }

  async getLatestActivity(businessId: string) {
    const item = await this.prisma.item.findFirst({
      where: { businessId, status: ItemStatus.ACTIVE },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        images: {
          take: 1,
          orderBy: { order: 'asc' },
          select: { id: true, url: true, order: true },
        },
      },
    });
    return { item };
  }

  async findAll(businessId: string, status?: string, lightweight = false) {
    const itemStatus = status === 'INACTIVE' ? ItemStatus.INACTIVE : ItemStatus.ACTIVE;

    if (lightweight) {
      const items = await this.prisma.item.findMany({
        where: { businessId, status: itemStatus },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          price: true,
          type: true,
          status: true,
          description: true,
          durationMinutes: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { images: true }
          },
          images: {
            take: 1,
            orderBy: { order: 'asc' },
            select: { id: true, url: true, order: true },
          },
          scheduleWindows: {
            select: { weekday: true, startMinute: true, endMinute: true }
          },
        },
      });
      // Normalizar al mismo shape que el full para compatibilidad con el frontend
      return items.map((item) => this.mapItemWithSchedule(item));
    }

    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        status: itemStatus,
      },
      orderBy: { createdAt: "desc" },
      include: {
        images: {
          orderBy: { order: "asc" },
        },
        scheduleWindows: {
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
    });

    return items.map((item) => this.mapItemWithSchedule(item));
  }

  async findOne(businessId: string, id: string) {
  const item = await this.prisma.item.findFirst({
    where: { id, businessId },
    include: {
      images: { orderBy: { order: "asc" } },
      scheduleWindows: {
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      },
    },
  });
  if (!item) throw new NotFoundException("Item not found");
  return this.mapItemWithSchedule(item);
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

  return this.prisma.$transaction(async (tx) => {
    await tx.item.update({
      where: { id },
      data: {
        type: dto.type,
        name: dto.name,
        price: dto.price,
        description: dto.description === undefined ? undefined : (dto.description ?? null),
        durationMinutes:
          dto.durationMinutes === undefined && dto.type === undefined ? undefined : nextDuration,
      },
    });

    const shouldReplaceSchedule = dto.schedule !== undefined || nextType !== "SERVICE";
    if (shouldReplaceSchedule) {
      await tx.serviceScheduleWindow.deleteMany({
        where: { businessId, itemId: id },
      });

      if (nextType === "SERVICE" && dto.schedule && dto.schedule.length > 0) {
        await tx.serviceScheduleWindow.createMany({
          data: dto.schedule.map((window) => ({
            businessId,
            itemId: id,
            weekday: window.weekday,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
          })),
        });
      }
    }

    const updated = await tx.item.findUniqueOrThrow({
      where: { id },
      include: {
        images: { orderBy: { order: "asc" } },
        scheduleWindows: {
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
    });

    return this.mapItemWithSchedule(updated);
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
  const existing = await this.prisma.item.findFirst({
    where: { id, businessId },
  });

  if (!existing) throw new NotFoundException("Item not found");

  // En lugar de borrar, lo archivamos
  await this.prisma.item.update({
    where: { id },
    data: { status: ItemStatus.INACTIVE },
  });

  return { ok: true };
}

async addImage(businessId: string, itemId: string, dto: AddItemImageDto) {
  const item = await this.prisma.item.findFirst({
    where: { id: itemId, businessId },
    include: { _count: { select: { images: true } } },
  });
  if (!item) throw new NotFoundException("Item not found");

  if (item._count.images >= 5) {
    throw new BadRequestException("El límite máximo de imágenes por item es 5");
  }

  const nextOrder =

    dto.order ??
    ((await this.prisma.itemImage.aggregate({
      where: { itemId },
      _max: { order: true },
    }))._max.order ?? 0) + 1;

  // si por algún motivo el order choca, Prisma tirará error por unique(itemId, order)
  return this.prisma.itemImage.create({
    data: {
      itemId,
      url: dto.url,
      pathname: dto.pathname,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      order: nextOrder,
    },
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
