import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountingMovementOriginType,
  ExpenseAccountingType,
  Prisma,
  ReceiptSource,
  ReceiptStatus,
  MovementNature,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ReceiptProcessingService } from './receipt-processing.service';
import { UpdateExpenseReceiptDto } from './dto/update-expense-receipt.dto';

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

@Injectable()
export class ExpenseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly processing: ReceiptProcessingService,
    private readonly configService: ConfigService,
  ) {}

  async scan(
    businessId: string,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debe adjuntar una imagen');
    if (!ACCEPTED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Solo se aceptan imagenes JPG, PNG o WebP');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar 5 MB');
    }

    const receipt = await this.prisma.expenseReceipt.create({
      data: {
        businessId,
        status: ReceiptStatus.PROCESSING,
        source: ReceiptSource.OCR,
      },
      select: { id: true, status: true },
    });

    const extension = this.extensionForMime(file.mimetype);
    const objectKey = `tmp/expense-receipts/${businessId}/${receipt.id}-${randomUUID()}.${extension}`;
    const temporaryExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.storage.uploadObject({
      objectKey,
      body: file.buffer,
      contentType: file.mimetype,
    });

    await this.prisma.expenseReceipt.update({
      where: { id: receipt.id },
      data: { temporaryObjectKey: objectKey, temporaryExpiresAt },
    });

    this.processing.processSoon(receipt.id);

    return receipt;
  }

  async createManual(businessId: string, dto: UpdateExpenseReceiptDto) {
    const selection = await this.resolvePucSelection(dto);
    const receipt = await this.prisma.expenseReceipt.create({
      data: {
        businessId,
        status: ReceiptStatus.DRAFT,
        source: ReceiptSource.MANUAL,
        ...this.mutableData(dto),
        ...selection,
      },
    });

    return this.serialize(receipt, true);
  }

  async list(businessId: string) {
    const receipts = await this.prisma.expenseReceipt.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        amount: true,
        paidAt: true,
        destinationName: true,
        reference: true,
        accountingType: true,
        category: true,
        createdAt: true,
      },
    });

    return receipts.map((receipt) => ({
      ...receipt,
      amount: receipt.amount ? Number(receipt.amount) : null,
    }));
  }

  async get(businessId: string, id: string) {
    const receipt = await this.loadReceipt(businessId, id);
    return this.serialize(receipt, true);
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateExpenseReceiptDto,
  ) {
    const existing = await this.loadReceipt(businessId, id);
    if (
      existing.status === ReceiptStatus.POSTED ||
      existing.status === ReceiptStatus.REJECTED
    ) {
      throw new BadRequestException('Este comprobante ya no se puede editar');
    }

    const selection = await this.resolvePucSelection(dto);
    const receipt = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        ...this.mutableData(dto),
        ...selection,
        source:
          existing.source === ReceiptSource.OCR
            ? ReceiptSource.EDITED
            : existing.source,
        status:
          existing.status === ReceiptStatus.READY_FOR_REVIEW
            ? ReceiptStatus.DRAFT
            : existing.status,
      },
    });

    return this.serialize(receipt, true);
  }

  async post(businessId: string, id: string) {
    const receipt = await this.loadReceipt(businessId, id);
    if (receipt.status === ReceiptStatus.POSTED) {
      return this.serialize(receipt, true);
    }

    if (
      !receipt.amount ||
      !receipt.paidAt ||
      !receipt.accountingType ||
      !receipt.category
    ) {
      throw new BadRequestException('Faltan datos obligatorios para registrar');
    }

    const selectedReference = await this.loadPucReferenceOrThrow({
      pucCuentaCode: receipt.pucCuentaCode,
      pucSubcuentaId: receipt.pucSubcuentaId,
      accountingType: receipt.accountingType,
    });
    const paymentReference = await this.resolvePaymentReference();
    const amount = new Prisma.Decimal(receipt.amount);
    const detail =
      receipt.description?.trim() ||
      `${receipt.accountingType === ExpenseAccountingType.COST ? 'Costo' : 'Gasto'} registrado por comprobante`;

    const posted = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.expenseReceipt.findFirst({
        where: { id, businessId },
      });
      if (!fresh) throw new NotFoundException('Comprobante no encontrado');
      if (fresh.status === ReceiptStatus.POSTED) return fresh;

      const existingMovements = await tx.accountingMovement.findMany({
        where: {
          businessId,
          originType: AccountingMovementOriginType.EXPENSE_RECEIPT,
          originId: id,
        },
        select: { id: true },
      });

      if (existingMovements.length > 0) {
        return tx.expenseReceipt.update({
          where: { id },
          data: {
            status: ReceiptStatus.POSTED,
            accountingMovementIds: existingMovements.map((m) => m.id),
          },
        });
      }

      const debit = await tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(selectedReference),
          amount,
          nature: MovementNature.DEBIT,
          date: receipt.paidAt!,
          detail,
          originType: AccountingMovementOriginType.EXPENSE_RECEIPT,
          originId: id,
        },
        select: { id: true },
      });

      const credit = await tx.accountingMovement.create({
        data: {
          businessId,
          ...this.movementPucData(paymentReference),
          amount,
          nature: MovementNature.CREDIT,
          date: receipt.paidAt!,
          detail: `Contrapartida ${detail}`,
          originType: AccountingMovementOriginType.EXPENSE_RECEIPT,
          originId: id,
        },
        select: { id: true },
      });

      return tx.expenseReceipt.update({
        where: { id },
        data: {
          status: ReceiptStatus.POSTED,
          accountingMovementIds: [debit.id, credit.id],
        },
      });
    });

    return this.serialize(posted, true);
  }

  async reject(businessId: string, id: string) {
    const receipt = await this.loadReceipt(businessId, id);
    if (receipt.temporaryObjectKey) {
      await this.storage.deleteObject(receipt.temporaryObjectKey).catch(() => undefined);
    }

    const rejected = await this.prisma.expenseReceipt.update({
      where: { id },
      data: {
        status: ReceiptStatus.REJECTED,
        temporaryObjectKey: null,
        temporaryExpiresAt: null,
      },
    });

    return this.serialize(rejected, true);
  }

  private mutableData(dto: UpdateExpenseReceiptDto) {
    return {
      amount:
        dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount),
      paidAt: dto.paidAt === undefined ? undefined : new Date(dto.paidAt),
      destinationName: this.clean(dto.destinationName),
      destinationBank: this.clean(dto.destinationBank),
      destinationAccount: this.clean(dto.destinationAccount),
      bankName: this.clean(dto.bankName),
      reference: this.clean(dto.reference),
      description: this.clean(dto.description),
      accountingType: dto.accountingType,
      category: dto.category,
    };
  }

  private clean(value: string | null | undefined) {
    if (value === undefined) return undefined;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async loadReceipt(businessId: string, id: string) {
    const receipt = await this.prisma.expenseReceipt.findFirst({
      where: { id, businessId },
    });

    if (!receipt) throw new NotFoundException('Comprobante no encontrado');
    return receipt;
  }

  private async resolvePucSelection(dto: UpdateExpenseReceiptDto) {
    if (dto.pucCuentaCode === undefined && dto.pucSubcuentaId === undefined) {
      return {};
    }

    const pucCuentaCode = dto.pucCuentaCode?.trim() || null;
    const pucSubcuentaId = dto.pucSubcuentaId?.trim() || null;
    const selectedCount =
      Number(Boolean(pucCuentaCode)) + Number(Boolean(pucSubcuentaId));

    if (selectedCount === 0) {
      return { pucCuentaCode: null, pucSubcuentaId: null };
    }
    if (selectedCount !== 1) {
      throw new BadRequestException('Debe seleccionar una cuenta PUC');
    }

    await this.loadPucReferenceOrThrow({
      pucCuentaCode,
      pucSubcuentaId,
      accountingType: dto.accountingType,
    });

    return { pucCuentaCode, pucSubcuentaId };
  }

  private async loadPucReferenceOrThrow(input: {
    pucCuentaCode?: string | null;
    pucSubcuentaId?: string | null;
    accountingType?: ExpenseAccountingType | null;
  }) {
    const code = input.pucSubcuentaId || input.pucCuentaCode;
    if (!code) throw new BadRequestException('Debe seleccionar una cuenta PUC');

    const reference = input.pucSubcuentaId
      ? await this.prisma.pucSubcuenta.findUnique({
          where: { code },
          include: { cuenta: true },
        })
      : await this.prisma.pucCuenta.findUnique({ where: { code } });

    if (!reference || ('active' in reference && !reference.active)) {
      throw new BadRequestException('La cuenta PUC seleccionada no existe');
    }

    const effectiveCode =
      'cuentaCode' in reference ? reference.cuentaCode : reference.code;
    if (input.accountingType === ExpenseAccountingType.EXPENSE && !effectiveCode.startsWith('5')) {
      throw new BadRequestException('Debe seleccionar una cuenta de gasto');
    }
    if (input.accountingType === ExpenseAccountingType.COST && !effectiveCode.startsWith('6')) {
      throw new BadRequestException('Debe seleccionar una cuenta de costo');
    }

    return input.pucSubcuentaId
      ? {
          kind: 'SUBCUENTA' as const,
          code: reference.code,
          name: reference.name,
        }
      : {
          kind: 'CUENTA' as const,
          code: reference.code,
          name: reference.name,
        };
  }

  private async resolvePaymentReference() {
    const configured =
      this.configService.get<string>('EXPENSE_RECEIPT_PAYMENT_PUC_CODE') ||
      '1105';
    return this.loadPucReferenceOrThrow({ pucCuentaCode: configured });
  }

  private movementPucData(reference: {
    kind: 'CUENTA' | 'SUBCUENTA';
    code: string;
  }) {
    return reference.kind === 'CUENTA'
      ? { pucCuentaCode: reference.code, pucSubcuentaId: null }
      : { pucCuentaCode: null, pucSubcuentaId: reference.code };
  }

  private extensionForMime(mimeType: string) {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/heic') return 'heic';
    if (mimeType === 'image/heif') return 'heif';
    return 'jpg';
  }

  private serialize(receipt: any, includeSensitive: boolean) {
    const base = {
      ...receipt,
      amount: receipt.amount ? Number(receipt.amount) : null,
      confidence: receipt.confidence ? Number(receipt.confidence) : null,
    };

    if (!includeSensitive) {
      delete base.rawText;
      delete base.parsedPayload;
    }

    delete base.temporaryObjectKey;
    delete base.temporaryExpiresAt;
    return base;
  }
}
