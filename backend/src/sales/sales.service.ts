import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ReverseOrderDto } from './dto/reverse-order.dto';
import { UpdateOrderItemOptionalsDto } from './dto/update-order-item-optionals.dto';
import { ItemOptionsService } from '../item-options/item-options.service';
import { SalesOrderLineInputDto } from './dto/order-line-input.dto';
import { TaxService } from '../tax/tax.service';

export type UnifiedSourceType = 'ORDER' | 'RESERVATION';
export type UnifiedStatus = 'PENDIENTE' | 'CERRADO' | 'CANCELADO';

export interface UnifiedSaleDto {
  id: string;
  sourceType: UnifiedSourceType;
  customerName: string | null;
  customerWhatsapp: string | null;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  total: number;
  status: UnifiedStatus;
  inventoryPostedAt?: Date | null;
  accountingPostedAt?: Date | null;
  createdAt: Date;
  scheduledAt?: string;
  origin: 'MANUAL' | 'PUBLIC_STORE';
  type: 'PRODUCTO' | 'SERVICIO';
  hasInvalidOptionSnapshot?: boolean;
  fiscalSummary?: {
    subtotal: number;
    iva: number;
    impoconsumo: number;
    reteFuente: number;
    reteIva: number;
    reteIca: number;
    totalCollected: number;
    totalCharged: number;
    totalWithheld: number;
    netReceived: number;
  } | null;
  taxLines?: any[] | null;
  fiscalContext?: any | null;
  items: Array<{
    orderItemId?: string;
    name: string;
    qty: number;
    unitPrice: number;
    price: number;
    itemId: string;
    itemInventoryMode?: string | null;
    excludedOptionalIngredientIds?: string[];
    options?: Array<{
      groupId?: string | null;
      optionId?: string | null;
      action?: 'SELECT' | 'ADD' | 'REMOVE';
      groupTitle: string;
      optionName: string;
      priceDelta: number;
      quantityPerUnit?: number | null;
      totalQuantity?: number | null;
      unitLabel?: string | null;
    }>;
    recipe?: Array<{
      ingredientId: string;
      isOptional: boolean;
      quantityRequired: number;
      ingredient: {
        id: string;
        name: string;
        consumptionUnit?: string | null;
        customUnitLabel?: string | null;
      };
    }>;
    durationMin?: number | null;
  }>;
}
@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private inventoryService: InventoryService,
    private itemOptionsService: ItemOptionsService,
    private taxService: TaxService,
  ) { }

  private readonly orderItemRecipeInclude = {
    item: {
      include: {
        recipes: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                consumptionUnit: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    },
    options: {
      include: {
        ingredient: {
          select: {
            id: true,
            stockUnitId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  } satisfies Prisma.OrderItemInclude;

  private parseExcludedOptionalIngredientIdsForResponse(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string');
  }

  private normalizeExcludedOptionalIngredientIds(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new BadRequestException('excludedOptionalIngredientIds must be an array');
    }
    if (!value.every((id) => typeof id === 'string')) {
      throw new BadRequestException('excludedOptionalIngredientIds must contain only strings');
    }
    if (new Set(value).size !== value.length) {
      throw new BadRequestException('excludedOptionalIngredientIds contains duplicates');
    }
    return value;
  }

  private mapRecipeForSales(item: any) {
    return (item?.recipes ?? [])
      .filter((recipe: any) => recipe?.ingredient)
      .map((recipe: any) => ({
        ingredientId: recipe.ingredientId,
        isOptional: Boolean(recipe.isOptional),
        quantityRequired: Number(recipe.quantityRequired ?? 0),
        ingredient: {
          id: recipe.ingredient.id,
          name: recipe.ingredient.name ?? 'Insumo no disponible',
          consumptionUnit: recipe.ingredient.consumptionUnit ?? null,
        },
      }));
  }

  private mapOptionsForSales(orderItem: any) {
    return (orderItem?.options ?? []).map((option: any) => ({
      groupId: option.groupId,
      optionId: option.optionId,
      action: option.action,
      groupTitle: option.groupTitleSnapshot,
      optionName: option.optionNameSnapshot,
      priceDelta: Number(option.priceDeltaSnapshot ?? 0),
      quantityPerUnit:
        option.quantityPerUnitSnapshot == null
          ? null
          : Number(option.quantityPerUnitSnapshot),
      totalQuantity:
        option.totalQuantitySnapshot == null
          ? null
          : Number(option.totalQuantitySnapshot),
      unitLabel: option.unitLabelSnapshot ?? null,
    }));
  }

  private mapFiscalContextForSales(order: any) {
    const snapshotBuyerFiscal =
      order.taxSnapshot &&
      typeof order.taxSnapshot.buyerFiscal === 'object' &&
      !Array.isArray(order.taxSnapshot.buyerFiscal)
        ? (order.taxSnapshot.buyerFiscal as Record<string, any>)
        : {};

    if (!order.fiscalContext && Object.keys(snapshotBuyerFiscal).length === 0) {
      return null;
    }

    return {
      buyerType:
        snapshotBuyerFiscal.buyerType ?? order.fiscalContext?.buyerType ?? null,
      buyerName:
        snapshotBuyerFiscal.buyerName ?? order.fiscalContext?.buyerName ?? null,
      buyerDocumentType:
        snapshotBuyerFiscal.buyerDocumentType ??
        order.fiscalContext?.buyerDocumentType ??
        null,
      buyerDocumentNumber:
        snapshotBuyerFiscal.buyerDocumentNumber ??
        order.fiscalContext?.buyerDocumentNumber ??
        null,
      buyerEmail:
        snapshotBuyerFiscal.buyerEmail ?? order.fiscalContext?.buyerEmail ?? null,
      buyerIsIvaResponsable:
        snapshotBuyerFiscal.buyerIsIvaResponsable ??
        order.fiscalContext?.buyerIsIvaResponsable ??
        false,
      buyerIsRetenedor:
        snapshotBuyerFiscal.buyerIsRetenedor ??
        order.fiscalContext?.buyerIsRetenedor ??
        false,
      buyerIsGranContribuyente:
        snapshotBuyerFiscal.buyerIsGranContribuyente ??
        order.fiscalContext?.buyerIsGranContribuyente ??
        false,
      buyerIsAutorretenedor:
        snapshotBuyerFiscal.buyerIsAutorretenedor ??
        order.fiscalContext?.buyerIsAutorretenedor ??
        false,
      buyerIsRegimenSimple:
        snapshotBuyerFiscal.buyerIsRegimenSimple ??
        order.fiscalContext?.buyerIsRegimenSimple ??
        false,
      buyerRequiresElectronicInvoice:
        snapshotBuyerFiscal.buyerRequiresElectronicInvoice ??
        order.fiscalContext?.buyerRequiresElectronicInvoice ??
        false,
      withholdingSubjectIsDeclarante:
        snapshotBuyerFiscal.withholdingSubjectIsDeclarante ?? true,
      fiscalMunicipalityCode:
        snapshotBuyerFiscal.fiscalMunicipalityCode ??
        order.fiscalContext?.fiscalMunicipalityCode ??
        null,
      saleConcept:
        snapshotBuyerFiscal.saleConcept ?? order.fiscalContext?.saleConcept ?? null,
      reteIcaRateOverride:
        snapshotBuyerFiscal.reteIcaRateOverride ??
        snapshotBuyerFiscal.icaRateOverride ??
        order.fiscalContext?.reteIcaRateOverride ??
        null,
      icaRateOverride:
        snapshotBuyerFiscal.icaRateOverride ??
        snapshotBuyerFiscal.reteIcaRateOverride ??
        order.fiscalContext?.reteIcaRateOverride ??
        null,
    };
  }

  private assertBuyerFiscalContextAllowed(buyerFiscalContext: any) {
    if (
      buyerFiscalContext?.buyerType === 'JURIDICA' &&
      buyerFiscalContext?.buyerIsGranContribuyente === true &&
      buyerFiscalContext?.buyerIsAutorretenedor === true
    ) {
      throw new BadRequestException(
        'Gran Contribuyente y Autorretenedor no pueden estar activos al mismo tiempo para el comprador de la venta.',
      );
    }
  }

  private async persistOrderFiscalPreview(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    buyerFiscalContext: any,
    cartItems: Array<{ itemId: string; quantity: number }>,
  ) {
    this.assertBuyerFiscalContextAllowed(buyerFiscalContext);
    if (!buyerFiscalContext || cartItems.length === 0) return;

    const preview = await this.taxService.calculateTaxPreview(businessId, {
      buyerType: buyerFiscalContext.buyerType,
      buyerName: buyerFiscalContext.buyerName,
      buyerDocumentType: buyerFiscalContext.buyerDocumentType,
      buyerDocumentNumber: buyerFiscalContext.buyerDocumentNumber,
      buyerEmail: buyerFiscalContext.buyerEmail,
      buyerIsIvaResponsable: buyerFiscalContext.buyerIsIvaResponsable || false,
      buyerIsRetenedor: buyerFiscalContext.buyerIsRetenedor || false,
      buyerIsGranContribuyente:
        buyerFiscalContext.buyerIsGranContribuyente || false,
      buyerIsAutorretenedor: buyerFiscalContext.buyerIsAutorretenedor || false,
      buyerIsRegimenSimple: buyerFiscalContext.buyerIsRegimenSimple || false,
      buyerRequiresElectronicInvoice:
        buyerFiscalContext.buyerRequiresElectronicInvoice || false,
      fiscalMunicipalityCode: buyerFiscalContext.fiscalMunicipalityCode,
      saleConcept: buyerFiscalContext.saleConcept || 'GOODS',
      reteIcaRateOverride:
        buyerFiscalContext.reteIcaRateOverride ??
        buyerFiscalContext.icaRateOverride,
      cartItems,
    });

    await this.taxService.freezeTaxCalculation(
      tx,
      orderId,
      preview,
      buyerFiscalContext,
    );
  }

  private assertOrderEditable(order: {
    status: OrderStatus;
    inventoryPostedAt?: Date | null;
    accountingPostedAt?: Date | null;
  }) {
    if (order.inventoryPostedAt) {
      throw new ConflictException('Order inventory has already been posted');
    }
    if (order.accountingPostedAt) {
      throw new ConflictException('Order accounting has already been posted');
    }
    const editableStatuses: OrderStatus[] = ['DRAFT', 'SENT'];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException('Order not editable');
    }
  }

  private async resolveOrderLines(
    businessId: string,
    inputs: SalesOrderLineInputDto[],
    options?: { isManual?: boolean },
  ) {
    if (!inputs.length) {
      throw new BadRequestException('Order must contain at least one item');
    }
    if (inputs.some((input) => !Number.isInteger(input.quantity) || input.quantity <= 0)) {
      throw new BadRequestException('Item quantity must be a positive integer');
    }

    const uniqueItemIds = Array.from(new Set(inputs.map((input) => input.itemId)));
    const dbItems = await this.prisma.item.findMany({
      where: {
        businessId,
        id: { in: uniqueItemIds },
        status: 'ACTIVE',
      },
      include: {
        recipes: {
          include: {
            ingredient: { select: { id: true, name: true } },
          },
        },
        optionGroups: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });
    if (dbItems.length !== uniqueItemIds.length) {
      throw new BadRequestException('One or more items are invalid');
    }

    if (!options?.isManual) {
      this.ensureSingleItemType(dbItems);
    }
    const itemById = new Map(dbItems.map((item) => [item.id, item]));
    const resolved = await Promise.all(
      inputs.map(async (input) => {
        const item = itemById.get(input.itemId)!;
        const excludedIds = item.optionGroups.length
          ? []
          : this.normalizeExcludedOptionalIngredientIds(
              input.excludedOptionalIngredientIds,
            );
        if (excludedIds.length) {
          const optionalIds = new Set(
            item.recipes
              .filter((line) => line.isOptional)
              .map((line) => line.ingredientId),
          );
          for (const ingredientId of excludedIds) {
            if (!optionalIds.has(ingredientId)) {
              throw new BadRequestException(
                'excludedOptionalIngredientIds contains an ingredient outside the optional recipe',
              );
            }
          }
        }

        const resolvedOptions =
          await this.itemOptionsService.resolveSelectionsForOrderLine(
            businessId,
            item.id,
            input.quantity,
            input.optionSelections ?? [],
          );
        const baseUnitPrice = item.price;
        const optionsTotal = resolvedOptions.optionsTotal;
        const unitPrice = baseUnitPrice.add(optionsTotal);
        const lineTotal = unitPrice.mul(input.quantity);

        const data: Prisma.OrderItemUncheckedCreateWithoutOrderInput = {
          businessId,
          itemId: item.id,
          quantity: input.quantity,
          unitPrice,
          lineTotal,
          itemNameSnapshot: item.name,
          itemTypeSnapshot: item.type,
          inventoryModeSnapshot: item.inventoryMode,
          durationMinutesSnapshot: item.durationMinutes,
          excludedOptionalIngredientIds:
            excludedIds.length > 0 ? excludedIds : Prisma.JsonNull,
          baseUnitPriceSnapshot: baseUnitPrice,
          optionsTotalSnapshot: optionsTotal,
          finalUnitPriceSnapshot: unitPrice,
          lineTotalSnapshot: lineTotal,
          options: resolvedOptions.snapshots.length
            ? { create: resolvedOptions.snapshots }
            : undefined,
        };
        return { item, data, resolvedOptions };
      }),
    );

    const lines = resolved.map(({ data }) => data);
    const requirements =
      await this.inventoryService.expandOrderItemsToIngredients(
        this.prisma,
        businessId,
        lines.map((line, index) => ({
          id: `pending-line-${index}`,
          itemId: line.itemId,
          quantity: line.quantity ?? 1,
          itemNameSnapshot: line.itemNameSnapshot,
          itemTypeSnapshot: line.itemTypeSnapshot,
          inventoryModeSnapshot: line.inventoryModeSnapshot,
          excludedOptionalIngredientIds: line.excludedOptionalIngredientIds,
          options: resolved[index].resolvedOptions.snapshots,
        })) as any,
        { sourceType: 'ORDER_EDIT', orderOrigin: 'MANUAL' },
      );
    await this.inventoryService.validateStockAvailability(
      businessId,
      requirements,
      this.prisma,
    );

    return {
      itemType: resolved[0].item.type,
      lines,
      total: resolved.reduce((sum, { data }) => sum + Number(data.lineTotal), 0),
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
      )
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

  private formatDateOnly(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(minutes: number) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  private parseScheduledAt(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
      (value ?? '').trim(),
    );
    if (!match) {
      throw new BadRequestException('Invalid scheduledAt');
    }

    const dateOnly = new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        0,
        0,
        0,
        0,
      )
    );
    const startMinute = Number(match[4]) * 60 + Number(match[5]);

    return { dateOnly, startMinute };
  }

  private async getReservationAvailabilitySlots(
    businessId: string,
    itemId: string,
    date: Date,
    durationMinutes: number,
    excludeReservationId?: string,
  ) {
    const weekdayMap: Record<number, Weekday> = {
      0: 'SUN',
      1: 'MON',
      2: 'TUE',
      3: 'WED',
      4: 'THU',
      5: 'FRI',
      6: 'SAT',
    };
    // Use getUTCDay() — dates are stored/compared as UTC midnight.
    // getDay() would shift the weekday by the server's local TZ offset.
    const weekday = weekdayMap[date.getUTCDay()];

    const [windows, blocks, reservations] = await Promise.all([
      this.prisma.serviceScheduleWindow.findMany({
        where: {
          businessId,
          weekday,
          OR: [{ itemId }, { itemId: null }],
        },
        orderBy: { startMinute: 'asc' },
      }),
      this.prisma.serviceScheduleBlock.findMany({
        where: {
          businessId,
          date,
          OR: [{ itemId }, { itemId: null }],
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          businessId,
          itemId,
          date,
          status: { not: 'CANCELLED' },
          ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        },
        select: { startMinute: true, endMinute: true },
      }),
    ]);

    const slots: string[] = [];
    // Fixed 60-minute step: we evaluate every full hour within the window.
    // Using durationMinutes as the step would skip slots (e.g. with a 2-hour
    // service and a 14:00–17:00 block, cursor would jump 840→960→1080 and
    // only 14:00 would be emitted instead of also evaluating 15:00).
    const step = 60;

    for (const window of windows) {
      // Align cursor to the next exact hour boundary so slots are always HH:00.
      let cursor = window.startMinute;
      if (cursor % 60 !== 0) {
        cursor = cursor + (60 - (cursor % 60));
      }

      while (cursor + durationMinutes <= window.endMinute) {
        const start = cursor;
        const end = cursor + durationMinutes;

        const blocked = blocks.some((block) => {
          if (block.startMinute === null || block.endMinute === null) {
            return true;
          }
          return start < block.endMinute && end > block.startMinute;
        });

        const overlapping = reservations.some(
          (res) => Math.max(start, res.startMinute) < Math.min(end, res.endMinute),
        );

        if (!blocked && !overlapping) {
          slots.push(this.formatTime(start));
        }

        cursor += step;
      }
    }

    return slots;
  }

  private async assertReservationSlotAvailable(
    businessId: string,
    itemId: string,
    date: Date,
    startMinute: number,
    endMinute: number,
    excludeReservationId?: string,
  ) {
    if (startMinute < 0 || endMinute > 24 * 60 || startMinute >= endMinute) {
      throw new BadRequestException('Invalid time range');
    }

    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        businessId,
        itemId,
        date,
        status: { not: 'CANCELLED' },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        AND: [
          { startMinute: { lt: endMinute } },
          { endMinute: { gt: startMinute } },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('Time slot already booked');
    }
  }

  async create(businessId: string, dto: CreateOrderDto) {
    this.assertBuyerFiscalContextAllowed(dto.buyerFiscalContext);

    if (!dto.items.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const uniqueItemIds = Array.from(
      new Set(dto.items.map((item) => item.itemId)),
    );
    const itemsFromDb = await this.prisma.item.findMany({
      where: {
        id: { in: uniqueItemIds },
        businessId,
        status: 'ACTIVE',
      },
    });

    if (itemsFromDb.length !== uniqueItemIds.length) {
      throw new BadRequestException('One or more items are invalid');
    }

    const isManual = (dto.origin ?? 'MANUAL') !== 'PUBLIC_STORE';
    const itemType = isManual ? null : this.ensureSingleItemType(itemsFromDb);
    const manualScheduledServiceItem =
      isManual &&
      dto.items.length === 1 &&
      itemsFromDb.length === 1 &&
      itemsFromDb[0].type === 'SERVICE' &&
      Boolean(dto.scheduledAt)
        ? itemsFromDb[0]
        : null;

    if (manualScheduledServiceItem && dto.scheduledAt) {
      await this.validateMirrorReservationAvailability({
        businessId,
        itemId: manualScheduledServiceItem.id,
        scheduledAt: dto.scheduledAt,
        durationMinutes:
          manualScheduledServiceItem.durationMinutes ?? dto.durationMinutes ?? 60,
      });
    }

    // BIFURCACIÓN SEGÚN TIPO
    if (!isManual && itemType === 'SERVICE') {
      if (dto.items.length !== 1) {
        throw new BadRequestException('Services with appointment must be registered separately');
      }

      const item = itemsFromDb[0];
      if (item.type !== 'SERVICE') {
        throw new BadRequestException('Selected item is not a service');
      }
      if (!dto.scheduledAt) {
        throw new BadRequestException('scheduledAt is required for service sales');
      }

      const { dateOnly, startMinute } = this.parseScheduledAt(dto.scheduledAt);
      const duration = item.durationMinutes ?? dto.durationMinutes ?? 60;
      const endMinute = startMinute + duration;

      await this.assertReservationSlotAvailable(
        businessId,
        item.id,
        dateOnly,
        startMinute,
        endMinute,
      );

      const reservation = await this.prisma.reservation.create({
        data: {
          businessId,
          itemId: item.id,
          customerName: dto.customerName?.trim() || null,
          customerWhatsapp: dto.customerWhatsapp?.trim() || null,
          date: dateOnly,
          startMinute,
          endMinute,
          status: 'PENDING',
          origin: dto.origin ?? 'MANUAL',
          paymentMethod: (dto.paymentMethod ?? 'CASH') as any,
        },
        include: { item: true },
      });

      // Mapear a un formato que el frontend entienda como una "venta" recién creada
      return {
        id: reservation.id,
        sourceType: 'RESERVATION' as const,
        customerName: reservation.customerName,
        customerWhatsapp: reservation.customerWhatsapp,
        paymentMethod: (reservation.paymentMethod ?? 'CASH') as 'CASH' | 'BANK_TRANSFER',
        total: Number(reservation.item.price),
        status: this.mapReservationStatus(reservation.status),
        createdAt: reservation.createdAt,
        origin: reservation.origin as 'MANUAL' | 'PUBLIC_STORE',
        scheduledAt: this.toScheduledAt(reservation.date, reservation.startMinute),
        type: 'SERVICIO' as const,
        items: [
          {
            name: reservation.item.name,
            qty: 1,
            unitPrice: Number(reservation.item.price),
            price: Number(reservation.item.price),
            itemId: reservation.itemId,
            durationMin: reservation.item.durationMinutes ?? null,
          },
        ],
      };
    }

    // LÓGICA PARA PRODUCTO (ORDER)
    const { lines: orderItemsData, total } = await this.resolveOrderLines(
      businessId,
      dto.items,
      { isManual },
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
      data: {
        businessId,
        customerName: dto.origin === 'PUBLIC_STORE'
          ? (dto.customerName?.trim() || null)
          : (dto.customerName?.trim() || 'Consumidor final'),
        customerWhatsapp: dto.customerWhatsapp?.trim() || null,
        note: dto.note,
        paymentMethod: (dto.paymentMethod ?? 'CASH') as any,
        origin: dto.origin ?? 'MANUAL',
        total,
        status: 'SENT', // Estado inicial para órdenes manuales
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: {
          include: this.orderItemRecipeInclude,
        },
      },
    });

      if (manualScheduledServiceItem && dto.scheduledAt) {
        const mirror = this.buildMirrorReservationData({
          businessId,
          orderId: createdOrder.id,
          itemId: manualScheduledServiceItem.id,
          customerName: createdOrder.customerName,
          customerWhatsapp: createdOrder.customerWhatsapp,
          paymentMethod: createdOrder.paymentMethod as any,
          scheduledAt: dto.scheduledAt,
          durationMinutes:
            manualScheduledServiceItem.durationMinutes ?? dto.durationMinutes ?? 60,
        });

        await tx.reservation.create({
          data: mirror.create,
        });
      }

      if (dto.buyerFiscalContext) {
        await this.persistOrderFiscalPreview(
          tx,
          businessId,
          createdOrder.id,
          dto.buyerFiscalContext,
          createdOrder.items.map((item) => ({
            itemId: item.itemId,
            quantity: Number(item.quantity),
          })),
        );
      }

      return createdOrder;
    });

    console.log(`[SalesService] Created order origin: ${order.origin}`);

    return {
      ...order,
      sourceType: 'ORDER',
    };
  }

  async findAll(businessId: string, options?: { includeArchived?: boolean }): Promise<UnifiedSaleDto[]> {
    const includeArchived = options?.includeArchived ?? false;
    const [orders, reservations] = await Promise.all([
      this.prisma.order.findMany({
        where: { 
          businessId,
          ...(includeArchived ? {} : { archived: false }),
          status: { not: 'CANCELLED' }
        },
        include: {
          items: {
            include: this.orderItemRecipeInclude,
          },
          fiscalContext: true,
          taxLines: true,
          taxSnapshot: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.reservation.findMany({
        where: { 
          businessId,
          ...(includeArchived ? {} : { archived: false }),
          status: { not: 'CANCELLED' }
        },
        include: {
          item: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const conversions = await this.prisma.unitConversion.findMany();
    const orderIds = new Set(orders.map((order) => order.id));
    const mirrorReservations = await this.findMirrorReservationsForOrders(
      orders
        .filter(
          (order) =>
            order.origin === 'MANUAL' &&
            order.items.length === 1 &&
            order.items[0]?.itemTypeSnapshot === 'SERVICE',
        )
        .map((order) => order.id),
    );

    console.log(`[SalesService] findAll found ${orders.length} orders and ${reservations.length} reservations`);
    if (orders.length > 0) console.log(`[SalesService] sample order[0] origin: ${orders[0].origin}`);
    if (reservations.length > 0) console.log(`[SalesService] sample reservation[0] origin: ${reservations[0].origin}`);

    const mappedOrders: UnifiedSaleDto[] = orders.map((o) => {
      const fiscalSummary = o.fiscalContext
        ? {
            subtotal: Number(o.fiscalContext.subtotal),
            iva: Number(
              o.taxLines.find(
                (line) => line.taxType === 'IVA' && line.applied,
              )?.taxAmount ?? 0,
            ),
            impoconsumo: Number(
              o.taxLines.find(
                (line) => line.taxType === 'IMPOCONSUMO' && line.applied,
              )?.taxAmount ?? 0,
            ),
            reteFuente: Number(
              o.taxLines.find(
                (line) => line.taxType === 'RETEFUENTE' && line.applied,
              )?.taxAmount ?? 0,
            ),
            reteIva: Number(
              o.taxLines.find(
                (line) => line.taxType === 'RETEIVA' && line.applied,
              )?.taxAmount ?? 0,
            ),
            reteIca: Number(
              o.taxLines.find(
                (line) => line.taxType === 'RETEICA' && line.applied,
              )?.taxAmount ?? 0,
            ),
            totalCollected:
              Number(o.fiscalContext.subtotal) +
              Number(o.fiscalContext.chargedTaxTotal),
            totalCharged: Number(o.fiscalContext.chargedTaxTotal),
            totalWithheld: Number(o.fiscalContext.withheldTaxTotal),
            netReceived: Number(o.fiscalContext.netReceived),
          }
        : null;

      const mirrorReservation = mirrorReservations.get(o.id);

      return {
      id: o.id,
      sourceType: 'ORDER',
      customerName: o.customerName,
      customerWhatsapp: o.customerWhatsapp,
      paymentMethod: ((o as any).paymentMethod ?? 'CASH') as 'CASH' | 'BANK_TRANSFER',
      total: Number(o.total),
      status: this.mapOrderStatus(o.status),
      inventoryPostedAt: o.inventoryPostedAt,
      accountingPostedAt: o.accountingPostedAt,
      createdAt: o.createdAt,
      origin: o.origin as 'MANUAL' | 'PUBLIC_STORE',
      scheduledAt: mirrorReservation
        ? this.toScheduledAt(mirrorReservation.date, mirrorReservation.startMinute)
        : undefined,
      type: o.items[0]?.itemTypeSnapshot === 'SERVICE' ? 'SERVICIO' : 'PRODUCTO',
      hasInvalidOptionSnapshot: this.checkInvalidOptionSnapshot(o, conversions),
      fiscalSummary,
      fiscalContext: this.mapFiscalContextForSales(o),
      taxLines: o.taxLines ? o.taxLines.map((line) => ({
        taxType: line.taxType,
        direction: line.direction,
        baseAmount: Number(line.baseAmount),
        rate: Number(line.rate),
        taxAmount: Number(line.taxAmount),
        accountCode: line.accountCode,
        applied: line.applied,
        reason: line.reason,
      })) : null,
      items: o.items.map((it) => ({
        orderItemId: it.id,
        name: it.itemNameSnapshot,
        qty: it.quantity,
        unitPrice: Number(it.unitPrice),
        price: Number(it.lineTotal),
        itemId: it.itemId,
        itemInventoryMode: it.inventoryModeSnapshot ?? it.item?.inventoryMode ?? null,
        excludedOptionalIngredientIds: this.parseExcludedOptionalIngredientIdsForResponse(
          it.excludedOptionalIngredientIds,
        ),
        options: this.mapOptionsForSales(it),
        recipe: this.mapRecipeForSales(it.item),
        durationMin: it.durationMinutesSnapshot ?? null,
      })),
    };
    });

    const mappedReservations: UnifiedSaleDto[] = reservations
      .filter((r) => !orderIds.has(r.id))
      .map((r) => {
      const item = (r as any).item;
      const price = Number(item?.price ?? 0);

      return {
        id: r.id,
        sourceType: 'RESERVATION',
        customerName: r.customerName ?? null,
        customerWhatsapp: r.customerWhatsapp ?? null,
        paymentMethod: (r.paymentMethod ?? 'CASH') as 'CASH' | 'BANK_TRANSFER',
        total: Number.isFinite(price) ? price : 0,
        status: this.mapReservationStatus(r.status),
        inventoryPostedAt: r.inventoryPostedAt ?? null,
        accountingPostedAt: r.status === 'CONFIRMED' ? (r.updatedAt ?? null) : null,
        createdAt: r.createdAt,
        origin: (r.origin ?? 'MANUAL') as 'MANUAL' | 'PUBLIC_STORE',
        scheduledAt: this.toScheduledAt(r.date, r.startMinute),
        type: 'SERVICIO',
        items: [
          {
            name: item?.name ?? 'Servicio no disponible',
            qty: 1,
            unitPrice: Number.isFinite(price) ? price : 0,
            price: Number.isFinite(price) ? price : 0,
            itemId: r.itemId,
            durationMin: item?.durationMinutes ?? null,
          },
        ],
      };
    });

    return [...mappedOrders, ...mappedReservations].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  private checkInvalidOptionSnapshot(order: any, conversions: any[]): boolean {
    if (order.origin !== 'PUBLIC_STORE') return false;
    const isPending = order.status === 'DRAFT' || order.status === 'SENT';
    if (!isPending) return false;

    for (const item of order.items ?? []) {
      for (const option of item.options ?? []) {
        if (option.targetTypeSnapshot === 'INGREDIENT' && option.ingredientId) {
          const ingredient = option.ingredient;
          if (!ingredient || !ingredient.stockUnitId) {
            return true;
          }
          const unitId = option.unitIdSnapshot;
          if (!unitId) {
            return true;
          }
          if (unitId === ingredient.stockUnitId) {
            continue;
          }
          const direct = conversions.some(
            (c) => c.fromUnitId === unitId && c.toUnitId === ingredient.stockUnitId,
          );
          const reverse = conversions.some(
            (c) => c.fromUnitId === ingredient.stockUnitId && c.toUnitId === unitId,
          );
          if (!direct && !reverse) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private toScheduledAt(date: Date, startMinute: number) {
    return `${this.formatDateOnly(date)}T${this.formatTime(startMinute)}:00`;
  }

  private getMirrorReservationIdForManualServiceOrder(orderId: string) {
    // Manual service sales are persisted as Order for fiscal/accounting flows.
    // Their appointment slot is mirrored in Reservation using the same id so
    // existing availability queries can block the slot without a schema change.
    return orderId;
  }

  private async findMirrorReservationsForOrders(orderIds: string[]) {
    if (orderIds.length === 0) return new Map<string, any>();
    const reservations = await this.prisma.reservation.findMany({
      where: {
        id: { in: orderIds },
        status: { not: 'CANCELLED' },
      },
    });
    return new Map(reservations.map((reservation) => [reservation.id, reservation]));
  }

  private buildMirrorReservationData(input: {
    businessId: string;
    orderId: string;
    itemId: string;
    customerName?: string | null;
    customerWhatsapp?: string | null;
    paymentMethod?: 'CASH' | 'BANK_TRANSFER' | null;
    scheduledAt: string;
    durationMinutes: number;
  }) {
    const { dateOnly, startMinute } = this.parseScheduledAt(input.scheduledAt);
    const endMinute = startMinute + input.durationMinutes;
    const reservationId = this.getMirrorReservationIdForManualServiceOrder(
      input.orderId,
    );

    return {
      reservationId,
      dateOnly,
      startMinute,
      endMinute,
      create: {
        id: reservationId,
        businessId: input.businessId,
        itemId: input.itemId,
        customerName: input.customerName?.trim() || null,
        customerWhatsapp: input.customerWhatsapp?.trim() || null,
        date: dateOnly,
        startMinute,
        endMinute,
        status: 'PENDING' as const,
        origin: 'MANUAL' as const,
        paymentMethod: input.paymentMethod ?? 'CASH',
      },
      update: {
        itemId: input.itemId,
        customerName: input.customerName?.trim() || null,
        customerWhatsapp: input.customerWhatsapp?.trim() || null,
        paymentMethod: input.paymentMethod ?? 'CASH',
        date: dateOnly,
        startMinute,
        endMinute,
        status: 'PENDING' as const,
        origin: 'MANUAL' as const,
      },
    };
  }

  private async validateMirrorReservationAvailability(input: {
    businessId: string;
    itemId: string;
    scheduledAt: string;
    durationMinutes: number;
    excludeReservationId?: string;
  }) {
    const { dateOnly, startMinute } = this.parseScheduledAt(input.scheduledAt);
    await this.assertReservationSlotAvailable(
      input.businessId,
      input.itemId,
      dateOnly,
      startMinute,
      startMinute + input.durationMinutes,
      input.excludeReservationId,
    );
  }

  private mapOrderStatus(status: string): UnifiedStatus {
    if (status === 'COMPLETED') return 'CERRADO';
    if (status === 'CANCELLED') return 'CANCELADO';
    return 'PENDIENTE';
  }

  private mapReservationStatus(status: string): UnifiedStatus {
    if (status === 'CONFIRMED') return 'CERRADO';
    if (status === 'CANCELLED') return 'CANCELADO';
    return 'PENDIENTE';
  }

  async confirmOrder(
    businessId: string,
    id: string,
    buyerFiscalContext?: any,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    if (typeof buyerFiscalContext === 'string') {
      sourceType = buyerFiscalContext as UnifiedSourceType;
      buyerFiscalContext = undefined;
    }
    this.assertBuyerFiscalContextAllowed(buyerFiscalContext);

    if (sourceType === 'RESERVATION') {
      return this.confirmReservation(businessId, id, buyerFiscalContext);
    }

    return this.prisma.$transaction(async (tx) => {
      // ... (KEEP EXISTING Order logic but use id instead of orderId)
      const order = await tx.order.findFirst({
        where: { id, businessId },
        include: {
          items: { include: { item: true, options: true } },
          taxSnapshot: true,
        },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (!order.items.length)
        throw new BadRequestException('Order must contain at least one item');
      if (order.status === 'CANCELLED')
        throw new BadRequestException('Cancelled orders cannot be confirmed');
      if (order.accountingPostedAt && order.inventoryPostedAt)
        return {
          order,
          accountingCreated: false,
          inventoryCreated: false,
          alreadyPosted: true,
        };

      const confirmableStatuses: OrderStatus[] = ['DRAFT', 'SENT', 'COMPLETED'];
      if (!confirmableStatuses.includes(order.status))
        throw new BadRequestException('Order cannot be confirmed');

      const postingDate = new Date();
      if (!order.accountingPostedAt) {
        const claim = await tx.order.updateMany({
          where: {
            id,
            businessId,
            accountingPostedAt: null,
            status: { in: confirmableStatuses },
          },
          data: {
            status: 'COMPLETED',
            accountingPostedAt: postingDate,
          },
        });

        if (claim.count === 0) {
          const currentOrder = await tx.order.findFirst({
            where: { id, businessId },
            include: { items: { include: { item: true, options: true } } },
          });
          if (!currentOrder) throw new NotFoundException('Order not found');
          return {
            order: currentOrder,
            accountingCreated: false,
            inventoryCreated: Boolean(currentOrder.inventoryPostedAt),
            alreadyPosted: Boolean(
              currentOrder.accountingPostedAt && currentOrder.inventoryPostedAt,
            ),
          };
        }
      } else if (order.status !== 'COMPLETED') {
        await tx.order.update({
          where: { id },
          data: { status: 'COMPLETED' },
        });
      }

      const persistedBuyerFiscal =
        order.taxSnapshot &&
        typeof order.taxSnapshot.buyerFiscal === 'object' &&
        !Array.isArray(order.taxSnapshot.buyerFiscal)
          ? (order.taxSnapshot.buyerFiscal as Record<string, any>)
          : null;
      const fiscalContextToUse = buyerFiscalContext ?? persistedBuyerFiscal;

      if (fiscalContextToUse) {
        const cartItems = order.items.map((it) => ({
          itemId: it.itemId,
          quantity: Number(it.quantity),
        }));

        const preview = await this.taxService.calculateTaxPreview(businessId, {
          buyerType: fiscalContextToUse.buyerType,
          buyerName: fiscalContextToUse.buyerName,
          buyerDocumentType: fiscalContextToUse.buyerDocumentType,
          buyerDocumentNumber: fiscalContextToUse.buyerDocumentNumber,
          buyerEmail: fiscalContextToUse.buyerEmail,
          buyerIsIvaResponsable: fiscalContextToUse.buyerIsIvaResponsable || false,
          buyerIsRetenedor: fiscalContextToUse.buyerIsRetenedor || false,
          buyerIsGranContribuyente: fiscalContextToUse.buyerIsGranContribuyente || false,
          buyerIsAutorretenedor: fiscalContextToUse.buyerIsAutorretenedor || false,
          buyerIsRegimenSimple: fiscalContextToUse.buyerIsRegimenSimple || false,
          buyerRequiresElectronicInvoice:
            fiscalContextToUse.buyerRequiresElectronicInvoice || false,
          fiscalMunicipalityCode: fiscalContextToUse.fiscalMunicipalityCode,
          saleConcept: fiscalContextToUse.saleConcept || 'GOODS',
          reteIcaRateOverride:
            fiscalContextToUse.reteIcaRateOverride ??
            fiscalContextToUse.icaRateOverride,
          cartItems,
        });

        await this.taxService.freezeTaxCalculation(tx, id, preview, fiscalContextToUse);
      }

      if (
        order.origin === 'MANUAL' &&
        order.items.length === 1 &&
        order.items[0]?.itemTypeSnapshot === 'SERVICE'
      ) {
        await tx.reservation.updateMany({
          where: {
            id: this.getMirrorReservationIdForManualServiceOrder(id),
            businessId,
            status: { not: 'CANCELLED' },
          },
          data: { status: 'CONFIRMED' },
        });
      }

      const finalizedOrder = {
        ...order,
        status: 'COMPLETED' as const,
        accountingPostedAt: order.accountingPostedAt ?? postingDate,
        updatedAt: postingDate,
      };

      const inventoryMovements = order.inventoryPostedAt
        ? []
        : await this.inventoryService.applyInventoryConsumptionForOrder(
            tx,
            businessId,
            finalizedOrder as any,
            postingDate,
            { sourceType },
          );

      const movements = order.accountingPostedAt
        ? []
        : await this.accountingService.postOrderMovements(
            tx,
            businessId,
            finalizedOrder as any,
          );

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { item: true, options: true } } },
      });

      return {
        order: updatedOrder,
        accountingCreated: !order.accountingPostedAt,
        inventoryCreated: !order.inventoryPostedAt,
        alreadyPosted: false,
        inventoryMovements,
        movements,
      };
    }, {
      timeout: 20000, // P2028 fix: accounting + inventory posting needs extra time
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private async confirmReservation(businessId: string, id: string, buyerFiscalContext?: any) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.reservation.findFirst({
        where: { id, businessId },
        include: { item: true },
      });

      if (!res) throw new NotFoundException('Reservation not found');
      if (res.status === 'CANCELLED')
        throw new BadRequestException('Cancelled reservations cannot be confirmed');

      const existingMovements = await tx.accountingMovement.findMany({
        where: {
          businessId,
          originType: 'ORDER',
          originId: id,
        },
      });

      const updated =
        res.status === 'CONFIRMED'
          ? res
          : await tx.reservation.update({
              where: { id },
              data: { status: 'CONFIRMED' },
              include: { item: true },
            });

      console.log(`[SalesService] confirmReservation res origin: ${res.origin}`);

      if (buyerFiscalContext) {
        this.assertBuyerFiscalContextAllowed(buyerFiscalContext);
        const cartItems = [
          {
            itemId: res.itemId,
            quantity: 1,
          },
        ];

        const preview = await this.taxService.calculateTaxPreview(businessId, {
          buyerType: buyerFiscalContext.buyerType,
          buyerName: buyerFiscalContext.buyerName,
          buyerDocumentType: buyerFiscalContext.buyerDocumentType,
          buyerDocumentNumber: buyerFiscalContext.buyerDocumentNumber,
          buyerEmail: buyerFiscalContext.buyerEmail,
          buyerIsIvaResponsable: buyerFiscalContext.buyerIsIvaResponsable || false,
          buyerIsRetenedor: buyerFiscalContext.buyerIsRetenedor || false,
          buyerIsGranContribuyente: buyerFiscalContext.buyerIsGranContribuyente || false,
          buyerIsAutorretenedor: buyerFiscalContext.buyerIsAutorretenedor || false,
          buyerIsRegimenSimple: buyerFiscalContext.buyerIsRegimenSimple || false,
          buyerRequiresElectronicInvoice:
            buyerFiscalContext.buyerRequiresElectronicInvoice || false,
          fiscalMunicipalityCode: buyerFiscalContext.fiscalMunicipalityCode,
          saleConcept: buyerFiscalContext.saleConcept || 'SERVICES',
          reteIcaRateOverride:
            buyerFiscalContext.reteIcaRateOverride ??
            buyerFiscalContext.icaRateOverride,
          cartItems,
        });

        // Omitir congelamiento fiscal en reservas por ahora
        // await this.taxService.freezeTaxCalculation(tx, id, preview, buyerFiscalContext);
      }

      const virtualOrder = this.mapReservationToVirtualOrder(updated);
      const inventoryMovements = res.inventoryPostedAt
        ? []
        : await this.inventoryService.applyInventoryConsumptionForReservation(
            tx,
            businessId,
            updated,
          );

      const shouldPostAccounting = existingMovements.length === 0;
      const movements = shouldPostAccounting
        ? await this.accountingService.postOrderMovements(
            tx,
            businessId,
            virtualOrder as any,
          )
        : existingMovements;

      return {
        order: virtualOrder, // Frontend expects something that looks like an order/sale
        accountingCreated: shouldPostAccounting,
        alreadyPosted: !shouldPostAccounting && res.inventoryPostedAt != null,
        movements,
        inventoryMovements,
        isReservation: true,
      };
    }, {
      timeout: 20000, // P2028 fix: accounting posting for reservation confirmation needs extra time
    });
  }

  async getReservationAvailability(
    businessId: string,
    reservationId: string,
    query: { month?: string; date?: string },
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, businessId },
      include: { item: true },
    });

    const legacyOrder = reservation
      ? null
      : await this.prisma.order.findFirst({
          where: { id: reservationId, businessId, origin: 'MANUAL' },
          include: {
            items: {
              include: { item: true },
            },
          },
        });
    const legacyServiceLine =
      legacyOrder?.items.length === 1 &&
      legacyOrder.items[0]?.itemTypeSnapshot === 'SERVICE'
        ? legacyOrder.items[0]
        : null;

    if (!reservation && !legacyServiceLine) {
      throw new NotFoundException('Reservation not found');
    }

    const itemId = reservation?.itemId ?? legacyServiceLine!.itemId;
    const duration =
      reservation?.item.durationMinutes ??
      legacyServiceLine?.durationMinutesSnapshot ??
      Math.max(1, (reservation?.endMinute ?? 60) - (reservation?.startMinute ?? 0));
    const excludeReservationId = reservation?.id ?? reservationId;

    if (query.date) {
      const dateOnly = this.parseDateOnly(query.date);
      return this.getReservationAvailabilitySlots(
        businessId,
        itemId,
        dateOnly,
        duration,
        excludeReservationId,
      );
    }

    if (!query.month) {
      throw new BadRequestException('month or date is required');
    }

    const { year, monthIndex } = this.parseMonth(query.month);
    const firstDay = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
    
    const nowInBusiness = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const today = new Date(
      Date.UTC(
        nowInBusiness.getFullYear(),
        nowInBusiness.getMonth(),
        nowInBusiness.getDate(),
        0,
        0,
        0,
        0,
      )
    );

    const cursor = new Date(firstDay);
    const availableDates: string[] = [];

    while (cursor <= lastDay) {
      if (
        cursor >= today ||
        (reservation &&
          this.formatDateOnly(cursor) === this.formatDateOnly(reservation.date))
      ) {
        const slots = await this.getReservationAvailabilitySlots(
          businessId,
          itemId,
          new Date(cursor),
          duration,
          excludeReservationId,
        );

        if (slots.length > 0) {
          availableDates.push(this.formatDateOnly(cursor));
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return availableDates;
  }

  private mapReservationToVirtualOrder(res: any) {
    if (!res?.item) {
      throw new BadRequestException('Reservation service is not available');
    }

    // Falls back to current item price if no snapshot (as per user request)
    const price = res.item.price ?? 0;

    return {
      id: res.id,
      businessId: res.businessId,
      status: 'COMPLETED', // compatible with Accounting logic
      customerName: res.customerName,
      customerWhatsapp: res.customerWhatsapp,
      paymentMethod: res.paymentMethod ?? 'CASH',
      total: price,
      updatedAt: res.updatedAt,
      createdAt: res.createdAt,
      origin: res.origin,
      items: [
        {
          id: `virtual-oi-${res.id}`,
          itemId: res.itemId,
          quantity: 1,
          itemNameSnapshot: res.item.name,
          itemTypeSnapshot: 'SERVICE',
          durationMinutesSnapshot: res.item.durationMinutes,
          unitPrice: price,
          price: price,
          item: res.item,
        },
      ],
    };
  }

  async getOrderOrThrow(businessId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: {
          include: this.orderItemRecipeInclude,
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return order;
  }

  async updateOrderItemOptionalIngredients(
    businessId: string,
    orderId: string,
    orderItemId: string,
    dto: UpdateOrderItemOptionalsDto,
  ) {
    const excludedIds = this.normalizeExcludedOptionalIngredientIds(
      dto.excludedOptionalIngredientIds,
    );

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: {
          where: { id: orderItemId },
          include: this.orderItemRecipeInclude,
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    this.assertOrderEditable(order);

    const orderItem = order.items[0];
    if (!orderItem) throw new NotFoundException('OrderItem not found');

    const inventoryMode =
      orderItem.inventoryModeSnapshot ?? orderItem.item?.inventoryMode ?? null;
    if (inventoryMode !== 'RECIPE_BASED') {
      throw new BadRequestException(
        'Optional ingredients can only be edited for recipe-based items',
      );
    }

    const recipe = orderItem.item?.recipes ?? [];
    const optionalIds = new Set(
      recipe
        .filter((line: any) => line.isOptional)
        .map((line: any) => line.ingredientId),
    );
    const mandatoryIds = new Set(
      recipe
        .filter((line: any) => !line.isOptional)
        .map((line: any) => line.ingredientId),
    );

    for (const ingredientId of excludedIds) {
      if (mandatoryIds.has(ingredientId)) {
        throw new BadRequestException('Mandatory ingredients cannot be excluded');
      }
      if (!optionalIds.has(ingredientId)) {
        throw new BadRequestException(
          'excludedOptionalIngredientIds contains an ingredient outside the optional recipe',
        );
      }
    }

    const updated = await this.prisma.orderItem.update({
      where: { id: orderItem.id },
      data: {
        excludedOptionalIngredientIds:
          excludedIds.length > 0 ? excludedIds : Prisma.JsonNull,
      },
      include: this.orderItemRecipeInclude,
    });

    return {
      id: updated.id,
      itemId: updated.itemId,
      excludedOptionalIngredientIds: this.parseExcludedOptionalIngredientIdsForResponse(
        updated.excludedOptionalIngredientIds,
      ),
      recipe: this.mapRecipeForSales(updated.item),
    };
  }

  async addItem(businessId: string, orderId: string, dto: AddOrderItemDto) {
    const order = await this.getOrderOrThrow(businessId, orderId);
    this.assertOrderEditable(order);
    const resolved = await this.resolveOrderLines(businessId, [dto], { isManual: order.origin === 'MANUAL' });
    const item = await this.prisma.item.findFirstOrThrow({
      where: { id: dto.itemId, businessId },
    });

    if (order.origin !== 'MANUAL' && order.items.length > 0) {
      const existingType = this.ensureSingleItemType(order.items);
      if (item.type !== existingType) {
        throw new BadRequestException(
          `Order already contains ${existingType.toLowerCase()}s and cannot mix item types`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.orderItem.create({
        data: {
          ...resolved.lines[0],
          orderId: order.id,
        },
        include: this.orderItemRecipeInclude,
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
    this.assertOrderEditable(order);

    const oi = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId, businessId },
    });

    if (!oi) throw new NotFoundException('OrderItem not found');

    const resolved = await this.resolveOrderLines(
      businessId,
      [
        {
          itemId: dto.itemId ?? oi.itemId,
          quantity: dto.quantity,
          optionSelections: dto.optionSelections,
          excludedOptionalIngredientIds: dto.excludedOptionalIngredientIds,
        },
      ],
      { isManual: order.origin === 'MANUAL' },
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: oi.id } });
      const updated = await tx.orderItem.create({
        data: {
          ...resolved.lines[0],
          id: oi.id,
          orderId,
        },
        include: this.orderItemRecipeInclude,
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
    this.assertOrderEditable(order);

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
      include: {
        items: {
          include: this.orderItemRecipeInclude,
        },
        fiscalContext: true,
        taxLines: true,
        taxSnapshot: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const conversions = await this.prisma.unitConversion.findMany();
    const mirrorReservations = await this.findMirrorReservationsForOrders(
      order.origin === 'MANUAL' &&
        order.items.length === 1 &&
        order.items[0]?.itemTypeSnapshot === 'SERVICE'
        ? [order.id]
        : [],
    );
    const mirrorReservation = mirrorReservations.get(order.id);

    const fiscalSummary = order.fiscalContext
      ? {
          subtotal: Number(order.fiscalContext.subtotal),
          iva: Number(
            order.taxLines.find(
              (line) => line.taxType === 'IVA' && line.applied,
            )?.taxAmount ?? 0,
          ),
          impoconsumo: Number(
            order.taxLines.find(
              (line) => line.taxType === 'IMPOCONSUMO' && line.applied,
            )?.taxAmount ?? 0,
          ),
          reteFuente: Number(
            order.taxLines.find(
              (line) => line.taxType === 'RETEFUENTE' && line.applied,
            )?.taxAmount ?? 0,
          ),
          reteIva: Number(
            order.taxLines.find(
              (line) => line.taxType === 'RETEIVA' && line.applied,
            )?.taxAmount ?? 0,
          ),
          reteIca: Number(
            order.taxLines.find(
              (line) => line.taxType === 'RETEICA' && line.applied,
            )?.taxAmount ?? 0,
          ),
          totalCollected:
            Number(order.fiscalContext.subtotal) +
            Number(order.fiscalContext.chargedTaxTotal),
          totalCharged: Number(order.fiscalContext.chargedTaxTotal),
          totalWithheld: Number(order.fiscalContext.withheldTaxTotal),
          netReceived: Number(order.fiscalContext.netReceived),
        }
      : null;

    return {
      ...order,
      scheduledAt: mirrorReservation
        ? this.toScheduledAt(mirrorReservation.date, mirrorReservation.startMinute)
        : undefined,
      fiscalSummary,
      fiscalContext: this.mapFiscalContextForSales(order),
      taxLines: order.taxLines ? order.taxLines.map((line) => ({
        taxType: line.taxType,
        direction: line.direction,
        baseAmount: Number(line.baseAmount),
        rate: Number(line.rate),
        taxAmount: Number(line.taxAmount),
        accountCode: line.accountCode,
        applied: line.applied,
        reason: line.reason,
      })) : null,
      hasInvalidOptionSnapshot: this.checkInvalidOptionSnapshot(order, conversions),
    };
  }

  async cancel(
    businessId: string,
    id: string,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    if (sourceType === 'RESERVATION') {
      return this.prisma.$transaction(async (tx) => {
        const res = await tx.reservation.findFirst({
          where: { id, businessId },
          include: { item: true },
        });
        if (!res) throw new NotFoundException('Reservation not found');

        if (res.inventoryPostedAt) {
          await this.inventoryService.reverseInventoryConsumptionForReservation(tx, businessId, res.id);
        }

        return tx.reservation.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: { item: true },
        });
      });
    }

    const order = await this.prisma.order.findFirst({
      where: { id, businessId },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Completed orders cannot be cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelledOrder = await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      await tx.reservation.updateMany({
        where: {
          id: this.getMirrorReservationIdForManualServiceOrder(id),
          businessId,
        },
        data: { status: 'CANCELLED' },
      });

      return cancelledOrder;
    });
  }

  async reverseConfirmedOrder(businessId: string, id: string, dto: ReverseOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, businessId },
        include: {
          items: { include: { item: true } },
        },
      });

      if (!order) throw new NotFoundException('Order not found');

      const existingReturn = await tx.inventoryMovement.findMany({
        where: {
          businessId,
          orderId: id,
          type: 'SALE_RETURN',
        },
        take: 1,
        select: { id: true },
      });

      if (existingReturn.length) {
        throw new ConflictException('Order inventory already reversed');
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestException('Cancelled orders cannot be reversed');
      }
      if (order.status !== 'COMPLETED') {
        throw new BadRequestException('Only completed orders can be reversed');
      }
      if (!order.inventoryPostedAt) {
        throw new BadRequestException('Order inventory was not posted');
      }

      const reversalMovements =
        await this.inventoryService.reverseInventoryConsumptionForOrder(
          tx,
          businessId,
          { orderId: id, reason: dto.reason },
        );

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
        },
        include: {
          items: { include: { item: true } },
        },
      });

      return {
        order: updatedOrder,
        inventoryReversed: reversalMovements.length > 0,
        reversalMovements,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async remove(
    businessId: string,
    id: string,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    if (sourceType === 'RESERVATION') {
      const res = await this.prisma.reservation.findFirst({
        where: { id, businessId },
      });
      if (!res) throw new NotFoundException('Reservation not found');

      return this.prisma.reservation.update({
        where: { id },
        data: { archived: true },
        include: { item: true },
      });
    }

    const order = await this.prisma.order.findFirst({
      where: { id, businessId },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'COMPLETED' && order.inventoryPostedAt) {
      throw new BadRequestException(
        'No se puede eliminar una venta confirmada con inventario impactado. Primero debe revertirse.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const archivedOrder = await tx.order.update({
        where: { id },
        data: { archived: true },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      await tx.reservation.updateMany({
        where: {
          id: this.getMirrorReservationIdForManualServiceOrder(id),
          businessId,
        },
        data: { status: 'CANCELLED' },
      });

      return archivedOrder;
    });
  }

  async update(
    businessId: string,
    orderId: string,
    dto: UpdateOrderDto,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    this.assertBuyerFiscalContextAllowed(dto.buyerFiscalContext);

    if (sourceType === 'RESERVATION') {
      return this.updateReservation(businessId, orderId, dto);
    }

    const order = await this.getOrderOrThrow(businessId, orderId);
    this.assertOrderEditable(order);
    const resolvedItems = dto.items
      ? await this.resolveOrderLines(businessId, dto.items)
      : null;
    const finalLines = resolvedItems?.lines ?? order.items;
    const finalSingleManualService =
      order.origin === 'MANUAL' &&
      finalLines.length === 1 &&
      finalLines[0]?.itemTypeSnapshot === 'SERVICE';
    const finalServiceItemId = finalSingleManualService
      ? finalLines[0].itemId
      : null;
    const finalServiceDuration = finalSingleManualService
      ? Number(finalLines[0].durationMinutesSnapshot ?? 60)
      : 60;

    if (finalSingleManualService && finalServiceItemId && dto.scheduledAt) {
      await this.validateMirrorReservationAvailability({
        businessId,
        itemId: finalServiceItemId,
        scheduledAt: dto.scheduledAt,
        durationMinutes: finalServiceDuration,
        excludeReservationId: this.getMirrorReservationIdForManualServiceOrder(orderId),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          customerName: order.origin === 'PUBLIC_STORE'
            ? (dto.customerName !== undefined ? (dto.customerName?.trim() || null) : undefined)
            : (dto.customerName !== undefined ? (dto.customerName?.trim() || 'Consumidor final') : undefined),
          customerWhatsapp: dto.customerWhatsapp,
          note: dto.note,
          paymentMethod: dto.paymentMethod as any,
        } as any,
      });

      // 2. Handle Items Sync if provided
      if (resolvedItems) {
        await tx.orderItem.deleteMany({
          where: { orderId },
        });

        for (const line of resolvedItems.lines) {
          await tx.orderItem.create({
            data: {
              ...line,
              orderId,
            },
          });
        }

        await tx.order.update({
          where: { id: orderId },
          data: { total: resolvedItems.total },
        });
      }

      if (finalSingleManualService && finalServiceItemId && dto.scheduledAt) {
        const mirror = this.buildMirrorReservationData({
          businessId,
          orderId,
          itemId: finalServiceItemId,
          customerName:
            dto.customerName !== undefined
              ? dto.customerName
              : order.customerName,
          customerWhatsapp:
            dto.customerWhatsapp !== undefined
              ? dto.customerWhatsapp
              : order.customerWhatsapp,
          paymentMethod: (dto.paymentMethod ?? order.paymentMethod) as any,
          scheduledAt: dto.scheduledAt,
          durationMinutes: finalServiceDuration,
        });

        await tx.reservation.upsert({
          where: { id: mirror.reservationId },
          create: mirror.create,
          update: mirror.update,
        });
      } else if (order.origin === 'MANUAL' && resolvedItems && !finalSingleManualService) {
        await tx.reservation.updateMany({
          where: {
            id: this.getMirrorReservationIdForManualServiceOrder(orderId),
            businessId,
          },
          data: { status: 'CANCELLED' },
        });
      }

      if (dto.buyerFiscalContext) {
        const currentItems = resolvedItems
          ? resolvedItems.lines.map((line) => ({
              itemId: line.itemId,
              quantity: Number(line.quantity),
            }))
          : order.items.map((item) => ({
              itemId: item.itemId,
              quantity: Number(item.quantity),
            }));

        await this.persistOrderFiscalPreview(
          tx,
          businessId,
          orderId,
          dto.buyerFiscalContext,
          currentItems,
        );
      }

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          items: {
            include: this.orderItemRecipeInclude,
          },
          fiscalContext: true,
          taxLines: true,
          taxSnapshot: true,
        },
      });
    });
  }

  private async updateReservation(
    businessId: string,
    id: string,
    dto: UpdateOrderDto,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, businessId },
      include: { item: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException('Reservation not editable in current status');
    }

    const data: any = {
      customerName: dto.customerName,
      customerWhatsapp: dto.customerWhatsapp,
      note: dto.note,
      paymentMethod: dto.paymentMethod,
    };

    if (dto.scheduledAt) {
      const { dateOnly, startMinute } = this.parseScheduledAt(dto.scheduledAt);
      const duration =
        reservation.item.durationMinutes ??
        Math.max(1, reservation.endMinute - reservation.startMinute);
      const endMinute = startMinute + duration;
      const availableSlots = await this.getReservationAvailabilitySlots(
        businessId,
        reservation.itemId,
        dateOnly,
        duration,
        reservation.id,
      );

      if (!availableSlots.includes(this.formatTime(startMinute))) {
        throw new BadRequestException('Selected time is outside service availability');
      }

      data.date = dateOnly;
      data.startMinute = startMinute;
      data.endMinute = endMinute;
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data,
      include: { item: true },
    });

    return {
      id: updated.id,
      sourceType: 'RESERVATION' as const,
      customerName: updated.customerName,
      customerWhatsapp: updated.customerWhatsapp,
      paymentMethod: updated.paymentMethod as 'CASH' | 'BANK_TRANSFER',
      total: Number(updated.item.price),
      status: this.mapReservationStatus(updated.status),
      createdAt: updated.createdAt,
      scheduledAt: this.toScheduledAt(updated.date, updated.startMinute),
      type: 'SERVICIO' as const,
      items: [
        {
          name: updated.item.name,
          qty: 1,
          price: Number(updated.item.price),
          itemId: updated.itemId,
          durationMin: updated.item.durationMinutes ?? null,
        },
      ],
    };
  }

  private ensureSingleItemType(
    items: Array<{ type?: 'PRODUCT' | 'SERVICE'; itemTypeSnapshot?: 'PRODUCT' | 'SERVICE' }>,
  ) {
    const types = new Set(
      items.map((i) => i.type ?? i.itemTypeSnapshot).filter(Boolean),
    );

    if (types.size === 0) {
      throw new BadRequestException('Order must contain at least one item type');
    }

    if (types.size > 1) {
      throw new BadRequestException('Order cannot mix products and services');
    }

    return Array.from(types)[0] as 'PRODUCT' | 'SERVICE';
  }
}
