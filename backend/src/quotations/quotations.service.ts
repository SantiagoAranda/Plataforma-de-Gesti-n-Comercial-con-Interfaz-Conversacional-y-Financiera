import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { isPriceHidden } from '../items/item-public-view';
import { PrismaService } from '../prisma/prisma.service';
import { TaxPreviewDto } from '../tax/dto/tax-preview.dto';
import { TaxService } from '../tax/tax.service';
import {
  CreateQuotationDto,
  QuotationLineDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';

const DAY_MS = 86_400_000;
const DEFAULT_VALIDITY_DAYS = 15;
const MAX_LIST = 200;

export type QuotationAction = 'send' | 'accept' | 'reject' | 'cancel';

type Db = Prisma.TransactionClient | PrismaService;
type QuotationRow = Prisma.QuotationGetPayload<{ include: { items: true } }>;
type Line = {
  itemId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal | null;
};

export const quotationLabel = (number: number) =>
  `COT-${String(number).padStart(4, '0')}`;

const conflict = (code: string, message: string, extra: object = {}) =>
  new ConflictException({ code, message, ...extra });

const clean = (value: string | null | undefined) => value?.trim() || null;

/**
 * Cotizaciones: documento comercial sin efectos en inventario, contabilidad, impuestos
 * fiscales ni Factus. Ver docs/cotizaciones/contrato-cotizaciones.md.
 */
@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly taxService?: TaxService,
  ) {}

  private now() {
    return new Date();
  }

  async create(
    businessId: string,
    dto: CreateQuotationDto,
    origin: 'MANUAL' | 'PUBLIC_STORE' = 'MANUAL',
  ) {
    const lines = await this.resolveLines(this.prisma, businessId, dto.items);
    const keyHash = dto.idempotencyKey
      ? createHash('sha256')
          .update(`${businessId}:${dto.idempotencyKey}`)
          .digest('hex')
      : null;
    const fingerprint = keyHash ? this.fingerprint(dto) : null;

    // La recuperación va antes de cualquier validación nueva: el reintento devuelve lo ya creado.
    if (keyHash) {
      const previous = await this.prisma.quotation.findUnique({
        where: {
          businessId_requestKeyHash: { businessId, requestKeyHash: keyHash },
        },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      if (previous) return this.replay(previous, fingerprint);
    }

    const totals = await this.totals(businessId, lines);
    const validityDays = dto.validityDays ?? DEFAULT_VALIDITY_DAYS;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // El consecutivo se calcula bajo un candado por negocio: sin saltos ni repeticiones.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quotation:${businessId}`}, 0))`;
        const last = await tx.quotation.findFirst({
          where: { businessId },
          orderBy: { number: 'desc' },
          select: { number: true },
        });
        return tx.quotation.create({
          data: {
            businessId,
            number: (last?.number ?? 0) + 1,
            origin,
            customerName: clean(dto.customerName),
            customerWhatsapp: clean(dto.customerWhatsapp),
            customerEmail: clean(dto.customerEmail),
            customerDocument: clean(dto.customerDocument),
            note: clean(dto.note),
            validityDays,
            validUntil: new Date(this.now().getTime() + validityDays * DAY_MS),
            ...totals,
            requestKeyHash: keyHash,
            requestFingerprint: fingerprint,
            items: { create: this.itemRows(lines) },
          },
          include: { items: { orderBy: { position: 'asc' } } },
        });
      });
      return this.serialize(row);
    } catch (error) {
      if (keyHash && this.isKeyCollision(error)) {
        const concurrent = await this.prisma.quotation.findUnique({
          where: {
            businessId_requestKeyHash: { businessId, requestKeyHash: keyHash },
          },
          include: { items: { orderBy: { position: 'asc' } } },
        });
        if (concurrent) return this.replay(concurrent, fingerprint);
      }
      throw error;
    }
  }

  async findAll(businessId: string, status?: QuotationStatus) {
    const rows = await this.prisma.quotation.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { number: 'desc' },
      take: MAX_LIST,
      include: { items: { orderBy: { position: 'asc' } } },
    });
    return rows.map((row) => this.serialize(row));
  }

  async findOne(businessId: string, id: string) {
    return this.serialize(await this.load(this.prisma, businessId, id));
  }

  /** Consulta pública por el token (UUID no adivinable): el cliente ve su cotización sin iniciar sesión. */
  async findByPublicToken(token: string) {
    const row = await this.prisma.quotation.findUnique({
      where: { publicToken: token },
      include: {
        items: { orderBy: { position: 'asc' } },
        business: { select: { name: true, fiscalId: true, phoneWhatsapp: true } },
      },
    });
    if (!row) throw new NotFoundException('Cotización no encontrada');
    const { business, ...quotation } = row;
    return { quotation: this.serialize(quotation), business };
  }

  /** Solo cotizaciones OPEN. Editar una ya enviada la devuelve a «no enviada». */
  async update(businessId: string, id: string, dto: UpdateQuotationDto) {
    const lines = dto.items
      ? await this.resolveLines(this.prisma, businessId, dto.items)
      : null;
    const totals = lines ? await this.totals(businessId, lines) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockRow(tx, businessId, id);
      const current = await this.load(tx, businessId, id);
      if (current.status !== 'OPEN') {
        throw conflict(
          'QUOTATION_NOT_EDITABLE',
          'Solo se pueden editar cotizaciones vigentes',
          { status: current.status },
        );
      }
      if (lines) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      }
      return tx.quotation.update({
        where: { id },
        data: {
          ...(dto.customerName !== undefined && {
            customerName: clean(dto.customerName),
          }),
          ...(dto.customerWhatsapp !== undefined && {
            customerWhatsapp: clean(dto.customerWhatsapp),
          }),
          ...(dto.customerEmail !== undefined && {
            customerEmail: clean(dto.customerEmail),
          }),
          ...(dto.customerDocument !== undefined && {
            customerDocument: clean(dto.customerDocument),
          }),
          ...(dto.note !== undefined && { note: clean(dto.note) }),
          ...(dto.validityDays !== undefined && {
            validityDays: dto.validityDays,
            validUntil: new Date(
              this.now().getTime() + dto.validityDays * DAY_MS,
            ),
          }),
          ...(totals ?? {}),
          ...(lines && { items: { create: this.itemRows(lines) } }),
          sentAt: null,
        },
        include: { items: { orderBy: { position: 'asc' } } },
      });
    });
    return this.serialize(row);
  }

  /** send | accept | reject | cancel. Repetir la misma acción devuelve el estado actual sin escribir. */
  async transition(businessId: string, id: string, action: QuotationAction) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockRow(tx, businessId, id);
      const current = await this.load(tx, businessId, id);
      const now = this.now();
      const expired = this.isExpired(current, now);
      const fail = () =>
        conflict(
          'QUOTATION_INVALID_TRANSITION',
          'La acción no es válida para el estado actual de la cotización',
          { status: current.status, action },
        );

      const data: Prisma.QuotationUpdateInput = {};
      switch (action) {
        case 'send':
          if (current.status !== 'OPEN') throw fail();
          if (expired) throw this.expiredError();
          if (current.sentAt) return current;
          data.sentAt = now;
          break;
        case 'accept':
          if (current.status === 'ACCEPTED') return current;
          if (current.status !== 'OPEN') throw fail();
          if (expired) throw this.expiredError();
          Object.assign(data, { status: 'ACCEPTED', acceptedAt: now });
          break;
        case 'reject':
          if (current.status === 'REJECTED') return current;
          if (current.status !== 'OPEN') throw fail();
          Object.assign(data, { status: 'REJECTED', rejectedAt: now });
          break;
        case 'cancel':
          if (current.status === 'CANCELLED') return current;
          if (current.status !== 'OPEN' && current.status !== 'ACCEPTED')
            throw fail();
          Object.assign(data, { status: 'CANCELLED', cancelledAt: now });
          break;
      }
      return tx.quotation.update({
        where: { id },
        data,
        include: { items: { orderBy: { position: 'asc' } } },
      });
    });
    return this.serialize(row);
  }

  // ---------------------------------------------------------------- helpers

  private expiredError() {
    return conflict(
      'QUOTATION_EXPIRED',
      'La cotización está vencida. Edita su vigencia para reactivarla',
    );
  }

  private isExpired(
    row: Pick<QuotationRow, 'status' | 'validUntil'>,
    now: Date,
  ) {
    return row.status === 'OPEN' && row.validUntil.getTime() < now.getTime();
  }

  private async lockRow(
    tx: Prisma.TransactionClient,
    businessId: string,
    id: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "Quotation" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
  }

  private async load(db: Db, businessId: string, id: string) {
    const row = await db.quotation.findFirst({
      where: { id, businessId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'QUOTATION_NOT_FOUND',
        message: 'Cotización no encontrada',
      });
    }
    return row;
  }

  private async resolveLines(
    db: Db,
    businessId: string,
    inputs: QuotationLineDto[],
  ): Promise<Line[]> {
    const ids = [
      ...new Set(inputs.map((i) => i.itemId).filter(Boolean)),
    ] as string[];
    const items = ids.length
      ? await db.item.findMany({
          where: { id: { in: ids }, businessId, status: 'ACTIVE' },
        })
      : [];
    const byId = new Map(items.map((item) => [item.id, item]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new BadRequestException({
        code: 'QUOTATION_ITEM_NOT_FOUND',
        message: 'Hay productos que no existen o no están activos',
        itemIds: missing,
      });
    }

    return inputs.map((input) => {
      const item = input.itemId ? byId.get(input.itemId) : null;
      const name = clean(input.name) ?? item?.name ?? null;
      if (!name) {
        throw new BadRequestException({
          code: 'QUOTATION_LINE_NAME_REQUIRED',
          message: 'Cada línea necesita un producto o un nombre',
        });
      }
      // undefined = precio del catálogo; null = «consultar precio». El producto con precio oculto nunca se cotiza con su precio interno.
      const unitPrice =
        input.unitPrice === undefined
          ? item && !isPriceHidden(item)
            ? new Prisma.Decimal(item.price)
            : null
          : input.unitPrice === null
            ? null
            : new Prisma.Decimal(input.unitPrice);
      return {
        itemId: item?.id ?? null,
        name,
        description:
          clean(input.description) ??
          (item?.includeInQuotation ? clean(item.quotationDescription) : null),
        quantity: input.quantity,
        unitPrice,
      };
    });
  }

  private itemRows(lines: Line[]) {
    return lines.map((line, position) => ({ ...line, position }));
  }

  /** Subtotal con las líneas que tienen precio; el IVA es un estimado y nunca bloquea la cotización. */
  private async totals(businessId: string, lines: Line[]) {
    const subtotal = lines.reduce(
      (sum, l) => (l.unitPrice ? sum.add(l.unitPrice.mul(l.quantity)) : sum),
      new Prisma.Decimal(0),
    );
    const taxTotal = await this.estimateTax(businessId, lines);
    return { subtotal, taxTotal, total: subtotal.add(taxTotal) };
  }

  private async estimateTax(businessId: string, lines: Line[]) {
    const cartItems = lines
      .filter((l) => l.itemId && l.unitPrice)
      .map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
      }));
    const zero = new Prisma.Decimal(0);
    if (!this.taxService || !cartItems.length) return zero;
    try {
      // Consumidor final: sin retenciones; solo interesa lo que se cobra al comprador.
      const preview = await this.taxService.calculateTaxPreview(businessId, {
        buyerIsIvaResponsable: false,
        buyerIsRetenedor: false,
        buyerIsGranContribuyente: false,
        buyerIsAutorretenedor: false,
        buyerIsRegimenSimple: false,
        cartItems,
      } as TaxPreviewDto);
      return new Prisma.Decimal(preview.vatTotal ?? 0).add(
        preview.impoconsumoTotal ?? 0,
      );
    } catch {
      return zero;
    }
  }

  private fingerprint(dto: CreateQuotationDto) {
    return createHash('sha256')
      .update(
        JSON.stringify([
          dto.customerName,
          dto.customerWhatsapp,
          dto.customerEmail,
          dto.customerDocument,
          dto.note,
          dto.validityDays,
          dto.items.map((i) => [
            i.itemId,
            i.name,
            i.description,
            i.quantity,
            i.unitPrice,
          ]),
        ]),
      )
      .digest('hex');
  }

  private replay(row: QuotationRow, fingerprint: string | null) {
    if (row.requestFingerprint !== fingerprint) {
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'La clave de idempotencia ya se usó con otro contenido',
      );
    }
    return this.serialize(row);
  }

  private isKeyCollision(error: unknown) {
    const e = error as { code?: string; meta?: { target?: unknown } };
    const target = e?.meta?.target;
    const fields = Array.isArray(target)
      ? target.join(',')
      : typeof target === 'string'
        ? target
        : '';
    return e?.code === 'P2002' && fields.includes('requestKeyHash');
  }

  /** Vista del dueño. Nunca expone la clave ni la huella de idempotencia. */
  private serialize(row: QuotationRow) {
    const now = this.now();
    return {
      id: row.id,
      publicToken: row.publicToken,
      number: row.number,
      displayNumber: quotationLabel(row.number),
      status: row.status,
      expired: this.isExpired(row, now),
      origin: row.origin,
      customer: {
        name: row.customerName,
        whatsapp: row.customerWhatsapp,
        email: row.customerEmail,
        document: row.customerDocument,
      },
      note: row.note,
      validityDays: row.validityDays,
      validUntil: row.validUntil,
      sentAt: row.sentAt,
      acceptedAt: row.acceptedAt,
      rejectedAt: row.rejectedAt,
      cancelledAt: row.cancelledAt,
      convertedAt: row.convertedAt,
      subtotal: Number(row.subtotal),
      taxTotal: Number(row.taxTotal),
      total: Number(row.total),
      currency: row.currency,
      items: row.items.map((i) => ({
        id: i.id,
        itemId: i.itemId,
        name: i.name,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice === null ? null : Number(i.unitPrice),
        lineTotal:
          i.unitPrice === null ? null : Number(i.unitPrice.mul(i.quantity)),
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
