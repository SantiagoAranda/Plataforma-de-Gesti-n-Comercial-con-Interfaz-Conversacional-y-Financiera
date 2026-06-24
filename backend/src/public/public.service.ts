import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { Prisma, Weekday } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util';
import { StorageService } from '../storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import { ItemOptionsService } from '../item-options/item-options.service';

type PublicRecipeLine = {
  ingredientId: string;
  quantityRequired: Prisma.Decimal;
  isOptional: boolean;
  ingredient: {
    id: string;
    name: string;
    currentStock: Prisma.Decimal;
  };
};

type PublicOptionForGroup = {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  targetType: string;
  ingredientId: string | null;
  itemId: string | null;
  quantity: Prisma.Decimal | null;
  unitId: string | null;
  priceDelta: Prisma.Decimal | null;
  selectedByDefault: boolean;
  removable: boolean;
  sortOrder: number;
  isActive: boolean;
  ingredient?: {
    id: string;
    name: string;
    currentStock: Prisma.Decimal;
  } | null;
  item?: {
    id: string;
    name: string;
    type: string;
    inventoryMode: string;
  } | null;
  unit?: unknown | null;
};

type PublicOptionGroupForCatalog = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  quantityMode: string;
  totalQuantityLimit: Prisma.Decimal | null;
  totalQuantityUnitId: string | null;
  totalQuantityUnit?: unknown | null;
  sortOrder: number;
  isActive: boolean;
  options: PublicOptionForGroup[];
};

