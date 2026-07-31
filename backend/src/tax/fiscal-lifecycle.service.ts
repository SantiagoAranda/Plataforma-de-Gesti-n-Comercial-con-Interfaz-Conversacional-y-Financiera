import { Injectable } from '@nestjs/common';
import {
  FiscalCalculationStatus,
  OrderStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FiscalInvalidationReason =
  | 'ITEMS_CHANGED'
  | 'QUANTITY_CHANGED'
  | 'PRICE_CHANGED'
  | 'BUYER_CHANGED'
  | 'FISCAL_CONCEPT_CHANGED'
  | 'ICA_CHANGED'
  | 'PAYMENT_CHANGED'
  | 'TAX_CONFIGURATION_CHANGED'
  | 'LEGACY_FINGERPRINT_MISSING'
  | 'SALE_CANCELLED';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class FiscalLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async invalidateOrder(
    orderId: string,
    reason: FiscalInvalidationReason,
    db: DbClient = this.prisma,
  ) {
    return db.saleFiscalContext.updateMany({
      where: {
        orderId,
        calculationStatus: { not: FiscalCalculationStatus.LOCKED },
      },
      data: {
        calculationStatus: FiscalCalculationStatus.STALE,
        invalidatedAt: new Date(),
        invalidationReason: reason,
      },
    });
  }

  async invalidateReservation(
    reservationId: string,
    reason: FiscalInvalidationReason,
    db: DbClient = this.prisma,
  ) {
    return db.saleFiscalContext.updateMany({
      where: {
        reservationId,
        calculationStatus: { not: FiscalCalculationStatus.LOCKED },
      },
      data: {
        calculationStatus: FiscalCalculationStatus.STALE,
        invalidatedAt: new Date(),
        invalidationReason: reason,
      },
    });
  }

  async invalidateBusiness(
    businessId: string,
    reason: FiscalInvalidationReason = 'TAX_CONFIGURATION_CHANGED',
    db: DbClient = this.prisma,
  ) {
    return db.saleFiscalContext.updateMany({
      where: {
        businessId,
        calculationStatus: { not: FiscalCalculationStatus.LOCKED },
        OR: [
          { order: { status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] } } },
          { reservation: { status: ReservationStatus.PENDING } },
        ],
      },
      data: {
        calculationStatus: FiscalCalculationStatus.STALE,
        invalidatedAt: new Date(),
        invalidationReason: reason,
      },
    });
  }

  async invalidateItem(
    businessId: string,
    itemId: string,
    db: DbClient = this.prisma,
  ) {
    return db.saleFiscalContext.updateMany({
      where: {
        businessId,
        calculationStatus: { not: FiscalCalculationStatus.LOCKED },
        OR: [
          {
            order: {
              status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] },
              items: { some: { itemId } },
            },
          },
          {
            reservation: {
              status: ReservationStatus.PENDING,
              itemId,
            },
          },
        ],
      },
      data: {
        calculationStatus: FiscalCalculationStatus.STALE,
        invalidatedAt: new Date(),
        invalidationReason: 'TAX_CONFIGURATION_CHANGED',
      },
    });
  }
}

