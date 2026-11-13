import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  AvailabilityService,
  formatDateKey,
  RESERVATION_ERRORS,
  toBookingConflict,
} from '../availability/availability.service';
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
import { FeatureFlagsService } from '../common/config/feature-flags';
import { SimpleRegimeNotAvailableException } from '../common/exceptions/simple-regime-not-available.exception';
import { FiscalDocumentService } from '../fiscal-documents/fiscal-document.service';
import { requiresLegacyInvoiceWarning } from '../fiscal-documents/invoice-close-snapshot';
import { lockOwnedOrder } from './order-lock';
import { reservationArchiveBlock, actionPolicy, orderTransitionBlock, reverseBlock, completionBlock, reservationTransitionBlock, lifecycleConflict, requireServiceProvided, cancellationReason, throwLifecycleError, emptyEvidence, CommercialEvidence, isPolicyV2, isFreeV2, newReservationPolicy, v2CompletedEvidenceBlock, noShowBlock, hasCommercialEffects, NO_SHOW_REASON, MIRROR_DETACHED_REASON } from '../reservations/reservation-lifecycle';

export type UnifiedSourceType = 'ORDER' | 'RESERVATION';
const SCHEDULED_SERVICE_ALONE =
  'Un servicio con turno debe registrarse solo, en una venta separada. Quitá los demás ítems o registralos en otra venta.';

export type UnifiedStatus = 'PENDIENTE' | 'CERRADO' | 'CANCELADO' | 'CONFIRMADO' | 'FINALIZADA';