@Injectable()
export class PublicService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private inventoryService: InventoryService,
    private itemOptionsService: ItemOptionsService,
  ) {}

  private normalizeExcludedOptionalIngredientIds(value: unknown) {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        'excludedOptionalIngredientIds must be an array',
      );
    }
    if (!value.every((id) => typeof id === 'string')) {
      throw new BadRequestException(
        'excludedOptionalIngredientIds must contain only strings',
      );
    }
    return value;
  }

  private assertNoDuplicateIds(ids: string[]) {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'excludedOptionalIngredientIds contains duplicates',
      );
    }
  }

  private async mapPublicOptionGroups(
    groups: PublicOptionGroupForCatalog[],
    optionSellabilityById: Map<string, { sellable: boolean }>,
  ) {
    return Promise.all(
      groups
        .filter((group) => group.isActive !== false)
        .map(async (group) => {
          const mappedOptions = await Promise.all(
            group.options
              .filter((option) => option.isActive !== false)
              .map(async (option) => {
                let requiredQty = 1;
                if (group.quantityMode === 'SHARED_TOTAL') {
                  requiredQty =
                    group.totalQuantityLimit == null
                      ? 1
                      : Number(group.totalQuantityLimit);
                } else if (group.quantityMode === 'FIXED_PER_OPTION') {
                  requiredQty =
                    option.quantity == null ? 1 : Number(option.quantity);
                }

                let hasStock = true;
                if (option.targetType === 'INGREDIENT') {
                  const currentStock =
                    option.ingredient?.currentStock == null
                      ? 0
                      : Number(option.ingredient.currentStock);
                  hasStock = currentStock >= requiredQty;
                } else if (option.targetType === 'ITEM') {
                  hasStock =
                    optionSellabilityById.get(option.id)?.sellable ?? false;
                }

                return {
                  id: option.id,
                  groupId: option.groupId,
                  name: option.name,
                  description: option.description,
                  targetType: option.targetType,
                  ingredientId: option.ingredientId,
                  itemId: option.itemId,
                  quantity:
                    option.quantity == null ? null : Number(option.quantity),
                  unitId: option.unitId,
                  priceDelta: Number(option.priceDelta ?? 0),
                  selectedByDefault: option.selectedByDefault,
                  removable: option.removable,
                  sortOrder: option.sortOrder,
                  ingredient: option.ingredient
                    ? { id: option.ingredient.id, name: option.ingredient.name }
                    : null,
                  item: option.item,
                  unit: option.unit,
                  hasStock,
                };
              }),
          );

          return {
            id: group.id,
            title: group.title,
            description: group.description,
            required: group.required,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            quantityMode: group.quantityMode,
            totalQuantityLimit:
              group.totalQuantityLimit == null
                ? null
                : Number(group.totalQuantityLimit),
            totalQuantityUnitId: group.totalQuantityUnitId,
            totalQuantityUnit: group.totalQuantityUnit,
            sortOrder: group.sortOrder,
            options: mappedOptions,
          };
        }),
    );
  }

  private withPublicLogoUrl<
    T extends { logoObjectKey?: string | null; logoUrl?: string | null },
  >(business: T): T {
    return {
      ...business,
      logoUrl: business.logoObjectKey
        ? this.storageService.getPublicUrl(business.logoObjectKey)
        : (business.logoUrl ?? null),
    };
  }

  private parseDateOnly(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
    if (!match) {
      throw new BadRequestException('Invalid date');
    }

    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        0,
        0,
        0,
        0,
      ),
    );
  }

  private parseMonth(value: string) {
    const match = /^(\d{4})-(\d{2})$/.exec((value ?? '').trim());
    if (!match) {
      throw new BadRequestException('Invalid month');
    }

    return {
      year: Number(match[1]),
      monthIndex: Number(match[2]) - 1,
    };
  }

  private formatDateOnly(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(minutes: number) {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');

    const m = (minutes % 60).toString().padStart(2, '0');

    return `${h}:${m}`;
  }

  private getWeekday(date: Date): Weekday {
    const weekdayMap: Record<number, Weekday> = {
      0: 'SUN',
      1: 'MON',
      2: 'TUE',
      3: 'WED',
      4: 'THU',
      5: 'FRI',
      6: 'SAT',
    };

    return weekdayMap[date.getUTCDay()];
  }

  private async getAvailabilitySlotsForItem(
    businessId: string,
    item: { id: string; durationMinutes: number | null },
    date: Date,
    hasSpecificWindows: boolean,
    excludeReservationId?: string,
  ) {
    const weekday = this.getWeekday(date);

    const dateKey = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');

    const [windows, reservations, blocks] = await Promise.all([
      this.prisma.serviceScheduleWindow.findMany({
        where: {
          businessId,
          weekday,
          itemId: hasSpecificWindows ? item.id : null,
        },
        orderBy: { startMinute: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          businessId,
          itemId: item.id,
          date,
          status: { not: 'CANCELLED' },
          ...(excludeReservationId
            ? { id: { not: excludeReservationId } }
            : {}),
        },
        select: {
          startMinute: true,
          endMinute: true,
        },
      }),
      this.prisma.serviceScheduleBlock.findMany({
        where: {
          businessId,
          date,
          OR: [{ itemId: item.id }, { itemId: null }],
        },
      }),
    ]);

    if (windows.length === 0) return [];

    // 1. Windows are already filtered at the database query level based on item-specific priority.
    const filteredWindows = windows;

    // 2. Fusionar ventanas superpuestas o contiguas para verificar la continuidad
    const mergedWindows: { startMinute: number; endMinute: number }[] = [];
    for (const w of filteredWindows) {
      const last = mergedWindows[mergedWindows.length - 1];
      if (last && last.endMinute >= w.startMinute) {
        last.endMinute = Math.max(last.endMinute, w.endMinute);
      } else {
        mergedWindows.push({
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        });
      }
    }

    const duration = item.durationMinutes ?? 60;
    // Fixed 60-minute step — NEVER use durationMinutes as step or slots will be skipped.
    const step = 60;
    const slots: string[] = [];

    // Compute "today" and current time in the business timezone (America/Bogota).
    // Use a YYYY-MM-DD string key comparison to avoid getTime() drift.
    const nowInBusiness = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
    );
    const todayKey = [
      nowInBusiness.getFullYear(),
      String(nowInBusiness.getMonth() + 1).padStart(2, '0'),
      String(nowInBusiness.getDate()).padStart(2, '0'),
    ].join('-');
    const isToday = dateKey === todayKey;
    // Use < (not <=) so a slot starting exactly at the current minute is still offered.
    const currentMinutes =
      nowInBusiness.getHours() * 60 + nowInBusiness.getMinutes();

    for (const window of mergedWindows) {
      // Align cursor to the next full-hour boundary (slots are always HH:00).
      let cursor = window.startMinute;
      if (cursor % 60 !== 0) {
        cursor = cursor + (60 - (cursor % 60));
      }

      while (cursor + duration <= window.endMinute) {
        const start = cursor;
        const end = cursor + duration;

        if (isToday && start < currentMinutes) {
          cursor += step;
          continue;
        }

        const overlap = reservations.some(
          (res) =>
            Math.max(start, res.startMinute) < Math.min(end, res.endMinute),
        );

        const blocked = blocks.some((block) => {
          if (block.startMinute === null && block.endMinute === null)
            return true;
          return (
            start < (block.endMinute ?? 0) && end > (block.startMinute ?? 0)
          );
        });

        if (!overlap && !blocked) slots.push(this.formatTime(start));

        cursor += step;
      }
    }

    return slots;
  }

  /* =====================================================
     ITEMS
  ===================================================== */

  async listPublicItems(slug: string, type?: string) {
    let business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        logoObjectKey: true,
        storeFooterSettings: {
          select: {
            description: true,
            email: true,
            phones: true,
            socials: true,
          },
        },
      },
    });

    if (!business) {
      const normalized = await generateSlug(slug);
      if (normalized !== slug) {
        business = await this.prisma.business.findFirst({
          where: { slug: normalized, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            logoObjectKey: true,
            storeFooterSettings: {
              select: {
                description: true,
                email: true,
                phones: true,
                socials: true,
              },
            },
          },
        });
      }
    }

    if (!business) {
      return { business: null, data: [] };
    }

    const where: any = {
      businessId: business.id,
      status: 'ACTIVE',
    };

    if (type) where.type = type;

    const data = await this.prisma.item.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        images: { orderBy: { order: 'asc' } },
        recipes: {
          select: {
            ingredientId: true,
            quantityRequired: true,
            isOptional: true,
            ingredient: {
              select: {
                id: true,
                name: true,
                currentStock: true,
              },
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
                ingredient: {
                  select: { id: true, name: true, currentStock: true },
                },
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

    const itemRequests = data.map((item) => item.id);
    const targetOptionRequests = data.flatMap((item) =>
      item.optionGroups
        .filter((group) => group.isActive !== false)
        .flatMap((group) =>
          group.options
            .filter(
              (option) =>
                option.isActive !== false &&
                option.targetType === 'ITEM' &&
                option.itemId,
            )
            .map((option) => {
              let quantity = 1;
              if (group.quantityMode === 'SHARED_TOTAL') {
                quantity =
                  group.totalQuantityLimit == null
                    ? 1
                    : Number(group.totalQuantityLimit);
              } else if (group.quantityMode === 'FIXED_PER_OPTION') {
                quantity =
                  option.quantity == null ? 1 : Number(option.quantity);
              }
              return { optionId: option.id, itemId: option.itemId!, quantity };
            }),
        ),
    );
    const sellabilities = await this.inventoryService.getItemsSellabilityBulk(
      business.id,
      [
        ...itemRequests,
        ...targetOptionRequests.map(({ itemId, quantity }) => ({
          itemId,
          quantity,
        })),
      ],
    );
    const itemSellabilities = sellabilities.slice(0, itemRequests.length);
    const optionSellabilityById = new Map(
      targetOptionRequests.map((request, index) => [
        request.optionId,
        sellabilities[itemRequests.length + index],
      ]),
    );

    const visibleItems: any[] = [];
    for (const [index, item] of data.entries()) {
      const sellability = itemSellabilities[index];
      if (sellability.sellable) {
        visibleItems.push(item);
      }
    }

    const {
      id: _businessId,
      logoObjectKey: _logoObjectKey,
      ...publicBusiness
    } = this.withPublicLogoUrl(business);

    return {
      business: publicBusiness,
      data: await Promise.all(
        visibleItems.map(async (item) => {
          const { currentStock, averageCost, ...cleanItem } = item;
          return {
            ...cleanItem,
            price: Number(item.price),
            sellability: { sellable: true },
            recipes: item.recipes
              .filter((recipe: PublicRecipeLine) => recipe.isOptional)
              .map((recipe: PublicRecipeLine) => ({
                ingredientId: recipe.ingredientId,
                isOptional: recipe.isOptional,
                ingredient: {
                  id: recipe.ingredient.id,
                  name: recipe.ingredient.name,
                },
              })),
            optionGroups: await this.mapPublicOptionGroups(
              item.optionGroups as PublicOptionGroupForCatalog[],
              optionSellabilityById,
            ),
          };
        }),
      ),
    };
  }

  /* =====================================================
     AVAILABILITY (CALCULA SLOTS DISPONIBLES)
  ===================================================== */

  async getAvailability(slug: string, itemId: string, date: string) {
    let business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) {
      const normalized = await generateSlug(slug);
      business = await this.prisma.business.findFirst({
        where: { slug: normalized, status: 'ACTIVE' },
      });
    }

    if (!business) throw new BadRequestException('Business not found');

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
      },
    });

    if (!item) throw new BadRequestException('Invalid service');

    const selectedDate = this.parseDateOnly(date);
    const specificWindowsCount = await this.prisma.serviceScheduleWindow.count({
      where: { businessId: business.id, itemId: item.id },
    });
    const hasSpecificWindows = specificWindowsCount > 0;
    return this.getAvailabilitySlotsForItem(
      business.id,
      item,
      selectedDate,
      hasSpecificWindows,
    );
  }

  async getAvailabilityCalendar(slug: string, itemId: string, month: string) {
    let business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) {
      const normalized = await generateSlug(slug);
      business = await this.prisma.business.findFirst({
        where: { slug: normalized, status: 'ACTIVE' },
      });
    }

    if (!business) throw new BadRequestException('Business not found');

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
      },
    });

    if (!item) throw new BadRequestException('Invalid service');

    const { year, monthIndex } = this.parseMonth(month);
    const firstDay = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));

    const nowInBusiness = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
    );
    const today = new Date(
      Date.UTC(
        nowInBusiness.getFullYear(),
        nowInBusiness.getMonth(),
        nowInBusiness.getDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const specificWindowsCount = await this.prisma.serviceScheduleWindow.count({
      where: { businessId: business.id, itemId: item.id },
    });
    const hasSpecificWindows = specificWindowsCount > 0;

    const cursor = new Date(firstDay);
    const availableDates: string[] = [];

    while (cursor <= lastDay) {
      if (cursor >= today) {
        const slots = await this.getAvailabilitySlotsForItem(
          business.id,
          item,
          new Date(cursor),
          hasSpecificWindows,
        );

        if (slots.length > 0) {
          availableDates.push(this.formatDateOnly(cursor));
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return availableDates;
  }

  /* =====================================================
     CREATE RESERVATION
  ===================================================== */

  async createReservation(slug: string, body: any) {
    let business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) {
      const normalized = await generateSlug(slug);
      business = await this.prisma.business.findFirst({
        where: { slug: normalized, status: 'ACTIVE' },
      });
    }

    if (!business) throw new BadRequestException('Business not found');

    return this.prisma.$transaction(async (tx) => {
      const {
        itemId,
        customerName,
        customerWhatsapp,
        date,
        startMinute,
        endMinute,
      } = body;

      if (!customerName || !customerWhatsapp)
        throw new BadRequestException('Customer data required');

      if (startMinute >= endMinute)
        throw new BadRequestException('Invalid time range');

      const selectedDate = this.parseDateOnly(date);

      const nowInBusiness = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
      );
      const today = new Date(
        Date.UTC(
          nowInBusiness.getFullYear(),
          nowInBusiness.getMonth(),
          nowInBusiness.getDate(),
          0,
          0,
          0,
          0,
        ),
      );

      if (selectedDate < today)
        throw new BadRequestException('Cannot reserve past dates');

      const item = await tx.item.findFirst({
        where: {
          id: itemId,
          businessId: business.id,
          type: 'SERVICE',
          status: 'ACTIVE',
        },
      });

      if (!item) throw new BadRequestException('Invalid service');

      const specificWindowsCount = await tx.serviceScheduleWindow.count({
        where: { businessId: business.id, itemId: item.id },
      });
      const hasSpecificWindows = specificWindowsCount > 0;

      const availableSlots = await this.getAvailabilitySlotsForItem(
        business.id,
        item,
        selectedDate,
        hasSpecificWindows,
      );
      const requestedSlot = this.formatTime(startMinute);

      if (!availableSlots.includes(requestedSlot)) {
        throw new BadRequestException(
          'Time slot already reserved or unavailable',
        );
      }

      const reservation = await tx.reservation.create({
        data: {
          businessId: business.id,
          itemId,
          customerName,
          customerWhatsapp,
          date: selectedDate,
          startMinute,
          endMinute,
          status: 'PENDING',
          origin: 'PUBLIC_STORE',
        },
      });

      console.log(
        `[PublicService] Created reservation origin: ${reservation.origin}`,
      );
      return reservation;
    });
  }

  /* =====================================================
     CREATE ORDER
  ===================================================== */

  async createOrder(slug: string, dto: CreatePublicOrderDto) {
    let business = await this.prisma.business.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!business) {
      const normalized = await generateSlug(slug);
      business = await this.prisma.business.findFirst({
        where: { slug: normalized, status: 'ACTIVE' },
      });
    }

    if (!business) throw new BadRequestException('Business not found');

    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException('Order must contain items');
    if (
      dto.items.some(
        (item) => !Number.isInteger(item.quantity) || item.quantity <= 0,
      )
    ) {
      throw new BadRequestException(
        'Item quantity must be a positive integer',
      );
    }

    const uniqueItemIds = Array.from(
      new Set(dto.items.map((item) => item.itemId)),
    );
    const dbItems = await this.prisma.item.findMany({
      where: {
        id: { in: uniqueItemIds },
        businessId: business.id,
        status: 'ACTIVE',
      },
      include: {
        recipes: {
          include: {
            ingredient: {
              select: { id: true, name: true, currentStock: true },
            },
          },
        },
        optionGroups: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (
      dbItems.length !== uniqueItemIds.length ||
      dbItems.some((item) => item.status !== 'ACTIVE')
    )
      throw new BadRequestException('Invalid items');
    const dbItemById = new Map(dbItems.map((item) => [item.id, item]));

    const visibleCustomizationNotes: string[] = [];
    const normalizedInputs = await Promise.all(
      dto.items.map(async (input) => {
        const item = dbItemById.get(input.itemId)!;
        const hasOptionGroups = item.optionGroups.length > 0;
        const excludedIds = hasOptionGroups
          ? []
          : this.normalizeExcludedOptionalIngredientIds(
              input.excludedOptionalIngredientIds,
            );
        this.assertNoDuplicateIds(excludedIds);

        const resolvedOptions =
          await this.itemOptionsService.resolveSelectionsForOrderLine(
            business.id,
            item.id,
            input.quantity,
            input.optionSelections ?? [],
          );

        if (excludedIds.length > 0) {
          if (item.type === 'SERVICE' || item.recipes.length === 0) {
            throw new BadRequestException(
              'Item does not allow optional ingredient exclusions',
            );
          }

          const recipeIngredientIds = new Set(
            item.recipes.map((recipe) => recipe.ingredientId),
          );
          const mandatoryIngredientIds = new Set(
            item.recipes
              .filter((recipe) => !recipe.isOptional)
              .map((recipe) => recipe.ingredientId),
          );

          for (const ingredientId of excludedIds) {
            if (!recipeIngredientIds.has(ingredientId)) {
              throw new BadRequestException(
                'excludedOptionalIngredientIds contains an ingredient outside the recipe',
              );
            }
            if (mandatoryIngredientIds.has(ingredientId)) {
              throw new BadRequestException(
                'Mandatory ingredients cannot be excluded',
              );
            }
          }

          const excludedNames = excludedIds
            .map(
              (ingredientId) =>
                item.recipes.find(
                  (recipe) => recipe.ingredientId === ingredientId,
                )?.ingredient.name,
            )
            .filter(Boolean);

          if (excludedNames.length > 0) {
            visibleCustomizationNotes.push(
              `${item.name}: sin ${excludedNames.join(', ')}`,
            );
          }
        }

        return { input, item, excludedIds, resolvedOptions };
      }),
    );

    const lineSellabilities =
      await this.inventoryService.getItemsSellabilityBulk(
        business.id,
        normalizedInputs.map(({ input, item }) => ({
          itemId: item.id,
          quantity: input.quantity,
        })),
      );
    for (const [index] of normalizedInputs.entries()) {
      const sellability = lineSellabilities[index];
      if (!sellability.sellable) {
        throw new BadRequestException(
          sellability.message ?? 'Producto no vendible',
        );
      }
    }

    const visibleNote =
      [dto.note?.trim() || null, ...visibleCustomizationNotes]
        .filter(Boolean)
        .join('\n') || null;

    const orderItemCreates: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
      normalizedInputs.map(
        ({ input, item, excludedIds, resolvedOptions }) => {
          const quantity = input.quantity;
          const baseUnitPrice = item.price;
          const optionsTotal = resolvedOptions.optionsTotal;
          const unitPrice = baseUnitPrice.add(optionsTotal);
          const lineTotal = unitPrice.mul(quantity);

          return {
            businessId: business.id,
            itemId: item.id,
            quantity,
            unitPrice,
            lineTotal,
            itemNameSnapshot: item.name,
            itemTypeSnapshot: item.type,
            inventoryModeSnapshot: item.inventoryMode,
            durationMinutesSnapshot: item.durationMinutes,
            excludedOptionalIngredientIds:
              excludedIds.length > 0 ? excludedIds : Prisma.DbNull,
            baseUnitPriceSnapshot: baseUnitPrice,
            optionsTotalSnapshot: optionsTotal,
            finalUnitPriceSnapshot: unitPrice,
            lineTotalSnapshot: lineTotal,
            options: resolvedOptions.snapshots.length
              ? {
                  create: resolvedOptions.snapshots,
                }
              : undefined,
          };
        },
      );

    const total = orderItemCreates.reduce(
      (acc, item) => acc + Number(item.lineTotal),
      0,
    );

    const order = await this.prisma.order.create({
      data: {
        businessId: business.id,
        status: 'SENT',
        origin: 'PUBLIC_STORE',
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        note: visibleNote,
        sentAt: new Date(),
        total,
        items: {
          create: orderItemCreates,
        },
      },
      select: {
        publicToken: true,
        origin: true,
      },
    });

    console.log(`[PublicService] Created order origin: ${order.origin}`);

    return {
      message: 'Order created',
      orderId: order.publicToken,
    };
  }

  /* =====================================================
     FIND RESERVATION BY ID (página pública de consulta)
  ===================================================== */


  async findReservationById(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        customerName: true,
        customerWhatsapp: true,
        date: true,
        startMinute: true,
        endMinute: true,
        note: true,
        item: {
          select: {
            id: true,
            name: true,
            price: true,
            durationMinutes: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            phoneWhatsapp: true,
          },
        },
      },
    });

    if (!reservation) return null;

    return {
      ...reservation,
      date: reservation.date.toISOString(),
      item: {
        ...reservation.item,
        price: Number(reservation.item.price),
      },
    };
  }

  async cancelReservation(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) return null;

    return this.prisma.reservation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
