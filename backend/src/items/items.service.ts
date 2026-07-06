import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMode, ItemStatus, Prisma } from '@prisma/client';
import sharp from 'sharp';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import { UpdateItemDto } from './dto/update-item.dto';
import { AddItemImageDto } from './dto/add-item-image.dto';
import { CreateItemDto } from './dto/create-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private inventoryService: InventoryService,
  ) {}

  private normalizeBadges(input: any) {
    if (!Array.isArray(input)) return [];

    return input
      .map((b) => ({
        text: typeof b?.text === 'string' ? b.text.trim() : '',
        color: typeof b?.color === 'string' ? b.color.trim() : '',
      }))
      .filter((b) => b.text.length > 0)
      .map((b) => ({
        text: b.text,
        color: b.color || '#ef4444',
      }))
      .slice(0, 2);
  }

  private mapItemWithSchedule<
    T extends { scheduleWindows?: any[]; images?: any[] },
  >(item: T) {
    const { scheduleWindows, images, ...rest } = item as T & {
      scheduleWindows?: any[];
      images?: any[];
    };

    let resolvedImages = images;

    if (images) {
      resolvedImages = images.map((img) => ({
        ...img,
        url: img.objectKey
          ? this.storageService.getPublicUrl(img.objectKey)
          : img.url,
      }));
    }

    return {
      ...rest,
      ...(resolvedImages ? { images: resolvedImages } : {}),
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
        console.log(`[ItemsService] Creating item: "${dto.name}"`);
        console.log(
          `[ItemsService] Name Hex: ${Buffer.from(dto.name).toString('hex')}`,
        );

        const cleanedBadges = this.normalizeBadges((dto as any).badges);

        const cleanedBadgeText = dto.badgeText?.trim() ?? '';
        const legacyBadgeText = cleanedBadgeText ? cleanedBadgeText : null;
        const cleanedBadgeColor = dto.badgeColor?.trim() ?? '';
        const legacyBadgeColor = legacyBadgeText
          ? cleanedBadgeColor || '#ef4444'
          : null;

        const nextBadges = [...cleanedBadges];

        if (legacyBadgeText) {
          const legacy = {
            text: legacyBadgeText,
            color: legacyBadgeColor ?? '#ef4444',
          };

          const exists = nextBadges.some(
            (b) =>
              b.text.toUpperCase() === legacy.text.toUpperCase() &&
              b.color.toLowerCase() === legacy.color.toLowerCase(),
          );

          if (!exists) nextBadges.unshift(legacy);
        }

        const finalBadges = nextBadges.slice(0, 2);
        const firstBadge = finalBadges[0] ?? null;

        const item = await tx.item.create({
          data: {
            id: dto.id,
            businessId,
            type: dto.type,
            inventoryMode: this.resolveInventoryMode(
              dto.type,
              dto.inventoryMode,
            ),
            name: dto.name,
            price: dto.price,
            appliesImpoconsumo:
              dto.type === 'PRODUCT' ? (dto.appliesImpoconsumo ?? false) : false,
            impoconsumoRate:
              dto.type === 'PRODUCT' && dto.appliesImpoconsumo
                ? dto.impoconsumoRate
                : null,
            saleConcept: dto.saleConcept ?? (dto.type === 'SERVICE' ? 'SERVICES' : 'GOODS'),
            description: dto.description?.trim() || null,
            minStock:
              dto.minStock === undefined
                ? undefined
                : new Prisma.Decimal(dto.minStock),
            badgeText: firstBadge?.text ?? legacyBadgeText,
            badgeColor: firstBadge?.color ?? legacyBadgeColor,
            badges: finalBadges.length ? finalBadges : null,
            durationMinutes: dto.durationMinutes,
          },
        });

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
              orderBy: { order: 'asc' },
            },
            scheduleWindows: {
              orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
            },
          },
        });

        return this.mapItemWithSchedule(created);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.id
      ) {
        const existingItem = await this.prisma.item.findUnique({
          where: { id: dto.id },
          include: {
            images: { orderBy: { order: 'asc' } },
            scheduleWindows: {
              orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
            },
          },
        });

        if (existingItem && existingItem.businessId === businessId) {
          return this.mapItemWithSchedule(existingItem);
        }
      }

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
        badgeText: true,
        badgeColor: true,
        badges: true,
        images: {
          take: 1,
          orderBy: { order: 'asc' },
          select: { id: true, url: true, order: true, objectKey: true },
        },
      },
    });

    let resolvedItem = item;

    if (item && item.images) {
      resolvedItem = {
        ...item,
        images: item.images.map((img) => ({
          ...img,
          url: img.objectKey
            ? this.storageService.getPublicUrl(img.objectKey)
            : img.url,
        })),
      };
    }

    return { item: resolvedItem };
  }

  async findAll(
    businessId: string,
    status?: string,
    lightweight = false,
    context: 'management' | 'sales' | 'public-store' = 'management',
  ) {
    const itemStatus =
      status === 'INACTIVE' ? ItemStatus.INACTIVE : ItemStatus.ACTIVE;

    if (lightweight) {
      const items = await this.prisma.item.findMany({
        where: { businessId, status: itemStatus },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          price: true,
          appliesImpoconsumo: true,
          impoconsumoRate: true,
          saleConcept: true,
          type: true,
          status: true,
          inventoryMode: true,
          description: true,
          durationMinutes: true,
          badgeText: true,
          badgeColor: true,
          badges: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { images: true },
          },
          images: {
            take: 1,
            orderBy: { order: 'asc' },
            select: { id: true, url: true, order: true, objectKey: true },
          },
          scheduleWindows: {
            select: { weekday: true, startMinute: true, endMinute: true },
          },
        },
      });

      return this.withSellabilityForItems(
        items.map((item) => this.mapItemWithSchedule(item)),
        businessId,
        context,
      );
    }

    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        status: itemStatus,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
        scheduleWindows: {
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        },
        recipes: {
          include: {
            ingredient: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        optionGroups: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            totalQuantityUnit: true,
            options: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              include: {
                ingredient: { select: { id: true, name: true } },
                item: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    inventoryMode: true,
                  },
                },
                unit: true,
              },
            },
          },
        },
      },
    });

    return this.withSellabilityForItems(
      items.map((item) => this.mapItemWithSchedule(item)),
      businessId,
      context,
    );
  }

  private async withSellabilityForItems<
    T extends { id: string; inventoryMode?: string | null },
  >(
    items: T[],
    businessId: string,
    context: 'management' | 'sales' | 'public-store',
  ) {
    const sellabilities = await this.inventoryService.getItemsSellabilityBulk(
      businessId,
      items.map((item) => item.id),
    );
    const enriched = items.map((item, index) => {
      const sellability = sellabilities[index];
      return {
        ...item,
        sellability,
        currentStock: sellability.currentStock,
        averageCost: sellability.averageCost,
      };
    });

    if (context === 'management') return enriched;
    return enriched.filter((item) => item.sellability.sellable);
  }

  async findOne(businessId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, businessId },
      include: {
        images: { orderBy: { order: 'asc' } },
        scheduleWindows: {
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        },
      },
    });

    if (!item) throw new NotFoundException('Item not found');

    return this.mapItemWithSchedule(item);
  }

  async update(businessId: string, id: string, dto: UpdateItemDto) {
    const existing = await this.prisma.item.findFirst({
      where: { id, businessId },
    });

    if (!existing) throw new NotFoundException('Item not found');

    const nextType = dto.type ?? existing.type;

    const nextInventoryMode = this.resolveInventoryMode(
      nextType,
      dto.inventoryMode ?? existing.inventoryMode,
    );

    const nextDuration =
      nextType === 'SERVICE'
        ? (dto.durationMinutes ?? existing.durationMinutes ?? 0)
        : null;

    if (
      nextType === 'SERVICE' &&
      (nextDuration === null || nextDuration === undefined)
    ) {
      throw new BadRequestException('durationMinutes is required for SERVICE');
    }

    const hasBadgeTextField = dto.badgeText !== undefined;
    const hasBadgeColorField = dto.badgeColor !== undefined;
    const hasBadgesField = (dto as any).badges !== undefined;

    let nextBadgeText: string | null | undefined = undefined;
    let nextBadgeColor: string | null | undefined = undefined;
    let nextBadges: any = undefined;

    if (hasBadgeTextField) {
      const cleanedText = (dto.badgeText ?? '').trim();
      const finalText = cleanedText ? cleanedText : null;

      const cleanedColor = hasBadgeColorField
        ? (dto.badgeColor ?? '').trim()
        : (existing.badgeColor ?? '').trim();

      nextBadgeText = finalText;
      nextBadgeColor = finalText ? cleanedColor || '#ef4444' : null;
    } else if (hasBadgeColorField) {
      const cleanedColor = (dto.badgeColor ?? '').trim();
      const hasExistingText = (existing.badgeText ?? '').trim().length > 0;

      nextBadgeColor = hasExistingText
        ? cleanedColor || '#ef4444'
        : cleanedColor || null;
    }

    if (hasBadgesField) {
      const cleaned = this.normalizeBadges((dto as any).badges);
      nextBadges = cleaned.length ? cleaned : null;

      nextBadgeText = cleaned[0]?.text ?? null;
      nextBadgeColor = cleaned[0]?.color ?? null;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        data: {
          type: dto.type,
          inventoryMode:
            dto.inventoryMode === undefined && dto.type === undefined
              ? undefined
              : nextInventoryMode,
          name: dto.name,
          price: dto.price,
          appliesImpoconsumo:
            nextType === 'PRODUCT'
              ? dto.appliesImpoconsumo
              : false,
          impoconsumoRate:
            nextType !== 'PRODUCT'
              ? null
              : dto.appliesImpoconsumo === false
                ? null
                : dto.impoconsumoRate === undefined
                  ? undefined
                  : dto.impoconsumoRate,
          saleConcept: dto.saleConcept !== undefined 
            ? dto.saleConcept 
            : dto.type !== undefined
              ? (dto.type === 'SERVICE' ? 'SERVICES' : 'GOODS')
              : undefined,
          description:
            dto.description === undefined
              ? undefined
              : dto.description?.trim() || null,
          minStock:
            dto.minStock === undefined
              ? undefined
              : new Prisma.Decimal(dto.minStock),
          badgeText:
            hasBadgesField || hasBadgeTextField ? nextBadgeText : undefined,
          badgeColor:
            hasBadgesField || hasBadgeTextField || hasBadgeColorField
              ? nextBadgeColor
              : undefined,
          badges: hasBadgesField ? nextBadges : undefined,
          durationMinutes:
            dto.durationMinutes === undefined && dto.type === undefined
              ? undefined
              : nextDuration,
        },
      });

      if (dto.name) {
        console.log(`[ItemsService] Updated item name: "${dto.name}"`);
        console.log(
          `[ItemsService] Name Hex: ${Buffer.from(dto.name).toString('hex')}`,
        );
      }

      const shouldReplaceSchedule =
        dto.schedule !== undefined || nextType !== 'SERVICE';

      if (shouldReplaceSchedule) {
        await tx.serviceScheduleWindow.deleteMany({
          where: { businessId, itemId: id },
        });

        if (nextType === 'SERVICE' && dto.schedule && dto.schedule.length > 0) {
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
          images: { orderBy: { order: 'asc' } },
          scheduleWindows: {
            orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
          },
        },
      });

      return this.mapItemWithSchedule(updated);
    });
  }

  async setStatus(businessId: string, id: string, status: ItemStatus) {
    const existing = await this.prisma.item.findFirst({
      where: { id, businessId },
    });

    if (!existing) throw new NotFoundException('Item not found');

    return this.prisma.item.update({
      where: { id },
      data: { status },
    });
  }

  async remove(businessId: string, id: string) {
    const existing = await this.prisma.item.findFirst({
      where: { id, businessId },
    });

    if (!existing) throw new NotFoundException('Item not found');

    await this.prisma.item.update({
      where: { id },
      data: { status: ItemStatus.INACTIVE },
    });

    return { ok: true };
  }

  async addImage(businessId: string, itemId: string, dto: AddItemImageDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, businessId },
    });

    if (!item) throw new NotFoundException('Item not found');

    if (dto.url?.startsWith('data:')) {
      throw new BadRequestException(
        'Las imagenes deben subirse con multipart/form-data en /items/:id/images/upload',
      );
    }

    const nextOrder =
      dto.order ??
      (
        await this.prisma.itemImage.aggregate({
          where: { itemId },
          _max: { order: true },
        })
      )._max.order ??
      0 + 1;

    return this.prisma.itemImage.create({
      data: {
        itemId,
        url: dto.url,
        order: nextOrder,
      },
    });
  }

  async deleteImage(businessId: string, itemId: string, imageId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, businessId },
    });

    if (!item) throw new NotFoundException('Item not found');

    const img = await this.prisma.itemImage.findFirst({
      where: { id: imageId, itemId },
    });

    if (!img) throw new NotFoundException('Image not found');

    if (img.objectKey) {
      try {
        await this.storageService.deleteObject(img.objectKey);
      } catch (e) {
        console.error(
          `[ItemsService] Error deleting object from R2: ${img.objectKey}`,
          e,
        );
      }
    }

    await this.prisma.itemImage.delete({
      where: { id: imageId },
    });

    return { ok: true };
  }

  async uploadImage(
    businessId: string,
    itemId: string,
    file: Express.Multer.File,
  ) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, businessId },
    });

    if (!item) throw new NotFoundException('Item not found');

    if (!file) {
      throw new BadRequestException('Archivo de imagen no enviado');
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar los 2 MB');
    }

    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('La imagen debe ser JPG, PNG o WEBP');
    }

    const optimized = await sharp(file.buffer)
      .rotate()
      .resize(1200, 1200, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    const objectKey = `businesses/${businessId}/products/${itemId}/${Date.now()}.webp`;

    await this.storageService.uploadObject({
      objectKey,
      body: optimized,
      contentType: 'image/webp',
    });

    try {
      const nextOrder =
        (
          await this.prisma.itemImage.aggregate({
            where: { itemId },
            _max: { order: true },
          })
        )._max.order ?? 0;

      const publicUrl = this.storageService.getPublicUrl(objectKey);

      return await this.prisma.itemImage.create({
        data: {
          itemId,
          url: publicUrl,
          objectKey,
          mimeType: 'image/webp',
          sizeBytes: optimized.length,
          order: nextOrder + 1,
        },
      });
    } catch (error) {
      try {
        await this.storageService.deleteObject(objectKey);
      } catch (e) {
        console.error('[ItemsService] Failed to rollback image from R2', e);
      }

      throw error;
    }
  }

  private resolveInventoryMode(
    type: 'PRODUCT' | 'SERVICE',
    inventoryMode?: InventoryMode | null,
  ) {
    const nextInventoryMode = inventoryMode ?? InventoryMode.NONE;

    if (type === 'SERVICE' && nextInventoryMode !== InventoryMode.NONE) {
      throw new BadRequestException(
        'SERVICE items must use inventoryMode NONE',
      );
    }

    return nextInventoryMode;
  }
}