export interface UnifiedSaleDto {
  id: string;
  sourceType: UnifiedSourceType;
  customerName: string | null;
  customerWhatsapp: string | null;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  total: number;
  status: UnifiedStatus;
  allowedActions?: import('../reservations/reservation-lifecycle').SaleAction[];
  blockedActions?: Partial<Record<import('../reservations/reservation-lifecycle').SaleAction, import('../reservations/reservation-lifecycle').ActionBlock>>;
  reservationStatus?: string | null;
  confirmedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  // Bloque 2.2: fixed lifecycle contract of the service booking (1 historical, 2 new).
  commercialPolicyVersion?: number | null;
  // Policy 2 standalone: price agreed at booking.
  priceSnapshot?: number | null;
  // True only for a realized sale (income posted). A policy 2 CONFIRMED booking is not a sale.
  countsAsSale?: boolean;
  inventoryPostedAt?: Date | null;
  accountingPostedAt?: Date | null;
  requiresLegacyInvoiceWarning?: boolean;
  createdAt: Date;
  scheduledAt?: string;
  // Standalone reservations only: lets the business share a link that can cancel.
  reservationPublicToken?: string | null;
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
    @Optional()
    private fiscalDocuments?: FiscalDocumentService,
    @Optional()
    private featureFlags: FeatureFlagsService = {
      simpleRegimeSalesEnabled: true,
      simpleRegimeTaxModuleEnabled: false,
      simpleRegimeEnabled: true,
    } as FeatureFlagsService,
    @Optional()
    private availability: AvailabilityService = new AvailabilityService(prisma),
  ) {}

  private async loadCommercialEvidence(db: any, businessId: string, ids: string[]) {
    const result = new Map<string, CommercialEvidence>(ids.map(id => [id, emptyEvidence()]));
    if (!ids.length) return result;
    const [accounting, inventory, fiscal] = await Promise.all([
      db.accountingMovement.findMany({ where: { businessId, originType: 'ORDER', originId: { in: ids } } }),
      db.inventoryMovement.findMany({ where: { businessId, OR: [{ orderId: { in: ids } }, { reservationId: { in: ids } }], type: { in: ['SALE', 'SALE_RETURN'] } } }),
      db.fiscalDocument?.findMany ? db.fiscalDocument.findMany({ where: { businessId, orderId: { in: ids } } }) : [],
    ]);
    for (const row of accounting) result.get(row.originId)?.accounting.push(row);
    for (const row of inventory) result.get(row.orderId ?? row.reservationId)?.inventory.push(row);
    for (const row of fiscal) result.get(row.orderId)?.fiscal.push(row);
    return result;
  }

  private lifecycleView(sourceType: UnifiedSourceType, record: any, reservation: any, evidence: CommercialEvidence) {
    return {
      ...actionPolicy(sourceType, record, reservation, evidence),
      reservationStatus: reservation?.status ?? null,
      confirmedAt: reservation?.confirmedAt ?? null,
      completedAt: reservation?.completedAt ?? null,
      cancelledAt: reservation?.cancelledAt ?? null,
      cancelReason: reservation?.cancelReason ?? null,
      commercialPolicyVersion: reservation?.commercialPolicyVersion ?? null,
    };
  }

  /** Realized sale = income posted. Historical (policy 1) bookings keep their old meaning. */
  private countsAsSale(sourceType: UnifiedSourceType, record: any) {
    if (sourceType === 'ORDER') return record.status === 'COMPLETED';
    if (!isPolicyV2(record)) return record.status === 'CONFIRMED' || record.status === 'COMPLETED';
    return record.status === 'COMPLETED' && !isFreeV2(record);
  }

  private static readonly ACCEPTED_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER'];

  /** Maps the inventory stock rejection to a stable code; every other error passes through. */
  private stockConflict(error: any): never {
    const message = String(error?.response?.message ?? error?.message ?? '');
    if (error instanceof BadRequestException && message.startsWith('Insufficient stock'))
      lifecycleConflict({ code: 'INSUFFICIENT_STOCK_FOR_COMPLETION', message: `No hay stock suficiente para finalizar la atención (${message.replace('Insufficient stock for ingredient ', '')}). Regularizá el inventario e intentá nuevamente.` });
    throw error;
  }

  /**
   * Policy 2 completion: the business declares the service was provided and the commercial
   * effects (recipe in force, agreed price, stored payment method) are posted exactly once,
   * atomically. Lock order: Order -> Reservation -> existing commercial locks.
   */
  private async completeReservationV2(businessId: string, id: string) {
    // Same gate the legacy confirmation applied before any commercial closing.
    await this.assertSimpleRegimeAvailableForNewSale(businessId);
    return this.runSerializableTransaction(async tx => {
      await lockOwnedOrder(tx, businessId, id);
      const business = await tx.business.findFirst({ where: { id: businessId, status: 'ACTIVE' }, select: { id: true } });
      if (!business) throw new ForbiddenException({ code: 'BUSINESS_INACTIVE', message: 'El negocio no está activo.' });
      const order = await tx.order.findFirst({ where: { id, businessId } });
      const reservation = await this.availability.lockReservationRow(tx, businessId, id);
      if (!reservation) throw new NotFoundException({ code: 'RESERVATION_NOT_FOUND', message: 'Reserva no encontrada' });
      if (!isPolicyV2(reservation)) lifecycleConflict({ code: 'RESERVATION_CONCURRENT_MODIFICATION', message: 'El registro cambió durante la operación. Actualizá e intentá nuevamente.' });
      if (reservation.archived || order?.archived) lifecycleConflict({ code: 'RECORD_ARCHIVED', message: 'El registro está eliminado.' });
      const evidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
      if (reservation.status === 'COMPLETED') {
        const reason = v2CompletedEvidenceBlock(reservation, order, evidence);
        if (reason) lifecycleConflict(reason);
        return { ...reservation, ...this.lifecycleView(order ? 'ORDER' : 'RESERVATION', order ?? reservation, reservation, evidence), alreadyCompleted: true };
      }
      const reason = completionBlock(reservation, order, evidence);
      if (reason) lifecycleConflict(reason);
      const paymentMethod = order?.paymentMethod ?? reservation.paymentMethod;
      // No silent fallback: the stored method selects Caja or Banco.
      if (!SalesService.ACCEPTED_PAYMENT_METHODS.includes(paymentMethod))
        lifecycleConflict({ code: 'INVALID_PAYMENT_METHOD', message: 'El método de pago registrado no es válido. Corregilo desde «Editar» antes de finalizar.' });
      const completedAt = new Date();
      if (order) {
        if (!new Prisma.Decimal(order.total).gt(0))
          lifecycleConflict({ code: 'ZERO_AMOUNT_NOT_POSTABLE', message: 'Una venta vinculada de importe cero no se puede registrar comercialmente.' });
        await this.postOrderCommercialEffects(tx, businessId, id, undefined, 'ORDER').catch(e => this.stockConflict(e));
      } else {
        if (reservation.priceSnapshot == null)
          lifecycleConflict({ code: 'COMMERCIAL_EVIDENCE_INCONSISTENT', message: 'La reserva no tiene el precio pactado registrado.' });
        const withItem = await tx.reservation.findUniqueOrThrow({ where: { id }, include: { item: true } });
        const virtualOrder = { ...this.mapReservationToVirtualOrder(withItem), accountingPostedAt: completedAt };
        await this.inventoryService.applyInventoryConsumptionForReservation(tx, businessId, withItem, completedAt).catch(e => this.stockConflict(e));
        if (isFreeV2(reservation)) {
          // Free service: real consumption cost only; never fabricated income.
          await this.accountingService.postInventoryCostMovements(tx, businessId, virtualOrder, completedAt);
        } else {
          await this.accountingService.postOrderMovements(tx, businessId, virtualOrder as any);
        }
      }
      const updated = await tx.reservation.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt, ...(order ? {} : { accountingPostedAt: completedAt }) },
      });
      const finalOrder = order ? await tx.order.findFirst({ where: { id, businessId } }) : null;
      const finalEvidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
      return { ...updated, ...this.lifecycleView(order ? 'ORDER' : 'RESERVATION', finalOrder ?? updated, updated, finalEvidence), alreadyCompleted: false };
    }).catch(throwLifecycleError);
  }

  /** Policy 2: the customer did not attend. Cancels (Order too, for mirrors) without effects. */
  async markNoShow(businessId: string, id: string, confirmed: unknown) {
    if (confirmed !== true)
      throw new BadRequestException({ code: 'NO_SHOW_CONFIRMATION_REQUIRED', message: 'Confirmá explícitamente que el cliente no asistió.' });
    return this.prisma.$transaction(async tx => {
      await lockOwnedOrder(tx, businessId, id);
      const order = await tx.order.findFirst({ where: { id, businessId } });
      const reservation = await this.availability.lockReservationRow(tx, businessId, id);
      if (!reservation) throw new NotFoundException({ code: 'RESERVATION_NOT_FOUND', message: 'Reserva no encontrada' });
      if (reservation.status === 'CANCELLED' && reservation.cancelReason === NO_SHOW_REASON) return reservation;
      const evidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
      const reason = noShowBlock(reservation, order, evidence);
      if (reason) lifecycleConflict(reason);
      const cancelledAt = new Date();
      if (order) await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
      return tx.reservation.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt, cancelReason: NO_SHOW_REASON } });
    }, { timeout: 20000 }).catch(throwLifecycleError);
  }

  async completeReservation(businessId: string, id: string, serviceProvided: unknown) {
    requireServiceProvided(serviceProvided);
    // The policy version never changes after creation; it is re-checked under lock anyway.
    const policy = await this.prisma.reservation.findFirst({ where: { id, businessId }, select: { commercialPolicyVersion: true } });
    if (policy?.commercialPolicyVersion === 2) return this.completeReservationV2(businessId, id);
    return this.prisma.$transaction(async tx => {
      // Always Order -> Reservation, also when the id has no order. Never reverse this order.
      await lockOwnedOrder(tx, businessId, id);
      const business = await tx.business.findFirst({ where: { id: businessId, status: 'ACTIVE' }, select: { id: true } });
      if (!business) throw new ForbiddenException({ code: 'BUSINESS_INACTIVE', message: 'El negocio no está activo.' });
      const order = await tx.order.findFirst({ where: { id, businessId } });
      const reservation = await this.availability.lockReservationRow(tx, businessId, id);
      if (!reservation) throw new NotFoundException({ code: 'RESERVATION_NOT_FOUND', message: 'Reserva no encontrada' });
      if (reservation.archived || order?.archived) lifecycleConflict({ code: 'RECORD_ARCHIVED', message: 'El registro está eliminado.' });
      if (reservation.status === 'COMPLETED') {
        const evidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
        const reason = completionBlock({ ...reservation, status: 'CONFIRMED' }, order, evidence);
        if (reason) lifecycleConflict(reason);
        return { ...reservation, ...this.lifecycleView(order ? 'ORDER' : 'RESERVATION', order ?? reservation, reservation, evidence), alreadyCompleted: true };
      }
      const evidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
      const reason = completionBlock(reservation, order, evidence);
      if (reason) lifecycleConflict(reason);
      const updated = await tx.reservation.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      return { ...updated, ...this.lifecycleView(order ? 'ORDER' : 'RESERVATION', order ?? updated, updated, evidence), alreadyCompleted: false };
    }, { timeout: 20000 }).catch(throwLifecycleError);
  }

  async generateElectronicInvoice(businessId: string, orderId: string) {
    if (!this.fiscalDocuments)
      throw new BadRequestException('Servicio fiscal no disponible');
    return this.fiscalDocuments.generateInvoiceForSale(businessId, orderId);
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          timeout: 20000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' &&
              String((error.meta as { code?: unknown } | undefined)?.code) ===
                '40001'));
        if (!retryable || attempt === maxAttempts) throw error;
      }
    }
    throw new ConflictException('Could not serialize sale confirmation');
  }

  private async assertSimpleRegimeAvailableForNewSale(
    businessId: string,
    buyerFiscalContext?: { buyerIsRegimenSimple?: boolean } | null,
  ) {
    if (this.featureFlags.simpleRegimeSalesEnabled) return;
    if (buyerFiscalContext?.buyerIsRegimenSimple === true) {
      throw new SimpleRegimeNotAvailableException();
    }

    const profile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      include: { responsibilities: { include: { responsibility: true } } },
    });
    if (
      profile?.responsibilities.some(
        (item) => item.responsibility.code === '47',
      )
    ) {
      throw new SimpleRegimeNotAvailableException();
    }
  }

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

  private parseExcludedOptionalIngredientIdsForResponse(
    value: unknown,
  ): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string');
  }

  private normalizeExcludedOptionalIngredientIds(value: unknown): string[] {
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
    if (new Set(value).size !== value.length) {
      throw new BadRequestException(
        'excludedOptionalIngredientIds contains duplicates',
      );
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
        snapshotBuyerFiscal.buyerEmail ??
        order.fiscalContext?.buyerEmail ??
        null,
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
        snapshotBuyerFiscal.saleConcept ??
        order.fiscalContext?.saleConcept ??
        null,
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

  private async persistOrderFiscalPreview(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    buyerFiscalContext: any,
    persistedOrderItems?: Array<{
      id: string;
      itemId: string;
      quantity: number;
      unitPrice: Prisma.Decimal | number;
    }>,
    onStage?: (
      stage: 'fiscal-context' | 'tax-lines' | 'snapshot',
      durationMs: number,
    ) => void,
  ) {
    this.assertBuyerFiscalContextAllowed(buyerFiscalContext);
    if (!buyerFiscalContext) return;

    const orderItems =
      persistedOrderItems ??
      (await tx.orderItem.findMany({
        where: { orderId },
        select: { id: true, itemId: true, quantity: true, unitPrice: true },
      }));
    if (!orderItems.length) return;

    const preview = await this.calculateOrderTaxPreview(
      businessId,
      buyerFiscalContext,
      orderItems.map((item) => ({
        orderItemId: item.id,
        itemId: item.itemId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      tx,
    );

    await this.taxService.freezeTaxCalculation(
      tx,
      orderId,
      preview,
      buyerFiscalContext,
      onStage,
    );
  }

  private async calculateOrderTaxPreview(
    businessId: string,
    buyerFiscalContext: any,
    cartItems: Array<{
      orderItemId?: string;
      itemId: string;
      quantity: number;
      unitPrice?: number;
    }>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.taxService.calculateTaxPreview(
      businessId,
      {
        buyerType: buyerFiscalContext.buyerType,
        buyerName: buyerFiscalContext.buyerName,
        buyerDocumentType: buyerFiscalContext.buyerDocumentType,
        buyerDocumentNumber: buyerFiscalContext.buyerDocumentNumber,
        buyerEmail: buyerFiscalContext.buyerEmail,
        buyerIsIvaResponsable:
          buyerFiscalContext.buyerIsIvaResponsable || false,
        buyerIsRetenedor: buyerFiscalContext.buyerIsRetenedor || false,
        buyerIsGranContribuyente:
          buyerFiscalContext.buyerIsGranContribuyente || false,
        buyerIsAutorretenedor:
          buyerFiscalContext.buyerIsAutorretenedor || false,
        buyerIsRegimenSimple: buyerFiscalContext.buyerIsRegimenSimple || false,
        buyerRequiresElectronicInvoice:
          buyerFiscalContext.buyerRequiresElectronicInvoice || false,
        fiscalMunicipalityCode: buyerFiscalContext.fiscalMunicipalityCode,
        saleConcept: buyerFiscalContext.saleConcept || 'GOODS',
        reteIcaRateOverride:
          buyerFiscalContext.reteIcaRateOverride ??
          buyerFiscalContext.icaRateOverride,
        cartItems,
      },
      tx,
    );
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

  private sumAppliedTaxAmount(taxLines: any[], taxType: string) {
    return taxLines
      .filter((line) => line.taxType === taxType && line.applied)
      .reduce((total, line) => total + Number(line.taxAmount), 0);
  }

  private assertOrderEditable(order: {
    status: OrderStatus;
    inventoryPostedAt?: Date | null;
    accountingPostedAt?: Date | null;
  }) {
    const restriction = orderTransitionBlock(order, 'edit');
    if (restriction) lifecycleConflict(restriction);
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

  private async assertEditableInTransaction(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
  ) {
    await lockOwnedOrder(tx, businessId, orderId);
    const current = await tx.order.findFirst({
      where: { id: orderId, businessId },
      select: {
        status: true,
        accountingPostedAt: true,
        inventoryPostedAt: true,
      },
    });
    if (!current) throw new NotFoundException('Order not found');
    this.assertOrderEditable(current);
  }

  private async resolveOrderLines(
    businessId: string,
    inputs: SalesOrderLineInputDto[],
    options?: { isManual?: boolean },
  ) {
    if (!inputs.length) {
      throw new BadRequestException('Order must contain at least one item');
    }
    if (
      inputs.some(
        (input) => !Number.isInteger(input.quantity) || input.quantity <= 0,
      )
    ) {
      throw new BadRequestException('Item quantity must be a positive integer');
    }

    const uniqueItemIds = Array.from(
      new Set(inputs.map((input) => input.itemId)),
    );
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
        const item = itemById.get(input.itemId);
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
        let unitPrice: Prisma.Decimal;

        if (
          options?.isManual &&
          input.unitPrice !== undefined &&
          input.unitPrice !== null
        ) {
          const parsedUnitPrice = new Prisma.Decimal(input.unitPrice);
          if (parsedUnitPrice.isNaN() || !parsedUnitPrice.isFinite()) {
            throw new BadRequestException('Invalid unitPrice');
          }
          if (parsedUnitPrice.isNegative()) {
            throw new BadRequestException('unitPrice cannot be negative');
          }
          unitPrice = parsedUnitPrice.toDecimalPlaces(2);
        } else {
          unitPrice = baseUnitPrice.add(optionsTotal);
        }

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
      total: resolved.reduce(
        (sum, { data }) => sum + Number(data.lineTotal),
        0,
      ),
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
      ),
    );
    const startMinute = Number(match[4]) * 60 + Number(match[5]);

    return { dateOnly, startMinute };
  }

  async create(businessId: string, dto: CreateOrderDto) {
    const createStartedAt = Date.now();
    const logTiming = (stage: string, startedAt: number, orderId?: string) => {
      console.log('[SalesService] sales.create.timing', {
        stage: `sales.create.${stage}`,
        durationMs: Date.now() - startedAt,
        elapsedMs: Date.now() - createStartedAt,
        ...(orderId ? { orderId } : {}),
      });
    };
    await this.assertSimpleRegimeAvailableForNewSale(
      businessId,
      dto.buyerFiscalContext,
    );
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
    // Only a lone service line gets a mirror reservation; never drop a requested slot silently.
    if (isManual && dto.scheduledAt && !manualScheduledServiceItem) {
      throw new BadRequestException(SCHEDULED_SERVICE_ALONE);
    }

    // Scheduled-service validation runs inside the write transaction (reserveSlot).
    // BIFURCACIÓN SEGÚN TIPO
    if (!isManual && itemType === 'SERVICE') {
      if (dto.items.length !== 1) {
        throw new BadRequestException(
          'Services with appointment must be registered separately',
        );
      }

      const item = itemsFromDb[0];
      if (item.type !== 'SERVICE') {
        throw new BadRequestException('Selected item is not a service');
      }
      if (!dto.scheduledAt) {
        throw new BadRequestException(
          'scheduledAt is required for service sales',
        );
      }

      const { dateOnly, startMinute } = this.parseScheduledAt(dto.scheduledAt);

      const reservation = await this.prisma
        .$transaction(async (tx) => {
          const slot = await this.availability.reserveSlot(tx, {
            businessId,
            itemId: item.id,
            date: dateOnly,
            startMinute,
          });
          return tx.reservation.create({
            data: {
              businessId,
              itemId: slot.itemId,
              customerName: dto.customerName?.trim() || null,
              customerWhatsapp: dto.customerWhatsapp?.trim() || null,
              date: slot.date,
              startMinute: slot.startMinute,
              endMinute: slot.endMinute,
              ...(await newReservationPolicy(tx, businessId, slot.itemId)),
              origin: dto.origin ?? 'MANUAL',
              paymentMethod: (dto.paymentMethod ?? 'CASH') as any,
            },
            include: { item: true },
          });
        })
        .catch((error) => {
          throw toBookingConflict(error);
        });

      // Mapear a un formato que el frontend entienda como una "venta" recién creada
      return {
        id: reservation.id,
        sourceType: 'RESERVATION' as const,
        customerName: reservation.customerName,
        customerWhatsapp: reservation.customerWhatsapp,
        paymentMethod: (reservation.paymentMethod ?? 'CASH') as
          | 'CASH'
          | 'BANK_TRANSFER',
        total: Number(reservation.priceSnapshot ?? reservation.item.price),
        status: this.mapReservationStatus(reservation.status),
        commercialPolicyVersion: reservation.commercialPolicyVersion,
        countsAsSale: this.countsAsSale('RESERVATION', reservation),
        createdAt: reservation.createdAt,
        origin: reservation.origin as 'MANUAL' | 'PUBLIC_STORE',
        scheduledAt: this.toScheduledAt(
          reservation.date,
          reservation.startMinute,
        ),
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
    const resolveLinesStartedAt = Date.now();
    const { lines: orderItemsData, total } = await this.resolveOrderLines(
      businessId,
      dto.items,
      { isManual },
    );
    logTiming('resolve-lines', resolveLinesStartedAt);
    const transactionStartedAt = Date.now();
    // Lets the client know a scheduled-service sale is a policy 2 booking (no early close).
    let mirrorPolicyVersion: number | null = null;
    const order = await this.prisma
      .$transaction(
        async (tx) => {
          logTiming('tx.start', Date.now());
          const orderWriteStartedAt = Date.now();
          const createdOrder = await tx.order.create({
            data: {
              businessId,
              customerName:
                dto.origin === 'PUBLIC_STORE'
                  ? dto.customerName?.trim() || null
                  : dto.customerName?.trim() || 'Consumidor final',
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
          logTiming('tx.order', orderWriteStartedAt, createdOrder.id);

          if (manualScheduledServiceItem && dto.scheduledAt) {
            const { dateOnly, startMinute } = this.parseScheduledAt(
              dto.scheduledAt,
            );
            // Locks the agenda; a conflict rolls back the whole order (no orphan orders).
            const slot = await this.availability.reserveSlot(tx, {
              businessId,
              itemId: manualScheduledServiceItem.id,
              date: dateOnly,
              startMinute,
            });
            const mirror = this.buildMirrorReservationData({
              businessId,
              orderId: createdOrder.id,
              itemId: manualScheduledServiceItem.id,
              customerName: createdOrder.customerName,
              customerWhatsapp: createdOrder.customerWhatsapp,
              paymentMethod: createdOrder.paymentMethod as any,
              scheduledAt: dto.scheduledAt,
              durationMinutes: slot.durationMinutes,
            });

            const mirrorPolicy = await newReservationPolicy(tx, businessId, null);
            mirrorPolicyVersion = mirrorPolicy.commercialPolicyVersion;
            await tx.reservation.create({
              data: {
                ...mirror.create,
                ...mirrorPolicy,
              },
            });
          }

          if (dto.buyerFiscalContext) {
            await this.persistOrderFiscalPreview(
              tx,
              businessId,
              createdOrder.id,
              dto.buyerFiscalContext,
              createdOrder.items,
              (stage, durationMs) =>
                console.log('[SalesService] sales.create.timing', {
                  stage: `sales.create.tx.${stage}`,
                  durationMs,
                  elapsedMs: Date.now() - createStartedAt,
                  orderId: createdOrder.id,
                }),
            );
          }

          return createdOrder;
        },
        { maxWait: 5000, timeout: 15000 },
      )
      .catch((error) => {
        throw toBookingConflict(error);
      });
    logTiming('tx.commit', transactionStartedAt, order.id);
    logTiming('total', createStartedAt, order.id);

    console.log(`[SalesService] Created order origin: ${order.origin}`);

    return {
      ...order,
      sourceType: 'ORDER',
      commercialPolicyVersion: mirrorPolicyVersion,
    };
  }

  async findAll(
    businessId: string,
    options?: { includeArchived?: boolean; includeCancelled?: boolean },
  ): Promise<UnifiedSaleDto[]> {
    const includeArchived = options?.includeArchived ?? false;
    const includeCancelled = options?.includeCancelled ?? false;
    const [orders, reservations] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          businessId,
          ...(includeArchived ? {} : { archived: false }),
          ...(includeCancelled ? {} : { status: { not: 'CANCELLED' } }),
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
          ...(includeCancelled ? {} : { status: { not: 'CANCELLED' } }),
        },
        include: {
          item: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);
    const evidenceById = await this.loadCommercialEvidence(this.prisma, businessId, [...new Set([...orders, ...reservations].map(r => r.id))]);
    const conversions = await this.prisma.unitConversion.findMany();
    // A mirror shares its order's id. Match against every order, not only the listed ones:
    // an archived/cancelled order's mirror otherwise leaked as a standalone RESERVATION.
    const orderIds = new Set(
      (
        await this.prisma.order.findMany({
          where: { businessId, id: { in: reservations.map((r) => r.id) } },
          select: { id: true },
        })
      ).map((order) => order.id),
    );
    const mirrorReservations = await this.findMirrorReservationsForOrders(
      businessId,
      orders
        .filter(
          (order) =>
            order.origin === 'MANUAL' &&
            order.items.length === 1 &&
            order.items[0]?.itemTypeSnapshot === 'SERVICE',
        )
        .map((order) => order.id),
    );

    console.log(
      `[SalesService] findAll found ${orders.length} orders and ${reservations.length} reservations`,
    );
    if (orders.length > 0)
      console.log(`[SalesService] sample order[0] origin: ${orders[0].origin}`);
    if (reservations.length > 0)
      console.log(
        `[SalesService] sample reservation[0] origin: ${reservations[0].origin}`,
      );

    const mappedOrders: UnifiedSaleDto[] = orders.map((o) => {
      const fiscalSummary = o.fiscalContext
        ? {
            subtotal: Number(o.fiscalContext.subtotal),
            iva: this.sumAppliedTaxAmount(o.taxLines, 'IVA'),
            impoconsumo: this.sumAppliedTaxAmount(o.taxLines, 'IMPOCONSUMO'),
            reteFuente: this.sumAppliedTaxAmount(o.taxLines, 'RETEFUENTE'),
            reteIva: this.sumAppliedTaxAmount(o.taxLines, 'RETEIVA'),
            reteIca: this.sumAppliedTaxAmount(o.taxLines, 'RETEICA'),
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
        ...this.lifecycleView('ORDER', o, mirrorReservation, evidenceById.get(o.id)!),
        customerName: o.customerName,
        customerWhatsapp: o.customerWhatsapp,
        paymentMethod: ((o as any).paymentMethod ?? 'CASH') as
          | 'CASH'
          | 'BANK_TRANSFER',
        total: Number(o.total),
        status: this.mapOrderStatus(o.status),
        countsAsSale: this.countsAsSale('ORDER', o),
        inventoryPostedAt: o.inventoryPostedAt,
        accountingPostedAt: o.accountingPostedAt,
        requiresLegacyInvoiceWarning: requiresLegacyInvoiceWarning(
          o.taxSnapshot?.rawCalculation,
        ),
        createdAt: o.createdAt,
        origin: o.origin as 'MANUAL' | 'PUBLIC_STORE',
        scheduledAt: mirrorReservation
          ? this.toScheduledAt(
              mirrorReservation.date,
              mirrorReservation.startMinute,
            )
          : undefined,
        type:
          o.items[0]?.itemTypeSnapshot === 'SERVICE' ? 'SERVICIO' : 'PRODUCTO',
        hasInvalidOptionSnapshot: this.checkInvalidOptionSnapshot(
          o,
          conversions,
        ),
        fiscalSummary,
        fiscalContext: this.mapFiscalContextForSales(o),
        taxLines: o.taxLines
          ? o.taxLines.map((line) => ({
              taxType: line.taxType,
              direction: line.direction,
              baseAmount: Number(line.baseAmount),
              rate: Number(line.rate),
              taxAmount: Number(line.taxAmount),
              accountCode: line.accountCode,
              applied: line.applied,
              reason: line.reason,
            }))
          : null,
        items: o.items.map((it) => ({
          orderItemId: it.id,
          name: it.itemNameSnapshot,
          qty: it.quantity,
          unitPrice: Number(it.unitPrice),
          price: Number(it.lineTotal),
          itemId: it.itemId,
          itemInventoryMode:
            it.inventoryModeSnapshot ?? it.item?.inventoryMode ?? null,
          excludedOptionalIngredientIds:
            this.parseExcludedOptionalIngredientIdsForResponse(
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
        // Policy 2 shows the agreed price; historical rows keep the catalog price they always showed.
        const price = Number(r.priceSnapshot ?? item?.price ?? 0);

        return {
          id: r.id,
          sourceType: 'RESERVATION',
          ...this.lifecycleView('RESERVATION', r, r, evidenceById.get(r.id)!),
          customerName: r.customerName ?? null,
          customerWhatsapp: r.customerWhatsapp ?? null,
          paymentMethod: (r.paymentMethod ?? 'CASH') as
            | 'CASH'
            | 'BANK_TRANSFER',
          total: Number.isFinite(price) ? price : 0,
          status: this.mapReservationStatus(r.status),
          priceSnapshot: r.priceSnapshot == null ? null : Number(r.priceSnapshot),
          countsAsSale: this.countsAsSale('RESERVATION', r),
          inventoryPostedAt: r.inventoryPostedAt ?? null,
          accountingPostedAt: r.accountingPostedAt ??
            evidenceById.get(r.id)?.accounting.find(m => !String(m.accountingRole ?? '').startsWith('SALE_REVERSAL:') && m.metadata?.kind !== 'SALE_REVERSAL')?.date ?? null,
          createdAt: r.createdAt,
          origin: (r.origin ?? 'MANUAL') as 'MANUAL' | 'PUBLIC_STORE',
          scheduledAt: this.toScheduledAt(r.date, r.startMinute),
          reservationPublicToken: r.publicToken ?? null,
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
            (c) =>
              c.fromUnitId === unitId && c.toUnitId === ingredient.stockUnitId,
          );
          const reverse = conversions.some(
            (c) =>
              c.fromUnitId === ingredient.stockUnitId && c.toUnitId === unitId,
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

  private async findMirrorReservationsForOrders(
    businessId: string,
    orderIds: string[],
  ) {
    if (orderIds.length === 0) return new Map<string, any>();
    const reservations = await this.prisma.reservation.findMany({
      where: {
        businessId,
        id: { in: orderIds },
      },
    });
    return new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );
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
        // Never status/origin/version: editing an existing mirror keeps its lifecycle.
      },
    };
  }

  private mapOrderStatus(status: string): UnifiedStatus {
    if (status === 'COMPLETED') return 'CERRADO';
    if (status === 'CANCELLED') return 'CANCELADO';
    return 'PENDIENTE';
  }

  private mapReservationStatus(status: string): UnifiedStatus {
    if (status === 'CONFIRMED') return 'CONFIRMADO';
    if (status === 'COMPLETED') return 'FINALIZADA';
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
    await this.assertSimpleRegimeAvailableForNewSale(
      businessId,
      buyerFiscalContext,
    );
    this.assertBuyerFiscalContextAllowed(buyerFiscalContext);
    if (sourceType === 'RESERVATION') {
      return this.confirmReservation(businessId, id, buyerFiscalContext);
    }

    const confirmation = await this.runSerializableTransaction(async (tx) => {
      await lockOwnedOrder(tx, businessId, id);
      const mirror = await this.availability.lockReservationRow(tx, businessId, id);
      // Policy 2 separates booking from sale: its mirror order only posts through completion.
      if (isPolicyV2(mirror))
        lifecycleConflict({ code: 'RESERVATION_USE_COMPLETE', message: 'Esta venta corresponde a un turno. Usá «Finalizar atención» cuando el servicio se preste.' });
      return this.postOrderCommercialEffects(tx, businessId, id, buyerFiscalContext, sourceType);
    });

    return confirmation;
  }

  /**
   * Commercial closing of an order (claim, tax freeze, inventory, accounting, invoice-close
   * snapshot; never issues a document). Caller holds Order -> Reservation locks.
   */
  private async postOrderCommercialEffects(
    tx: Prisma.TransactionClient,
    businessId: string,
    id: string,
    buyerFiscalContext: any,
    sourceType: UnifiedSourceType,
  ) {
    {
      const order = await tx.order.findFirst({
        where: { id, businessId },
        include: {
          items: { include: { item: true, options: true } },
          taxSnapshot: true,
        },
      });

      if (!order) throw new NotFoundException('Venta no encontrada');
      const restriction = orderTransitionBlock(order, 'confirm');
      if (restriction) lifecycleConflict(restriction);
      if (!order.items.length)
        throw new BadRequestException('La venta debe tener al menos un ítem');
      if (order.status === 'CANCELLED')
        throw new BadRequestException(
          'Una venta cancelada no se puede confirmar',
        );
      if (order.accountingPostedAt && order.inventoryPostedAt)
        return {
          order,
          accountingCreated: false,
          inventoryCreated: false,
          alreadyPosted: true,
        };

      const confirmableStatuses: OrderStatus[] = ['DRAFT', 'SENT', 'COMPLETED'];
      if (!confirmableStatuses.includes(order.status))
        throw new BadRequestException(
          'La venta no se puede confirmar en su estado actual',
        );

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
          if (!currentOrder) throw new NotFoundException('Venta no encontrada');
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
      const taxProfile =
        !buyerFiscalContext &&
        !persistedBuyerFiscal &&
        tx.businessTaxProfile?.findUnique
          ? await tx.businessTaxProfile.findUnique({
              where: { businessId },
              select: { taxSettingsEnabled: true },
            })
          : null;
      const fiscalContextToUse =
        buyerFiscalContext ??
        persistedBuyerFiscal ??
        (taxProfile?.taxSettingsEnabled
          ? {
              buyerType: 'NATURAL',
              buyerName: null,
              buyerDocumentType: 'CC',
              buyerDocumentNumber: null,
              buyerEmail: null,
              fiscalMunicipalityCode: null,
              saleConcept: 'GOODS',
            }
          : null);

      if (fiscalContextToUse) {
        const cartItems = order.items.map((it: any) => ({
          orderItemId: it.id,
          itemId: it.itemId,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice ?? it.price),
        }));

        const preview = await this.calculateOrderTaxPreview(
          businessId,
          fiscalContextToUse,
          cartItems,
          tx,
        );

        await this.taxService.freezeTaxCalculation(
          tx,
          id,
          preview,
          fiscalContextToUse,
        );
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
            status: 'PENDING',
          },
          data: { status: 'CONFIRMED', confirmedAt: postingDate },
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
      // Persist a closure version even for ordinary sales. It does not issue a document.
      if (this.fiscalDocuments?.captureInvoiceCloseSnapshot) {
        await this.fiscalDocuments.captureInvoiceCloseSnapshot(
          tx,
          businessId,
          id,
        );
      }

      return {
        order: updatedOrder,
        accountingCreated: !order.accountingPostedAt,
        inventoryCreated: !order.inventoryPostedAt,
        alreadyPosted: false,
        inventoryMovements,
        movements,
      };
    }
  }

  private async confirmReservation(
    businessId: string,
    id: string,
    buyerFiscalContext?: any,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // Row lock serializes confirm against cancel: never CANCELLED -> CONFIRMED.
        await this.availability.lockReservationRow(tx, businessId, id);
        const res = await tx.reservation.findFirst({
          where: { id, businessId },
          include: { item: true },
        });

        if (!res) throw new NotFoundException('Reserva no encontrada');
        const transitionBlock = reservationTransitionBlock(res, 'confirm');
        if (transitionBlock) lifecycleConflict(transitionBlock);
        if (res.status === 'CANCELLED')
          throw new ConflictException(
            RESERVATION_ERRORS.cancelledCannotConfirm,
          );
        // A mirror is confirmed through its order; confirming it here would post twice.
        await this.availability.assertNotSalesMirror(tx, businessId, id);

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
                data: { status: 'CONFIRMED', confirmedAt: new Date() },
                include: { item: true },
              });

        console.log(
          `[SalesService] confirmReservation res origin: ${res.origin}`,
        );

        if (buyerFiscalContext) {
          this.assertBuyerFiscalContextAllowed(buyerFiscalContext);
          const cartItems = [
            {
              itemId: res.itemId,
              quantity: 1,
            },
          ];

          const preview = await this.taxService.calculateTaxPreview(
            businessId,
            {
              buyerType: buyerFiscalContext.buyerType,
              buyerName: buyerFiscalContext.buyerName,
              buyerDocumentType: buyerFiscalContext.buyerDocumentType,
              buyerDocumentNumber: buyerFiscalContext.buyerDocumentNumber,
              buyerEmail: buyerFiscalContext.buyerEmail,
              buyerIsIvaResponsable:
                buyerFiscalContext.buyerIsIvaResponsable || false,
              buyerIsRetenedor: buyerFiscalContext.buyerIsRetenedor || false,
              buyerIsGranContribuyente:
                buyerFiscalContext.buyerIsGranContribuyente || false,
              buyerIsAutorretenedor:
                buyerFiscalContext.buyerIsAutorretenedor || false,
              buyerIsRegimenSimple:
                buyerFiscalContext.buyerIsRegimenSimple || false,
              buyerRequiresElectronicInvoice:
                buyerFiscalContext.buyerRequiresElectronicInvoice || false,
              fiscalMunicipalityCode: buyerFiscalContext.fiscalMunicipalityCode,
              saleConcept: buyerFiscalContext.saleConcept || 'SERVICES',
              reteIcaRateOverride:
                buyerFiscalContext.reteIcaRateOverride ??
                buyerFiscalContext.icaRateOverride,
              cartItems,
            },
            tx,
          );

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
      },
      {
        timeout: 20000, // P2028 fix: accounting posting for reservation confirmation needs extra time
      },
    );
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

    const itemId = reservation?.itemId ?? legacyServiceLine.itemId;
    // Same duration reserveSlot validates with: the service's current one.
    const duration =
      reservation?.item.durationMinutes ??
      legacyServiceLine?.item.durationMinutes ??
      null;
    const slotQuery = {
      businessId,
      itemId,
      durationMinutes: duration,
      excludeReservationId: reservation?.id ?? reservationId,
      allowPastDateKey: reservation
        ? formatDateKey(reservation.date)
        : undefined,
    };

    if (query.date) {
      return this.availability.getSlots({
        ...slotQuery,
        date: this.parseDateOnly(query.date),
      });
    }

    if (!query.month) {
      throw new BadRequestException('month or date is required');
    }

    return this.availability.getAvailableDates({
      ...slotQuery,
      ...this.parseMonth(query.month),
    });
  }

  private mapReservationToVirtualOrder(res: any) {
    if (!res?.item) {
      throw new BadRequestException('Reservation service is not available');
    }

    // Policy 2: the price agreed at booking. Policy 1 keeps its historical catalog-price rule.
    const price = res.priceSnapshot ?? res.item.price ?? 0;

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
    await this.assertSimpleRegimeAvailableForNewSale(businessId);
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
        throw new BadRequestException(
          'Mandatory ingredients cannot be excluded',
        );
      }
      if (!optionalIds.has(ingredientId)) {
        throw new BadRequestException(
          'excludedOptionalIngredientIds contains an ingredient outside the optional recipe',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.assertEditableInTransaction(tx, businessId, orderId);
      return tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          excludedOptionalIngredientIds:
            excludedIds.length > 0 ? excludedIds : Prisma.JsonNull,
        },
        include: this.orderItemRecipeInclude,
      });
    });

    return {
      id: updated.id,
      itemId: updated.itemId,
      excludedOptionalIngredientIds:
        this.parseExcludedOptionalIngredientIdsForResponse(
          updated.excludedOptionalIngredientIds,
        ),
      recipe: this.mapRecipeForSales(updated.item),
    };
  }

  async addItem(businessId: string, orderId: string, dto: AddOrderItemDto) {
    await this.assertSimpleRegimeAvailableForNewSale(businessId);
    const order = await this.getOrderOrThrow(businessId, orderId);
    this.assertOrderEditable(order);
    const resolved = await this.resolveOrderLines(businessId, [dto], {
      isManual: order.origin === 'MANUAL',
    });
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
      await this.assertEditableInTransaction(tx, businessId, order.id);
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
    await this.assertSimpleRegimeAvailableForNewSale(businessId);
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
      await this.assertEditableInTransaction(tx, businessId, orderId);
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
    await this.assertSimpleRegimeAvailableForNewSale(businessId);
    const order = await this.getOrderOrThrow(businessId, orderId);
    this.assertOrderEditable(order);

    const oi = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId, businessId },
    });

    if (!oi) throw new NotFoundException('OrderItem not found');

    return this.prisma.$transaction(async (tx) => {
      await this.assertEditableInTransaction(tx, businessId, orderId);
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

    if (!order) {
      const reservation = (await this.findAll(businessId, { includeArchived: true, includeCancelled: true })).find(sale => sale.id === orderId && sale.sourceType === 'RESERVATION');
      if (!reservation) throw new NotFoundException('Order not found');
      return reservation;
    }

    const conversions = await this.prisma.unitConversion.findMany();
    const mirrorReservations = await this.findMirrorReservationsForOrders(
      businessId,
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
          iva: this.sumAppliedTaxAmount(order.taxLines, 'IVA'),
          impoconsumo: this.sumAppliedTaxAmount(order.taxLines, 'IMPOCONSUMO'),
          reteFuente: this.sumAppliedTaxAmount(order.taxLines, 'RETEFUENTE'),
          reteIva: this.sumAppliedTaxAmount(order.taxLines, 'RETEIVA'),
          reteIca: this.sumAppliedTaxAmount(order.taxLines, 'RETEICA'),
          totalCollected:
            Number(order.fiscalContext.subtotal) +
            Number(order.fiscalContext.chargedTaxTotal),
          totalCharged: Number(order.fiscalContext.chargedTaxTotal),
          totalWithheld: Number(order.fiscalContext.withheldTaxTotal),
          netReceived: Number(order.fiscalContext.netReceived),
        }
      : null;

    const evidence = (await this.loadCommercialEvidence(this.prisma, businessId, [orderId])).get(orderId)!;
    return {
      ...order,
      ...this.lifecycleView('ORDER', order, mirrorReservation, evidence),
      scheduledAt: mirrorReservation
        ? this.toScheduledAt(
            mirrorReservation.date,
            mirrorReservation.startMinute,
          )
        : undefined,
      fiscalSummary,
      fiscalContext: this.mapFiscalContextForSales(order),
      taxLines: order.taxLines
        ? order.taxLines.map((line) => ({
            taxType: line.taxType,
            direction: line.direction,
            baseAmount: Number(line.baseAmount),
            rate: Number(line.rate),
            taxAmount: Number(line.taxAmount),
            accountCode: line.accountCode,
            applied: line.applied,
            reason: line.reason,
          }))
        : null,
      hasInvalidOptionSnapshot: this.checkInvalidOptionSnapshot(
        order,
        conversions,
      ),
    };
  }

  async cancel(
    businessId: string,
    id: string,
    sourceType: UnifiedSourceType = 'ORDER',
    reasonInput?: unknown,
  ) {
    const userReason = cancellationReason(reasonInput);
    if (sourceType === 'RESERVATION') {
      return this.prisma.$transaction(
        async (tx) => {
          const { reservation, alreadyCancelled } =
            await this.availability.lockReservationForCancellation(
              tx,
              businessId,
              id,
            );
          // Idempotent: a second cancel must not create new returns or reversals.
          if (alreadyCancelled) {
            return tx.reservation.findUniqueOrThrow({
              where: { id },
              include: { item: true },
            });
          }

          const evidence = isPolicyV2(reservation)
            ? (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!
            : undefined;
          const restriction = reservationTransitionBlock(reservation, 'cancel', 'sales', evidence);
          if (restriction) lifecycleConflict(restriction);
          // Policy 2 CONFIRMED never posted anything: no returns, no counter-entries.
          if (reservation.status === 'CONFIRMED' && !isPolicyV2(reservation)) {
            // Same rule as reverseConfirmedOrder: undo the sale with counter-movements,
            // never deleting originals. Standalone reservations cannot hold Factus documents.
            const reversedAt = new Date();
            const reason = userReason ?? 'Cancelación de reserva confirmada';
            if (reservation.inventoryPostedAt) {
              await this.inventoryService.reverseInventoryConsumptionForReservation(
                tx,
                businessId,
                id,
              );
            }
            await this.accountingService.reverseOrderMovements(tx, businessId, {
              orderId: id,
              accountingPostedAt: null,
              reversedAt,
              reason,
            });
          }

          return tx.reservation.update({
            where: { id },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: userReason },
            include: { item: true },
          });
        },
        { timeout: 20000 },
      );
    }

    const order = await this.prisma.order.findFirst({
      where: { id, businessId },
    });

    if (!order) throw new NotFoundException('Venta no encontrada');

    if (order.status === 'COMPLETED') {
      throw new BadRequestException(
        'Una venta confirmada no se puede cancelar. Usá «Revertir venta».',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await lockOwnedOrder(tx, businessId, id);
      await this.availability.lockReservationRow(tx, businessId, id);
      const current = await tx.order.findFirst({
        where: { id, businessId },
      });
      if (current) { const restriction = orderTransitionBlock(current, 'cancel'); if (restriction) lifecycleConflict(restriction); }
      if (!current || current.status === 'COMPLETED')
        throw new BadRequestException(
          'Una venta confirmada no se puede cancelar. Usá «Revertir venta».',
        );
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
          status: { not: 'CANCELLED' },
        },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: userReason },
      });

      return cancelledOrder;
    });
  }

  async reverseConfirmedOrder(
    businessId: string,
    id: string,
    dto: ReverseOrderDto,
  ) {
    const reversedAt = new Date();
    return this.prisma.$transaction(
      async (tx) => {
        await lockOwnedOrder(tx, businessId, id);
      await this.availability.lockReservationRow(tx, businessId, id);
        const order = await tx.order.findFirst({
          where: { id, businessId },
          include: {
            items: { include: { item: true } },
          },
        });

        if (!order) throw new NotFoundException('Venta no encontrada');
        const evidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
        const restriction = order.archived ? { code: 'RECORD_ARCHIVED', message: 'El registro está eliminado.' } : reverseBlock(order, evidence);
        if (restriction) lifecycleConflict(restriction);

        const protectedFiscalDocument =
          this.fiscalDocuments && (tx as any).fiscalDocument
            ? await (tx as any).fiscalDocument.findFirst({
                where: {
                  businessId,
                  orderId: id,
                  type: 'INVOICE',
                  status: {
                    in: [
                      'PENDING',
                      'PROCESSING',
                      'RETRYABLE_FAILURE',
                      'SUBMITTED_PENDING_DIAN',
                      'LOCAL_PERSISTENCE_FAILURE',
                    ],
                  },
                },
                select: { id: true, status: true },
              })
            : null;
        if (protectedFiscalDocument) {
          throw new BadRequestException(
            'La factura electronica requiere sincronizacion antes de revertir la venta.',
          );
        }

        const validatedInvoice =
          this.fiscalDocuments && (tx as any).fiscalDocument
            ? await (tx as any).fiscalDocument.findFirst({
                where: {
                  businessId,
                  orderId: id,
                  type: 'INVOICE',
                  status: 'VALIDATED',
                },
                select: { id: true },
              })
            : null;
        if (validatedInvoice) {
          const validatedCredit = await (tx as any).fiscalDocument.findFirst({
            where: {
              parentDocumentId: validatedInvoice.id,
              type: 'CREDIT_NOTE',
              status: 'VALIDATED',
            },
            select: { id: true },
          });
          if (!validatedCredit) {
            throw new BadRequestException(
              'La factura electrónica debe anularse mediante una nota crédito validada antes de revertir la venta.',
            );
          }
        }

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
          throw new ConflictException(
            'El inventario de esta venta ya fue revertido',
          );
        }

        if (order.status === 'CANCELLED') {
          throw new BadRequestException(
            'Una venta cancelada no se puede revertir',
          );
        }
        if (order.status !== 'COMPLETED') {
          throw new BadRequestException(
            'Solo se pueden revertir ventas confirmadas',
          );
        }
        if (!order.inventoryPostedAt) {
          throw new BadRequestException(
            'La venta no tiene inventario registrado para revertir',
          );
        }

        const reversalMovements =
          await this.inventoryService.reverseInventoryConsumptionForOrder(
            tx,
            businessId,
            { orderId: id, reason: dto.reason },
            reversedAt,
          );

        const accountingReversalMovements =
          await this.accountingService.reverseOrderMovements(tx, businessId, {
            orderId: id,
            accountingPostedAt: order.accountingPostedAt,
            reversedAt,
            reason: dto.reason,
          });

        const updatedOrder = await tx.order.update({
          where: { id },
          data: {
            status: 'CANCELLED',
          },
          include: {
            items: { include: { item: true } },
          },
        });

        // Frees the mirror slot (same id); no-op for orders without a mirror.
        await tx.reservation.updateMany({
          where: {
            id: this.getMirrorReservationIdForManualServiceOrder(id),
            businessId,
            status: { not: 'CANCELLED' },
          },
          data: { status: 'CANCELLED', cancelledAt: reversedAt, cancelReason: dto.reason ?? null },
        });

        if (validatedInvoice) {
          await (tx as any).fiscalDocument.update({
            where: { id: validatedInvoice.id },
            data: { status: 'CREDITED', reversalAppliedAt: reversedAt },
          });
        }

        return {
          order: updatedOrder,
          inventoryReversed: reversalMovements.length > 0,
          reversalMovements,
          accountingReversalMovements,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async remove(
    businessId: string,
    id: string,
    sourceType: UnifiedSourceType = 'ORDER',
  ) {
    await this.assertSimpleRegimeAvailableForNewSale(businessId);
    if (sourceType === 'RESERVATION') {
      return this.prisma.$transaction(async (tx) => {
        const res = await this.availability.lockReservationRow(
          tx,
          businessId,
          id,
        );
        if (!res) throw new NotFoundException('Reserva no encontrada');
        const evidence = (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!;
        const restriction = reservationArchiveBlock(res, evidence);
        if (restriction) throw new BadRequestException(restriction);
        await this.availability.assertNotSalesMirror(tx, businessId, id);
        // Policy 2 CONFIRMED (no effects): cancel + free the slot + archive in this transaction.
        if (res.status === 'CONFIRMED' && !isPolicyV2(res)) {
          throw new BadRequestException(
            'No se puede eliminar una venta confirmada con inventario impactado. Primero debe revertirse.',
          );
        }
        if (res.status === 'PENDING') {
          // Archiving alone kept the slot occupied; deleting a reservation also frees it.
          await this.availability.assertNotSalesMirror(tx, businessId, id);
        }

        return tx.reservation.update({
          where: { id },
          data: { archived: true, status: 'CANCELLED', ...(res.status !== 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
          include: { item: true },
        });
      });
    }

    const order = await this.prisma.order.findFirst({
      where: { id, businessId },
    });

    if (!order) throw new NotFoundException('Venta no encontrada');

    if (order.status === 'COMPLETED' && order.inventoryPostedAt) {
      throw new BadRequestException(
        'No se puede eliminar una venta confirmada con inventario impactado. Primero debe revertirse.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await lockOwnedOrder(tx, businessId, id);
      await this.availability.lockReservationRow(tx, businessId, id);
      const current = await tx.order.findFirst({
        where: { id, businessId },
        select: { status: true, inventoryPostedAt: true, archived: true },
      });
      if (!current) throw new NotFoundException('Venta no encontrada');
      if (current.status === 'COMPLETED' && current.inventoryPostedAt) {
        throw new BadRequestException(
          'No se puede eliminar una venta confirmada con inventario impactado. Primero debe revertirse.',
        );
      }
      const mirror = await tx.reservation.findFirst({ where: { id, businessId } });
      const restriction = orderTransitionBlock(current, 'delete', mirror);
      if (restriction) lifecycleConflict(restriction);
      if (mirror?.status === 'COMPLETED') lifecycleConflict({ code: 'RESERVATION_STATE_CONFLICT', message: 'No se puede cancelar implícitamente una atención finalizada al eliminar la venta.' });
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
          status: { not: 'CANCELLED' },
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
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
    await this.assertSimpleRegimeAvailableForNewSale(
      businessId,
      dto.buyerFiscalContext,
    );
    this.assertBuyerFiscalContextAllowed(dto.buyerFiscalContext);
    if (sourceType === 'RESERVATION') {
      return this.updateReservation(businessId, orderId, dto);
    }

    const order = await this.getOrderOrThrow(businessId, orderId);
    this.assertOrderEditable(order);
    const resolvedItems = dto.items
      ? await this.resolveOrderLines(businessId, dto.items, {
          isManual: order.origin === 'MANUAL',
        })
      : null;
    const finalLines = resolvedItems?.lines ?? order.items;
    const finalSingleManualService =
      order.origin === 'MANUAL' &&
      finalLines.length === 1 &&
      finalLines[0]?.itemTypeSnapshot === 'SERVICE';
    const finalServiceItemId = finalSingleManualService
      ? finalLines[0].itemId
      : null;
    if (
      order.origin === 'MANUAL' &&
      dto.scheduledAt &&
      !finalSingleManualService
    ) {
      throw new BadRequestException(SCHEDULED_SERVICE_ALONE);
    }

    return this.prisma
      .$transaction(async (tx) => {
        await this.assertEditableInTransaction(tx, businessId, orderId);
        await tx.order.update({
          where: { id: orderId },
          data: {
            customerName:
              order.origin === 'PUBLIC_STORE'
                ? dto.customerName !== undefined
                  ? dto.customerName?.trim() || null
                  : undefined
                : dto.customerName !== undefined
                  ? dto.customerName?.trim() || 'Consumidor final'
                  : undefined,
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
          const mirrorId =
            this.getMirrorReservationIdForManualServiceOrder(orderId);
          // Row lock first, then agenda locks (same order as every reservation edit).
          const existingMirror = await this.availability.lockReservationRow(
            tx,
            businessId,
            mirrorId,
          );
          const { dateOnly, startMinute } = this.parseScheduledAt(
            dto.scheduledAt,
          );
          const mirrorData = {
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
          };
          // Policy 2 mirrors only revive after the controlled detach of this same editor.
          if (existingMirror?.status === 'CANCELLED' && isPolicyV2(existingMirror)) {
            const evidence = (await this.loadCommercialEvidence(tx, businessId, [mirrorId])).get(mirrorId)!;
            if (existingMirror.cancelReason !== MIRROR_DETACHED_REASON || existingMirror.archived || hasCommercialEffects(existingMirror, evidence))
              lifecycleConflict({ code: 'MIRROR_REACTIVATION_NOT_ALLOWED', message: 'Este turno fue cancelado y no se puede reactivar. Registrá una venta nueva.' });
          }
          if (existingMirror && isPolicyV2(existingMirror) && existingMirror.status === 'COMPLETED')
            lifecycleConflict({ code: 'RESERVATION_STATE_CONFLICT', message: 'La atención ya fue finalizada.' });
          const slotUnchanged =
            existingMirror !== null &&
            existingMirror.status !== 'CANCELLED' &&
            existingMirror.itemId === finalServiceItemId &&
            existingMirror.date.getTime() === dateOnly.getTime() &&
            existingMirror.startMinute === startMinute;

          if (slotUnchanged) {
            // Administrative edit: keep the historical slot, duration and status.
            const mirror = this.buildMirrorReservationData({
              ...mirrorData,
              durationMinutes:
                existingMirror.endMinute - existingMirror.startMinute,
            });
            await tx.reservation.update({
              where: { id: mirrorId },
              data: {
                customerName: mirror.update.customerName,
                customerWhatsapp: mirror.update.customerWhatsapp,
                paymentMethod: mirror.update.paymentMethod,
              },
            });
          } else {
            // New or moved slot (also a cancelled mirror revived by this explicit edit).
            const slot = await this.availability.reserveSlot(tx, {
              businessId,
              itemId: finalServiceItemId,
              date: dateOnly,
              startMinute,
              excludeReservationId: mirrorId,
              allowInactiveService: existingMirror !== null,
              extraLockKeys: existingMirror
                ? [
                    {
                      businessId,
                      itemId: existingMirror.itemId,
                      date: existingMirror.date,
                    },
                  ]
                : [],
            });
            const mirror = this.buildMirrorReservationData({
              ...mirrorData,
              durationMinutes: slot.durationMinutes,
            });
            const revive = existingMirror?.status === 'CANCELLED';
            await tx.reservation.upsert({
              where: { id: mirror.reservationId },
              create: {
                ...mirror.create,
                ...(await newReservationPolicy(tx, businessId, null)),
              },
              update: {
                ...mirror.update,
                // Revival keeps the row's own policy: v1 back to PENDING (historical), v2 CONFIRMED.
                ...(revive
                  ? isPolicyV2(existingMirror)
                    ? { status: 'CONFIRMED' as const, confirmedAt: new Date(), cancelledAt: null, cancelReason: null }
                    : { status: 'PENDING' as const }
                  : {}),
              },
            });
          }
        } else if (
          order.origin === 'MANUAL' &&
          resolvedItems &&
          !finalSingleManualService
        ) {
          // Controlled detach: the only writer of MIRROR_DETACHED_REASON (never user input).
          await tx.reservation.updateMany({
            where: {
              id: this.getMirrorReservationIdForManualServiceOrder(orderId),
              businessId,
              status: { not: 'CANCELLED' },
            },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: MIRROR_DETACHED_REASON },
          });
        }

        if (dto.buyerFiscalContext) {
          await this.persistOrderFiscalPreview(
            tx,
            businessId,
            orderId,
            dto.buyerFiscalContext,
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
      })
      .catch((error) => {
        throw toBookingConflict(error);
      });
  }

  private async updateReservation(
    businessId: string,
    id: string,
    dto: UpdateOrderDto,
  ) {
    const updated = await this.prisma
      .$transaction(async (tx) => {
        const reservation = await this.availability.lockReservationRow(
          tx,
          businessId,
          id,
        );

        if (!reservation) {
          throw new NotFoundException('Reservation not found');
        }

        const evidence = isPolicyV2(reservation)
          ? (await this.loadCommercialEvidence(tx, businessId, [id])).get(id)!
          : undefined;
        const restriction = reservationTransitionBlock(reservation, 'edit', 'sales', evidence);
        if (restriction) lifecycleConflict(restriction);
        await this.availability.assertNotSalesMirror(tx, businessId, id);
        if (reservation.status !== 'PENDING' && !isPolicyV2(reservation)) {
          throw new BadRequestException(
            'Reservation not editable in current status',
          );
        }

        const data: any = {
          customerName: dto.customerName,
          customerWhatsapp: dto.customerWhatsapp,
          note: dto.note,
          paymentMethod: dto.paymentMethod,
        };

        if (dto.scheduledAt) {
          const { dateOnly, startMinute } = this.parseScheduledAt(
            dto.scheduledAt,
          );
          const slotUnchanged =
            reservation.date.getTime() === dateOnly.getTime() &&
            reservation.startMinute === startMinute;

          // Unchanged slot = administrative edit: historical values are kept as stored.
          if (!slotUnchanged) {
            const slot = await this.availability.reserveSlot(tx, {
              businessId,
              itemId: reservation.itemId,
              date: dateOnly,
              startMinute,
              excludeReservationId: reservation.id,
              allowInactiveService: true,
              extraLockKeys: [
                {
                  businessId,
                  itemId: reservation.itemId,
                  date: reservation.date,
                },
              ],
            });
            data.date = slot.date;
            data.startMinute = slot.startMinute;
            data.endMinute = slot.endMinute;
          }
        }

        return tx.reservation.update({
          where: { id },
          data,
          include: { item: true },
        });
      })
      .catch((error) => {
        throw toBookingConflict(error);
      });

    return {
      id: updated.id,
      sourceType: 'RESERVATION' as const,
      customerName: updated.customerName,
      customerWhatsapp: updated.customerWhatsapp,
      paymentMethod: updated.paymentMethod as 'CASH' | 'BANK_TRANSFER',
      total: Number(updated.priceSnapshot ?? updated.item.price),
      commercialPolicyVersion: updated.commercialPolicyVersion,
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
    items: Array<{
      type?: 'PRODUCT' | 'SERVICE';
      itemTypeSnapshot?: 'PRODUCT' | 'SERVICE';
    }>,
  ) {
    const types = new Set(
      items.map((i) => i.type ?? i.itemTypeSnapshot).filter(Boolean),
    );

    if (types.size === 0) {
      throw new BadRequestException(
        'Order must contain at least one item type',
      );
    }

    if (types.size > 1) {
      throw new BadRequestException('Order cannot mix products and services');
    }

    return Array.from(types)[0];
  }
}
