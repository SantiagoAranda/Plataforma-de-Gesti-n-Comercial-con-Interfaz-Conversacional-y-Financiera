import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FiscalDocumentStatus,
  FiscalDocumentType,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { parseFactusDateTime } from './factus-date';
import { FactusProvider } from './providers/factus.provider';

type Tx = Prisma.TransactionClient;

const RECOVERY_CANDIDATE_LIMIT = 100;
const RECOVERY_DISPATCH_LIMIT = 25;
const RECOVERY_CONCURRENCY = 5;
const RECOVERY_MAX_ATTEMPTS = 10;
const PENDING_RECOVERY_AGE_MS = 30_000;
const RETRY_BACKOFF_BASE_MS = 30_000;
const RETRY_BACKOFF_MAX_MS = 30 * 60_000;

@Injectable()
export class FiscalDocumentService {
  private readonly logger = new Logger(FiscalDocumentService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FactusProvider,
    private readonly storage: StorageService,
  ) {}

  async createInvoiceIntent(tx: Tx, businessId: string, orderId: string) {
    const configuration = await this.electronicInvoicingConfiguration(tx, businessId);
    if (!configuration) return null;
    const existing = await tx.fiscalDocument.findFirst({
      where: { businessId, orderId, type: 'INVOICE', sequenceScope: 'PRIMARY' },
    });
    if (existing) return existing;
    const order = await tx.order.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: { include: { item: true } },
        fiscalContext: true,
        taxLines: true,
        taxSnapshot: true,
        business: {
          include: {
            taxProfile: {
              include: {
                responsibilities: { include: { responsibility: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const snapshots = this.buildSnapshots(order, configuration);
    const id = randomUUID();
    return tx.fiscalDocument.create({
      data: {
        id,
        businessId,
        orderId,
        type: 'INVOICE',
        referenceCode: `FE-${id}`,
        sellerSnapshot: snapshots.seller as Prisma.InputJsonValue,
        buyerSnapshot: snapshots.buyer as Prisma.InputJsonValue,
        itemsSnapshot: snapshots.items as Prisma.InputJsonValue,
        taxSnapshot: snapshots.tax as Prisma.InputJsonValue,
        paymentSnapshot: snapshots.payment as Prisma.InputJsonValue,
        payloadSnapshot: snapshots.payload as Prisma.InputJsonValue,
        fiscalFingerprint: this.fingerprint(snapshots),
        total: snapshots.total,
      },
    });
  }

  /**
   * Factus configuration alone is not an issuance switch.  A business must
   * explicitly keep DIAN responsibility 52 before a local sale becomes an
   * electronic invoice.
   */
  private async electronicInvoicingConfiguration(tx: Tx, businessId: string) {
    const [configuration, taxProfile] = await Promise.all([
      tx.factusConfiguration.findUnique({ where: { businessId } }),
      tx.businessTaxProfile.findUnique({
        where: { businessId },
        include: {
          responsibilities: { include: { responsibility: true } },
        },
      }),
    ]);
    const hasElectronicInvoicerResponsibility = Boolean(
      taxProfile?.responsibilities.some(
        (entry: any) => entry.responsibility.code === '52',
      ),
    );
    const taxSettingsEnabled = taxProfile?.taxSettingsEnabled === true;
    return configuration?.enabled &&
      taxSettingsEnabled &&
      hasElectronicInvoicerResponsibility
      ? configuration
      : null;
  }

  async list(businessId: string) {
    return this.prisma.fiscalDocument.findMany({
      where: { businessId },
      include: {
        attempts: { orderBy: { startedAt: 'desc' }, take: 1 },
        artifacts: {
          select: {
            id: true,
            kind: true,
            checksum: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        order: {
          select: {
            id: true,
            customerName: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConfiguration(businessId: string) {
    const configuration = await this.prisma.factusConfiguration.findUnique({
      where: { businessId },
      select: {
        enabled: true,
        environment: true,
        encryptedCredentials: true,
        invoiceRangeId: true,
        creditNoteRangeId: true,
        updatedAt: true,
      },
    });
    return {
      enabled: configuration?.enabled ?? false,
      configured: Boolean(configuration?.encryptedCredentials),
      environment:
        configuration?.environment === 'production' ? 'production' : 'sandbox',
      invoiceRangeId: configuration?.invoiceRangeId ?? null,
      creditNoteRangeId: configuration?.creditNoteRangeId ?? null,
      updatedAt: configuration?.updatedAt ?? null,
      lastVerifiedAt: null,
    };
  }

  async downloadArtifact(
    businessId: string,
    documentId: string,
    kind: string,
  ) {
    if (kind !== 'pdf' && kind !== 'xml') {
      throw new NotFoundException('Documento fiscal o archivo no encontrado');
    }
    const artifact = await this.prisma.fiscalDocumentArtifact.findFirst({
      where: {
        fiscalDocumentId: documentId,
        kind,
        fiscalDocument: { businessId },
      },
      select: { objectKey: true },
    });
    if (!artifact) {
      throw new NotFoundException('Documento fiscal o archivo no encontrado');
    }
    let stored: Awaited<ReturnType<StorageService['downloadObject']>>;
    try {
      stored = await this.storage.downloadObject(artifact.objectKey);
    } catch (error: any) {
      if (
        error?.name === 'NoSuchKey' ||
        error?.name === 'NotFound' ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException('Documento fiscal o archivo no encontrado');
      }
      throw error;
    }
    return {
      body: stored.body,
      contentType:
        stored.contentType ??
        (kind === 'pdf' ? 'application/pdf' : 'application/xml'),
      filename: `${documentId}.${kind}`,
    };
  }

  async recoverPendingDocuments(now = new Date()) {
    const candidates = await this.prisma.fiscalDocument.findMany({
      where: { status: { in: ['PENDING', 'RETRYABLE_FAILURE'] } },
      include: {
        attempts: { orderBy: { startedAt: 'desc' }, take: 1 },
        _count: { select: { attempts: true } },
        order: { select: { taxLines: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: RECOVERY_CANDIDATE_LIMIT,
    });

    const eligible = candidates
      .filter((document) => this.isRecoveryEligible(document, now))
      .slice(0, RECOVERY_DISPATCH_LIMIT);
    const outcomes = await this.runWithConcurrency(
      eligible,
      RECOVERY_CONCURRENCY,
      async (document) => {
        try {
          const result = await this.dispatch(document.businessId, document.id);
          this.logger.log(
            `Fiscal recovery result fiscalDocumentId=${document.id} businessId=${document.businessId} previousStatus=${document.status} result=${result?.status ?? 'UNKNOWN'}`,
          );
          return { id: document.id, result: result?.status ?? 'UNKNOWN' };
        } catch (error: any) {
          this.logger.warn(
            `Fiscal recovery failed fiscalDocumentId=${document.id} businessId=${document.businessId} previousStatus=${document.status} error=${String(error?.message ?? error)}`,
          );
          return { id: document.id, result: 'FAILED' };
        }
      },
    );

    return {
      scanned: candidates.length,
      eligible: eligible.length,
      outcomes,
    };
  }

  async configure(businessId: string, input: any) {
    const credentials = input?.credentials;
    const encryptedCredentials = credentials
      ? this.provider.encryptCredentials({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          username: credentials.username,
          password: credentials.password,
        })
      : undefined;
    return this.prisma.factusConfiguration.upsert({
      where: { businessId },
      create: {
        businessId,
        enabled: Boolean(input?.enabled),
        environment:
          input?.environment === 'production' ? 'production' : 'sandbox',
        encryptedCredentials,
        invoiceRangeId: input?.invoiceRangeId,
        creditNoteRangeId: input?.creditNoteRangeId,
        defaultPaymentForm: input?.defaultPaymentForm,
        defaultPaymentMethod: input?.defaultPaymentMethod,
      },
      update: {
        enabled: input?.enabled,
        environment:
          input?.environment === 'production' ? 'production' : 'sandbox',
        encryptedCredentials,
        invoiceRangeId: input?.invoiceRangeId,
        creditNoteRangeId: input?.creditNoteRangeId,
        defaultPaymentForm: input?.defaultPaymentForm,
        defaultPaymentMethod: input?.defaultPaymentMethod,
      },
      select: {
        id: true,
        businessId: true,
        enabled: true,
        environment: true,
        invoiceRangeId: true,
        creditNoteRangeId: true,
        defaultPaymentForm: true,
        defaultPaymentMethod: true,
        updatedAt: true,
      },
    });
  }

  async requestCreditNote(
    businessId: string,
    invoiceId: string,
    correctionConceptCode: string,
  ) {
    const invoice = await this.requireOwnedDocument(businessId, invoiceId);
    if (
      invoice.status === 'LOCAL_PERSISTENCE_FAILURE' ||
      invoice.status === 'PROCESSING'
    )
      throw new BadRequestException(
        'La factura requiere sincronizacion local antes de crear una nota credito',
      );
    if (
      invoice.type !== 'INVOICE' ||
      invoice.status !== 'VALIDATED' ||
      !invoice.factusNumber
    )
      throw new BadRequestException(
        'La factura debe estar validada antes de crear una nota crédito',
      );
    const paymentDetails = this.creditNotePaymentDetails(
      invoice.paymentSnapshot,
    );
    const existing = await this.prisma.fiscalDocument.findFirst({
      where: {
        businessId,
        parentDocumentId: invoice.id,
        type: 'CREDIT_NOTE',
      },
    });
    if (existing) return existing;
    const config = await this.prisma.factusConfiguration.findUnique({
      where: { businessId },
    });
    if (!config?.enabled)
      throw new BadRequestException(
        'Factus no esta habilitado para este negocio',
      );
    const id = randomUUID();
    const payload = {
      reference_code: `NC-${id}`,
      correction_concept_code: correctionConceptCode,
      customization_id: '20',
      bill_number: invoice.factusNumber,
      numbering_range_id: config.creditNoteRangeId ?? undefined,
      payment_details: paymentDetails,
      customer: invoice.buyerSnapshot,
      items: invoice.itemsSnapshot,
    };
    const credit = await this.prisma.$transaction(async (tx) => {
      const parentUpdated = await tx.fiscalDocument.updateMany({
        where: { id: invoice.id, businessId },
        data: { reversalRequestedAt: new Date() },
      });
      if (!parentUpdated.count)
        throw new NotFoundException('Documento fiscal no encontrado');
      return tx.fiscalDocument.create({
        data: {
          id,
          businessId,
          orderId: invoice.orderId,
          parentDocumentId: invoice.id,
          type: 'CREDIT_NOTE',
          sequenceScope: `CREDIT-${invoice.id}`,
          referenceCode: payload.reference_code,
          sellerSnapshot: invoice.sellerSnapshot ?? Prisma.JsonNull,
          buyerSnapshot: invoice.buyerSnapshot,
          itemsSnapshot: invoice.itemsSnapshot,
          taxSnapshot: invoice.taxSnapshot,
          paymentSnapshot: invoice.paymentSnapshot,
          payloadSnapshot: payload as Prisma.InputJsonValue,
          fiscalFingerprint: this.fingerprint(payload),
          total: invoice.total,
        },
      });
    });
    void this.dispatch(businessId, credit.id).catch(() => undefined);
    return credit;
  }

  async retry(businessId: string, id: string) {
    const document = await this.requireOwnedDocument(businessId, id);
    if (
      !['PENDING', 'RETRYABLE_FAILURE', 'SUBMITTED_PENDING_DIAN'].includes(
        document.status,
      )
    )
      throw new BadRequestException(
        'El documento no puede reintentarse en su estado actual',
      );
    return this.dispatch(businessId, id);
  }

  async dispatch(businessId: string, id: string) {
    await this.requireOwnedDocument(businessId, id);
    await this.assertInvoiceTaxTraceabilityBeforeDispatch(businessId, id);
    const claimed = await this.prisma.fiscalDocument.updateMany({
      where: {
        id,
        businessId,
        status: {
          in: ['PENDING', 'RETRYABLE_FAILURE', 'SUBMITTED_PENDING_DIAN'],
        },
      },
      data: { status: 'PROCESSING' },
    });
    if (!claimed.count) {
      const current = await this.prisma.fiscalDocument.findFirst({
        where: { id, businessId },
      });
      if (!current)
        throw new NotFoundException('Documento fiscal no encontrado');
      return current;
    }
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id, businessId },
      include: { business: { include: { factusConfiguration: true } } },
    });
    if (!document)
      throw new NotFoundException('Documento fiscal no encontrado');
    const attempt = await this.prisma.fiscalDocumentAttempt.create({
      data: {
        fiscalDocumentId: id,
        requestPayload: document.payloadSnapshot as Prisma.InputJsonValue,
      },
    });
    let updated: any;
    let configuration: any;
    let credentials: any;
    let shouldPersistArtifacts = false;
    let acceptedProviderResult:
      | { response: any; data: any; payload: Record<string, unknown>; dianValidatedAt: Date | null }
      | undefined;
    try {
      configuration = document.business.factusConfiguration;
      if (!configuration?.enabled || !configuration.encryptedCredentials)
        throw new BadRequestException(
          'Factus no esta configurado para este negocio',
        );
      credentials = this.provider.decryptCredentials(
        configuration.encryptedCredentials,
      );
      const payload = {
        ...(document.payloadSnapshot as Record<string, unknown>),
        reference_code: document.referenceCode,
      };
      const response =
        document.type === 'INVOICE'
          ? await this.provider.validateInvoice(
              businessId,
              configuration.environment,
              credentials,
              payload,
            )
          : await this.provider.validateCreditNote(
              businessId,
              configuration.environment,
              credentials,
              payload,
            );
      const data = response.data ?? response;
      const validated = Boolean(data.is_validated);
      const nextStatus: FiscalDocumentStatus = validated
        ? 'VALIDATED'
        : 'SUBMITTED_PENDING_DIAN';
      const dianValidatedAt = this.parseValidatedAt(
        data.validated_at,
        document.id,
        document.referenceCode,
      );
      if (validated) {
        acceptedProviderResult = { response, data, payload, dianValidatedAt };
      }
      updated = await this.prisma.$transaction(async (tx) => {
        await tx.fiscalDocumentAttempt.updateMany({
          where: { id: attempt.id, fiscalDocumentId: id },
          data: {
            result: 'SUCCEEDED',
            httpStatus: 201,
            requestPayload: payload as Prisma.InputJsonValue,
            responsePayload: response as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        const changed = await tx.fiscalDocument.updateMany({
          where: { id, businessId },
          data: {
            status: nextStatus,
            factusNumber: data.number ?? null,
            cufeOrCude: data.cufe ?? data.cude ?? null,
            dianValidatedAt,
            providerResponse: response as Prisma.InputJsonValue,
            providerErrors: data.errors ?? undefined,
          },
        });
        if (!changed.count)
          throw new NotFoundException('Documento fiscal no encontrado');
        return tx.fiscalDocument.findFirst({ where: { id, businessId } });
      });
      shouldPersistArtifacts = validated && Boolean(data.number);
    } catch (error: any) {
      if (acceptedProviderResult) {
        const fallback = await this.persistAcceptedProviderFailure(
          businessId,
          id,
          attempt.id,
          acceptedProviderResult,
          error,
        );
        if (fallback) return fallback;
        // The claim remains PROCESSING when even the fallback cannot reach the
        // database. PROCESSING is deliberately not retryable automatically.
        this.logger.error(
          `Fiscal accepted response could not be persisted fiscalDocumentId=${id} businessId=${businessId} referenceCode=${document.referenceCode} error=${this.errorSummary(error)}`,
        );
        throw error;
      }
      const status = Number(error?.status ?? 0);
      const retryable =
        status === 0 ||
        status === 401 ||
        status === 409 ||
        status === 429 ||
        status >= 500;
      await this.prisma.$transaction(async (tx) => {
        await tx.fiscalDocumentAttempt.updateMany({
          where: { id: attempt.id, fiscalDocumentId: id },
          data: {
            result: retryable ? 'RETRYABLE_FAILURE' : 'REJECTED',
            httpStatus: status || null,
            responsePayload: error?.body ?? undefined,
            errorCode: status ? String(status) : 'NETWORK',
            errorMessage: String(error?.message ?? 'Error desconocido'),
            completedAt: new Date(),
          },
        });
        const changed = await tx.fiscalDocument.updateMany({
          where: { id, businessId },
          data: {
            status: retryable ? 'RETRYABLE_FAILURE' : 'REJECTED',
            providerErrors: error?.body ?? {
              message: String(error?.message ?? 'Error desconocido'),
            },
          },
        });
        if (!changed.count)
          throw new NotFoundException('Documento fiscal no encontrado');
      });
      throw error;
    }

    // Artifact retrieval is intentionally outside the fiscal try/catch: a
    // validated DIAN result is durable even when storage is unavailable.
    if (shouldPersistArtifacts) {
      await this.persistArtifacts(updated, configuration, credentials);
    }
    return updated;
  }

  /** Reconciles a Factus response already verified out of band. It never emits. */
  async reconcileAcceptedProviderResponse(
    businessId: string,
    id: string,
    response: unknown,
  ) {
    const document = await this.requireOwnedDocument(businessId, id);
    if (!['LOCAL_PERSISTENCE_FAILURE', 'RETRYABLE_FAILURE'].includes(document.status))
      throw new BadRequestException(
        'El documento no requiere reconciliacion de una respuesta Factus aceptada',
      );
    const data = this.factusResponseData(response);
    if (
      data?.is_validated !== true ||
      data.reference_code !== document.referenceCode ||
      typeof data.number !== 'string' ||
      !data.number.trim() ||
      (typeof data.cufe !== 'string' || !data.cufe.trim()) &&
        (typeof data.cude !== 'string' || !data.cude.trim())
    )
      throw new BadRequestException(
        'La respuesta Factus verificada no coincide completamente con el documento fiscal',
      );

    const dianValidatedAt = this.parseValidatedAt(
      data.validated_at,
      document.id,
      document.referenceCode,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.fiscalDocumentAttempt.create({
        data: {
          fiscalDocumentId: document.id,
          result: 'SUCCEEDED',
          httpStatus: 201,
          requestPayload: document.payloadSnapshot as Prisma.InputJsonValue,
          responsePayload: response as Prisma.InputJsonValue,
          errorCode: 'RECONCILED_ACCEPTED_RESPONSE',
          errorMessage: 'Respuesta Factus aceptada reconciliada localmente',
          completedAt: new Date(),
        },
      });
      const changed = await tx.fiscalDocument.updateMany({
        where: {
          id: document.id,
          businessId,
          status: { in: ['LOCAL_PERSISTENCE_FAILURE', 'RETRYABLE_FAILURE'] },
        },
        data: {
          status: 'VALIDATED',
          factusNumber: data.number,
          cufeOrCude: data.cufe ?? data.cude,
          dianValidatedAt,
          providerResponse: response as Prisma.InputJsonValue,
          providerErrors: Prisma.JsonNull,
        },
      });
      if (!changed.count)
        throw new BadRequestException('El documento ya no puede reconciliarse');
      return tx.fiscalDocument.findFirst({ where: { id: document.id, businessId } });
    });

    const configuration = await this.prisma.factusConfiguration.findUnique({
      where: { businessId },
    });
    if (configuration?.enabled && configuration.encryptedCredentials && updated) {
      try {
        await this.persistArtifacts(
          updated,
          configuration,
          this.provider.decryptCredentials(configuration.encryptedCredentials),
        );
      } catch (error: any) {
        this.logger.warn(
          `Fiscal reconciliation artifacts failed fiscalDocumentId=${id} businessId=${businessId} error=${this.errorSummary(error)}`,
        );
      }
    }
    return updated;
  }

  private factusResponseData(response: any): any {
    return response?.data ?? response;
  }

  private parseValidatedAt(value: unknown, documentId: string, referenceCode: string) {
    const parsed = parseFactusDateTime(typeof value === 'string' ? value : null);
    if (value && !parsed) {
      this.logger.warn(
        `Factus validated_at is invalid fiscalDocumentId=${documentId} referenceCode=${referenceCode}`,
      );
    }
    return parsed;
  }

  private errorSummary(error: any) {
    return String(error?.message ?? error ?? 'Error desconocido').slice(0, 500);
  }

  private async persistAcceptedProviderFailure(
    businessId: string,
    id: string,
    attemptId: string,
    accepted: { response: any; data: any; payload: Record<string, unknown>; dianValidatedAt: Date | null },
    error: any,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.fiscalDocumentAttempt.updateMany({
          where: { id: attemptId, fiscalDocumentId: id },
          data: {
            result: 'LOCAL_PERSISTENCE_FAILURE',
            httpStatus: 201,
            requestPayload: accepted.payload as Prisma.InputJsonValue,
            responsePayload: accepted.response as Prisma.InputJsonValue,
            errorCode: 'LOCAL_PERSISTENCE_FAILURE',
            errorMessage: this.errorSummary(error),
            completedAt: new Date(),
          },
        });
        const changed = await tx.fiscalDocument.updateMany({
          where: { id, businessId, status: 'PROCESSING' },
          data: {
            status: 'LOCAL_PERSISTENCE_FAILURE',
            factusNumber: accepted.data.number ?? null,
            cufeOrCude: accepted.data.cufe ?? accepted.data.cude ?? null,
            dianValidatedAt: accepted.dianValidatedAt,
            providerResponse: accepted.response as Prisma.InputJsonValue,
            providerErrors: {
              kind: 'LOCAL_PERSISTENCE_FAILURE',
              message: this.errorSummary(error),
            },
          },
        });
        if (!changed.count) return null;
        return tx.fiscalDocument.findFirst({ where: { id, businessId } });
      });
    } catch (fallbackError: any) {
      this.logger.error(
        `Fiscal local persistence fallback failed fiscalDocumentId=${id} businessId=${businessId} error=${this.errorSummary(fallbackError)}`,
      );
      return null;
    }
  }

  private buildSnapshots(order: any, configuration: any) {
    const profile = order.business.taxProfile;
    if (!profile)
      throw new BadRequestException('El negocio no tiene perfil tributario');
    const fiscal = order.fiscalContext ?? order.taxSnapshot?.buyerFiscal ?? {};
    this.assertChargeTaxLinesHaveOrderItem(order.taxLines);
    const consumerFinal = !fiscal.buyerDocumentNumber;
    const buyer = consumerFinal
      ? {
          identification_document_code: '13',
          identification: '22222222222',
          names: 'Consumidor Final',
        }
      : {
          identification_document_code: this.documentCode(
            fiscal.buyerDocumentType,
          ),
          identification: fiscal.buyerDocumentNumber,
          names: fiscal.buyerType === 'NATURAL' ? fiscal.buyerName : undefined,
          company:
            fiscal.buyerType === 'JURIDICA' ? fiscal.buyerName : undefined,
          legal_organization_code: fiscal.buyerType === 'JURIDICA' ? '1' : '2',
          email: fiscal.buyerEmail,
          municipality_code: fiscal.fiscalMunicipalityCode,
        };
    const items = order.items.map((line: any) => ({
      code_reference: line.itemId,
      name: line.itemNameSnapshot,
      quantity: Number(line.quantity).toFixed(2),
      discount_rate: '0.00',
      price: Number(line.unitPrice).toFixed(2),
      unit_measure_code: line.item.factusUnitMeasureCode ?? '94',
      standard_code: line.item.factusStandardCode ?? '999',
      taxes: this.lineTaxes(order.taxLines, line),
    }));
    const payment = {
      payment_form: configuration.defaultPaymentForm ?? '1',
      payment_method_code:
        configuration.defaultPaymentMethod ??
        this.paymentMethodCode(order.paymentMethod),
      amount: this.fiscalTotal(order).toFixed(2),
    };
    const payload = {
      reference_code: undefined as string | undefined,
      document: '01',
      numbering_range_id: configuration.invoiceRangeId ?? undefined,
      operation_type: '10',
      payment_details: [payment],
      customer: buyer,
      items,
    };
    const seller = {
      nit: profile.nit,
      dv: profile.dv,
      tradeName: profile.tradeName,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      municipalityCode: profile.municipalityCode,
      departmentCode: profile.departmentCode,
      personType: profile.personType,
      responsibilities: profile.responsibilities.map(
        (entry: any) => entry.responsibility.code,
      ),
    };
    const tax = {
      internalLines: order.taxLines,
      internalSnapshot: order.taxSnapshot?.rawCalculation ?? null,
      subtotal: Number(order.fiscalContext?.subtotal ?? order.total),
      chargedTaxTotal: Number(order.fiscalContext?.chargedTaxTotal ?? 0),
      withheldTaxTotal: Number(order.fiscalContext?.withheldTaxTotal ?? 0),
      netReceived: Number(order.fiscalContext?.netReceived ?? order.total),
    };
    return {
      seller,
      buyer,
      items,
      tax,
      payment,
      payload,
      total: new Prisma.Decimal(this.fiscalTotal(order)),
    };
  }

  private lineTaxes(lines: any[], line: any) {
    return lines
      .filter(
        (tax) =>
          tax.applied &&
          tax.direction === 'CHARGE' &&
          (tax.taxType === 'IVA' || tax.taxType === 'IMPOCONSUMO') &&
          tax.orderItemId === line.id,
      )
      .map((tax) => ({
        code: tax.taxType === 'IVA' ? '01' : '04',
        rate: (Number(tax.rate) * 100).toFixed(2),
      }));
  }

  private assertChargeTaxLinesHaveOrderItem(lines: any[]) {
    const missingLineTraceability = lines.some(
      (tax) =>
        tax.applied &&
        tax.direction === 'CHARGE' &&
        (tax.taxType === 'IVA' || tax.taxType === 'IMPOCONSUMO') &&
        !tax.orderItemId,
    );
    if (missingLineTraceability) {
      throw new BadRequestException(
        'La factura tiene impuestos IVA o Impoconsumo sin trazabilidad por item de orden',
      );
    }
  }

  private async assertInvoiceTaxTraceabilityBeforeDispatch(
    businessId: string,
    id: string,
  ) {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: {
        id,
        businessId,
        type: 'INVOICE',
        status: {
          in: ['PENDING', 'RETRYABLE_FAILURE', 'SUBMITTED_PENDING_DIAN'],
        },
      },
      select: {
        order: { select: { taxLines: true } },
      },
    });
    if (document) this.assertChargeTaxLinesHaveOrderItem(document.order.taxLines);
  }

  private isRecoveryEligible(document: any, now: Date) {
    const attempts = document._count?.attempts ?? 0;
    if (attempts >= RECOVERY_MAX_ATTEMPTS) {
      this.logger.warn(
        `Fiscal recovery exhausted fiscalDocumentId=${document.id} businessId=${document.businessId} status=${document.status} attempts=${attempts}`,
      );
      return false;
    }
    if (
      document.type === 'INVOICE' &&
      document.order?.taxLines &&
      this.hasChargeTaxLinesWithoutOrderItem(document.order.taxLines)
    ) {
      this.logger.warn(
        `Fiscal recovery requires intervention fiscalDocumentId=${document.id} businessId=${document.businessId} reason=LEGACY_TAX_LINE_TRACEABILITY`,
      );
      return false;
    }
    if (document.status === 'PENDING') {
      return document.createdAt.getTime() <= now.getTime() - PENDING_RECOVERY_AGE_MS;
    }
    if (document.status !== 'RETRYABLE_FAILURE') return false;

    const latestAttempt = document.attempts?.[0];
    const completedAt = latestAttempt?.completedAt;
    if (!completedAt) return false;
    const backoff = Math.min(
      RETRY_BACKOFF_BASE_MS * 2 ** Math.max(attempts - 1, 0),
      RETRY_BACKOFF_MAX_MS,
    );
    return completedAt.getTime() + backoff <= now.getTime();
  }

  private hasChargeTaxLinesWithoutOrderItem(lines: any[]) {
    return lines.some(
      (tax) =>
        tax.applied &&
        tax.direction === 'CHARGE' &&
        (tax.taxType === 'IVA' || tax.taxType === 'IMPOCONSUMO') &&
        !tax.orderItemId,
    );
  }

  private async runWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    worker: (value: T) => Promise<R>,
  ) {
    const results: R[] = [];
    let next = 0;
    const run = async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await worker(values[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, values.length) }, run),
    );
    return results;
  }

  private async requireOwnedDocument(businessId: string, id: string) {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id, businessId },
    });
    if (!document)
      throw new NotFoundException('Documento fiscal no encontrado');
    return document;
  }
  private fiscalTotal(order: any) {
    return (
      Number(order.fiscalContext?.subtotal ?? order.total) +
      Number(order.fiscalContext?.chargedTaxTotal ?? 0)
    );
  }
  private paymentMethodCode(method: string) {
    return method === 'BANK_TRANSFER' ? '42' : '10';
  }
  private documentCode(type?: string) {
    return (
      (
        { NIT: '31', CC: '13', CE: '21', PASAPORTE: '41', TI: '12' } as Record<
          string,
          string
        >
      )[type ?? 'CC'] ?? '13'
    );
  }
  private fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private creditNotePaymentDetails(paymentSnapshot: unknown) {
    if (
      !paymentSnapshot ||
      typeof paymentSnapshot !== 'object' ||
      Array.isArray(paymentSnapshot)
    ) {
      throw new BadRequestException(
        'La factura validada no tiene un snapshot de pago válido para crear la nota crédito',
      );
    }
    const snapshot = paymentSnapshot as Record<string, unknown>;
    const fields = ['amount', 'payment_form', 'payment_method_code'] as const;
    if (
      fields.some(
        (field) =>
          typeof snapshot[field] !== 'string' || !snapshot[field].trim(),
      )
    ) {
      throw new BadRequestException(
        'La factura validada tiene un snapshot de pago incompleto para crear la nota crédito',
      );
    }
    return [
      {
        amount: snapshot.amount,
        payment_form: snapshot.payment_form,
        payment_method_code: snapshot.payment_method_code,
      },
    ];
  }

  private async persistArtifacts(
    document: any,
    configuration: any,
    credentials: any,
  ) {
    for (const kind of ['pdf', 'xml'] as const) {
      try {
        const artifact = await this.provider.download(
          document.businessId,
          configuration.environment,
          credentials,
          document.factusNumber,
          kind,
          document.type,
        );
        const bytes = this.decodeArtifactBase64(artifact.base64, kind);
        const objectKey = `fiscal-documents/${document.businessId}/${document.id}/${kind}.${kind}`;
        await this.storage.uploadObject({
          objectKey,
          body: bytes,
          contentType: artifact.contentType,
        });
        await this.prisma.fiscalDocumentArtifact.upsert({
          where: {
            fiscalDocumentId_kind: { fiscalDocumentId: document.id, kind },
          },
          create: {
            fiscalDocumentId: document.id,
            kind,
            objectKey,
            checksum: createHash('sha256').update(bytes).digest('hex'),
            sizeBytes: bytes.length,
          },
          update: {},
        });
        this.logger.log(
          `Fiscal artifact persisted documentId=${document.id} businessId=${document.businessId} factusNumber=${document.factusNumber} kind=${kind} sizeBytes=${bytes.length}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Fiscal artifact persistence failed documentId=${document.id} businessId=${document.businessId} factusNumber=${document.factusNumber} kind=${kind} error=${String(error?.message ?? error)}`,
        );
      }
    }
  }

  private decodeArtifactBase64(encoded: string, kind: 'pdf' | 'xml') {
    if (typeof encoded !== 'string' || !encoded.trim())
      throw new Error(`Factus ${kind} artifact Base64 is empty`);
    const withoutDataUri = encoded.trim().replace(/^data:[^;,]+;base64,/i, '');
    const compact = withoutDataUri.replace(/\s/g, '');
    if (
      !compact ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(compact) ||
      compact.length % 4 === 1
    ) {
      throw new Error(`Factus ${kind} artifact Base64 is invalid`);
    }
    const padded = compact + '='.repeat((4 - (compact.length % 4)) % 4);
    const bytes = Buffer.from(padded, 'base64');
    if (!bytes.length)
      throw new Error(`Factus ${kind} artifact decoded to an empty file`);
    return bytes;
  }
}
