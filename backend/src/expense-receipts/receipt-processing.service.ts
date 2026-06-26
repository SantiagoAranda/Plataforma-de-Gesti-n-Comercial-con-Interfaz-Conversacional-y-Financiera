import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ExpenseAccountingType,
  Prisma,
  ReceiptStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { ReceiptParserService } from './receipt-parser.service';

@Injectable()
export class ReceiptProcessingService implements OnModuleInit {
  private readonly logger = new Logger(ReceiptProcessingService.name);
  private readonly activeBusinesses = new Set<string>();
  private activeGlobal = 0;
  private recoveryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocr: ReceiptOcrService,
    private readonly parser: ReceiptParserService,
  ) {}

  onModuleInit() {
    this.recoveryTimer = setInterval(() => {
      void this.recoverPending();
    }, 60000);
    this.recoveryTimer.unref?.();
  }

  processSoon(receiptId: string) {
    setTimeout(() => void this.processReceipt(receiptId), 0);
  }

  async recoverPending() {
    await this.cleanupExpired();

    const pending = await this.prisma.expenseReceipt.findMany({
      where: {
        status: ReceiptStatus.PROCESSING,
        temporaryObjectKey: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    for (const receipt of pending) {
      this.processSoon(receipt.id);
    }
  }

  async cleanupExpired() {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
    const stale = await this.prisma.expenseReceipt.findMany({
      where: {
        OR: [
          { temporaryExpiresAt: { lt: now } },
          {
            status: ReceiptStatus.PROCESSING,
            createdAt: { lt: staleBefore },
          },
        ],
      },
      select: { id: true, temporaryObjectKey: true },
      take: 50,
    });

    for (const receipt of stale) {
      await this.safeDelete(receipt.temporaryObjectKey);
      await this.prisma.expenseReceipt.update({
        where: { id: receipt.id },
        data: {
          status: ReceiptStatus.FAILED,
          processingError: 'Tiempo de procesamiento agotado',
          temporaryObjectKey: null,
          temporaryExpiresAt: null,
        },
      });
    }
  }

  async processReceipt(receiptId: string) {
    const receipt = await this.prisma.expenseReceipt.findUnique({
      where: { id: receiptId },
    });

    if (
      !receipt ||
      receipt.status !== ReceiptStatus.PROCESSING ||
      !receipt.temporaryObjectKey
    ) {
      return;
    }

    if (this.activeGlobal >= 3 || this.activeBusinesses.has(receipt.businessId)) {
      setTimeout(() => void this.processReceipt(receiptId), 2000);
      return;
    }

    this.activeGlobal += 1;
    this.activeBusinesses.add(receipt.businessId);

    try {
      const buffer = await this.storage.getObjectBuffer(receipt.temporaryObjectKey);
      const rawText = (await this.ocr.extractText({
        buffer,
        mimeType: 'image/jpeg',
        filename: `${receipt.id}.jpg`,
      })).slice(0, 10000);
      const parsed = this.parser.parse(rawText);
      const hash = createHash('sha256').update(buffer).digest('hex');
      const duplicateWarning = await this.findDuplicateWarning(
        receipt.businessId,
        receipt.id,
        parsed.reference,
        parsed.amount,
        parsed.paidAt,
        hash,
      );

      await this.prisma.expenseReceipt.update({
        where: { id: receipt.id },
        data: {
          status: ReceiptStatus.READY_FOR_REVIEW,
          rawText,
          parsedPayload: parsed.parsedPayload as Prisma.InputJsonValue,
          confidence: new Prisma.Decimal(parsed.confidence),
          amount: parsed.amount ? new Prisma.Decimal(parsed.amount) : undefined,
          paidAt: parsed.paidAt,
          destinationName: parsed.destinationName,
          destinationBank: parsed.destinationBank,
          destinationAccount: parsed.destinationAccount,
          bankName: parsed.bankName,
          reference: parsed.reference,
          description: parsed.description,
          processedImageHash: hash,
          duplicateWarning,
          processingError: null,
          temporaryObjectKey: null,
          temporaryExpiresAt: null,
        },
      });
    } catch (error) {
      await this.prisma.expenseReceipt.update({
        where: { id: receipt.id },
        data: {
          status: ReceiptStatus.FAILED,
          processingError: this.shortError(error),
          temporaryObjectKey: null,
          temporaryExpiresAt: null,
        },
      });
    } finally {
      await this.safeDelete(receipt.temporaryObjectKey);
      this.activeBusinesses.delete(receipt.businessId);
      this.activeGlobal = Math.max(0, this.activeGlobal - 1);
    }
  }

  private async findDuplicateWarning(
    businessId: string,
    receiptId: string,
    reference?: string,
    amount?: number,
    paidAt?: Date,
    hash?: string,
  ) {
    if (hash) {
      const duplicateByHash = await this.prisma.expenseReceipt.findFirst({
        where: {
          businessId,
          id: { not: receiptId },
          processedImageHash: hash,
          status: { not: ReceiptStatus.REJECTED },
        },
      });
      if (duplicateByHash) {
        return 'Este comprobante se parece a uno ya registrado.';
      }
    }

    if (!reference || !amount || !paidAt) return null;

    const start = new Date(paidAt);
    start.setDate(start.getDate() - 1);
    const end = new Date(paidAt);
    end.setDate(end.getDate() + 1);

    const duplicate = await this.prisma.expenseReceipt.findFirst({
      where: {
        businessId,
        id: { not: receiptId },
        reference,
        amount: new Prisma.Decimal(amount),
        paidAt: { gte: start, lte: end },
        status: { not: ReceiptStatus.REJECTED },
      },
    });

    return duplicate ? 'Este comprobante se parece a uno ya registrado.' : null;
  }

  private async safeDelete(objectKey?: string | null) {
    if (!objectKey) return;
    try {
      await this.storage.deleteObject(objectKey);
    } catch (error) {
      this.logger.warn(
        `Could not delete temporary receipt object ${objectKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private shortError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 300);
  }
}
