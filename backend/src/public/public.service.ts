import { reservationTransitionBlock, lifecycleConflict, cancellationReason, isPolicyV2, newReservationPolicy } from '../reservations/reservation-lifecycle';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreatePublicReservationDto } from './dto/create-public-reservation.dto';
import { CreatePublicQuotationDto } from './dto/create-public-quotation.dto';
import { QuotationsService } from '../quotations/quotations.service';
import { IngredientStatus, Prisma } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util';
import { StorageService } from '../storage/storage.service';
import { InventoryService } from '../inventory/inventory.service';
import { ItemOptionsService } from '../item-options/item-options.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { isIngredientOperational } from '../ingredients/ingredient-operational';
import { TaxService } from '../tax/tax.service';
import {
  AvailabilityService,
  RESERVATION_ERRORS,
  toBookingConflict,
} from '../availability/availability.service';
import { TaxPreviewDto } from '../tax/dto/tax-preview.dto';
import {
  assertNoHiddenPrices,
  publicItemPrice,
  toPublicItem,
} from '../items/item-public-view';
import { FeatureFlagsService } from '../common/config/feature-flags';
import { getFactusMunicipalities } from '../settings/factus-municipalities.catalog';

/** Constant-time token check; legacy rows without a token can never match. */
export function publicTokenMatches(
  expected: string | null | undefined,
  provided: string | null | undefined,
) {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A booking-attempt key only replays its own response for this long; afterwards it is no
// credential at all (no token, no data, no new booking).
export const PUBLIC_RESERVATION_REPLAY_WINDOW_MS = 15 * 60 * 1000;
// The only reservation fields a public caller ever receives back. Never key hash/fingerprint.
const PUBLIC_RESERVATION_RESULT = {
  id: true,
  publicToken: true,
  status: true,
  date: true,
  startMinute: true,
  endMinute: true,
  createdAt: true,
  publicRequestFingerprint: true,
} as const;

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
    status: IngredientStatus;
    deletedAt: Date | null;
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

const FOOTER_LOGO_META_TYPE = 'footer_logo';
const LOCATION_SHOW_META_TYPE = 'location_show';
const LOCATION_LABEL_META_TYPE = 'location_label';
const LOCATION_URL_META_TYPE = 'location_url';
const FOOTER_BACKGROUND_COLOR_META_TYPE = 'footer_background_color';
const FOOTER_TEXT_COLOR_META_TYPE = 'footer_text_color';
const FOOTER_META_TYPES = new Set([
  FOOTER_LOGO_META_TYPE,
  LOCATION_SHOW_META_TYPE,
  LOCATION_LABEL_META_TYPE,
  LOCATION_URL_META_TYPE,
  FOOTER_BACKGROUND_COLOR_META_TYPE,
  FOOTER_TEXT_COLOR_META_TYPE,
]);

function getFooterMetaValue(socials: unknown, type: string): string | null {
  if (!Array.isArray(socials)) return null;
  const found = socials.find(
    (social) =>
      social &&
      typeof social === 'object' &&
      (social as Record<string, unknown>).type === type,
  );
  const value = found ? (found as Record<string, unknown>).value : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function removeFooterMeta(socials: unknown) {
  return Array.isArray(socials)
    ? socials.filter((social) => {
        if (!social || typeof social !== 'object') return true;
        const type = (social as Record<string, unknown>).type;
        return typeof type !== 'string' || !FOOTER_META_TYPES.has(type);
      })
    : [];
}

function getFooterColorMetaValue(
  socials: unknown,
  type: string,
): string | null {
  const value = getFooterMetaValue(socials, type);
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function normalizePublicFooterSettings(settings: unknown) {
  if (!settings || typeof settings !== 'object') return settings;
  const record = settings as Record<string, unknown>;
  const socials = record.socials;

  return {
    ...record,
    socials: removeFooterMeta(socials),
    showLogo: getFooterMetaValue(socials, FOOTER_LOGO_META_TYPE) === 'true',
    showLocationButton:
      getFooterMetaValue(socials, LOCATION_SHOW_META_TYPE) === 'true',
    locationLabel: getFooterMetaValue(socials, LOCATION_LABEL_META_TYPE),
    googleMapsUrl: getFooterMetaValue(socials, LOCATION_URL_META_TYPE),
    footerBackgroundColor: getFooterColorMetaValue(
      socials,
      FOOTER_BACKGROUND_COLOR_META_TYPE,
    ),
    footerTextColor: getFooterColorMetaValue(
      socials,
      FOOTER_TEXT_COLOR_META_TYPE,
    ),
  };
}

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private inventoryService: InventoryService,
    private itemOptionsService: ItemOptionsService,
    @Optional()
    private pushNotificationsService?: PushNotificationsService,
    @Optional()
    private taxService?: TaxService,
    @Optional()
    private featureFlags: FeatureFlagsService = {
      simpleRegimeSalesEnabled: true,
      simpleRegimeTaxModuleEnabled: false,
    } as FeatureFlagsService,
    @Optional()
    private availability: AvailabilityService = new AvailabilityService(prisma),
    @Optional()
    private quotationsService?: QuotationsService,
  ) {}

  // Single resolver for every public :slug route: current slug or a historical alias in
  // BusinessSlug (exact first, then legacy normalization). Only the owner's active record matches.
  private async resolveActiveBusinessId(slug: string) {
    const match = (candidate: string) => this.prisma.business.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ slug: candidate }, { slugs: { some: { slug: candidate } } }],
      },
      select: { id: true },
    });
    let business = await match(slug);
    if (!business) {
      const normalized = await generateSlug(slug);
      if (normalized !== slug) business = await match(normalized);
    }
    return business?.id ?? null;
  }

  private async findActiveBusiness(slug: string) {
    const id = await this.resolveActiveBusinessId(slug);
    const business = id
      ? await this.prisma.business.findFirst({ where: { id, status: 'ACTIVE' } })
      : null;
    if (!business) throw new BadRequestException('Business not found');
    return business;
  }

  /** Canonical store identity for redirects and metadata; null when missing or inactive. */
  async resolveStore(slug: string) {
    const id = await this.resolveActiveBusinessId(slug);
    const business = id
      ? await this.prisma.business.findFirst({
          where: { id, status: 'ACTIVE' },
          select: { slug: true, name: true, logoUrl: true, logoObjectKey: true },
        })
      : null;
    if (!business) return null;
    const { logoObjectKey: _logoObjectKey, ...store } = this.withPublicLogoUrl(business);
    return store;
  }

  private normalizeBuyerFiscalContext(
    value: CreatePublicOrderDto['buyerFiscalContext'] | undefined,
  ) {
    return {
      buyerType: value?.buyerType ?? 'NATURAL',
      // The commercial contact name alone does not declare a fiscal buyer.
      buyerName: value?.buyerName?.trim() || null,
      buyerDocumentType: value?.buyerDocumentType,
      buyerDocumentNumber: value?.buyerDocumentNumber?.trim() || null,
      buyerEmail: value?.buyerEmail?.trim() || null,
      buyerIsIvaResponsable: Boolean(value?.buyerIsIvaResponsable),
      buyerIsRetenedor: Boolean(value?.buyerIsRetenedor),
      buyerIsGranContribuyente: Boolean(value?.buyerIsGranContribuyente),
      buyerIsAutorretenedor: Boolean(value?.buyerIsAutorretenedor),
      buyerIsRegimenSimple: Boolean(value?.buyerIsRegimenSimple),
      buyerRequiresElectronicInvoice: Boolean(
        value?.buyerRequiresElectronicInvoice,
      ),
      withholdingSubjectIsDeclarante:
        value?.withholdingSubjectIsDeclarante ?? true,
      fiscalMunicipalityCode: value?.fiscalMunicipalityCode ?? null,
      reteIcaRateOverride: value?.reteIcaRateOverride ?? value?.icaRateOverride,
      saleConcept: value?.saleConcept ?? 'GOODS',
    };
  }

  private async getFiscalSettingsForBusiness(businessId: string) {
    const [profile, factusConfiguration] = await Promise.all([
      this.prisma.businessTaxProfile.findUnique({
        where: { businessId },
        include: {
          responsibilities: { include: { responsibility: true } },
        },
      }),
      this.prisma.factusConfiguration.findUnique({
        where: { businessId },
        select: { enabled: true },
      }),
    ]);
    const hasElectronicInvoicerResponsibility = Boolean(
      profile?.responsibilities?.some(
        (entry) => entry.responsibility.code === '52',
      ),
    );

    return {
      fiscalContextEnabled: profile?.taxSettingsEnabled === true,
      electronicInvoicingEnabled:
        profile?.taxSettingsEnabled === true &&
        hasElectronicInvoicerResponsibility &&
        factusConfiguration?.enabled === true,
      simpleRegimeSalesEnabled:
        this.featureFlags.simpleRegimeSalesEnabled === true,
    };
  }

  async getFiscalSettings(slug: string) {
    const business = await this.findActiveBusiness(slug);
    return this.getFiscalSettingsForBusiness(business.id);
  }


  async getFiscalMunicipalities(slug: string) {
    await this.findActiveBusiness(slug);
    return getFactusMunicipalities();
  }

  async calculateTaxPreview(slug: string, dto: TaxPreviewDto) {
    const business = await this.findActiveBusiness(slug);
    if (!this.taxService) {
      throw new BadRequestException('Tax preview is not available');
    }
    // Without a client unitPrice the preview prices lines with Item.price:
    // hidden prices and hidden items must never reach it from the public store.
    const restricted = await this.prisma.item.findMany({
      where: {
        id: { in: (dto.cartItems ?? []).map((line) => line.itemId) },
        businessId: business.id,
        OR: [{ visibleInCatalog: false }, { publishWithoutPrice: true }],
      },
      select: { id: true, visibleInCatalog: true, publishWithoutPrice: true },
    });
    if (restricted.some((item) => item.visibleInCatalog === false)) {
      throw new BadRequestException('Invalid items');
    }
    assertNoHiddenPrices(restricted);
    return this.taxService.calculateTaxPreview(business.id, dto);
  }

  private publicOrderFingerprint(dto: CreatePublicOrderDto) {
    const normalized = {
      customerName: dto.customerName.trim(),
      customerWhatsapp: dto.customerWhatsapp.trim(),
      note: dto.note?.trim() || null,
      paymentMethod: dto.paymentMethod ?? 'CASH',
      items: dto.items
        .map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          excludedOptionalIngredientIds: [
            ...(item.excludedOptionalIngredientIds ?? []),
          ].sort(),
          optionSelections: [...(item.optionSelections ?? [])].sort((a, b) =>
            `${a.groupId}:${a.optionId}:${a.action}`.localeCompare(
              `${b.groupId}:${b.optionId}:${b.action}`,
            ),
          ),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    };
    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('base64url');
  }

  private idempotentPublicOrderResponse(
    order: {
      publicToken: string;
      publicRequestFingerprint: string | null;
    },
    fingerprint: string,
  ) {
    if (order.publicRequestFingerprint !== fingerprint) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        message: 'La clave de idempotencia ya fue utilizada con otro contenido',
      });
    }
    return { message: 'Order created', orderId: order.publicToken };
  }

  private publicReservationKeyHash(businessId: string, key: string) {
    return createHash('sha256').update(`${businessId}:${key}`).digest('hex');
  }

  private publicReservationFingerprint(dto: CreatePublicReservationDto) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          itemId: dto.itemId,
          date: dto.date,
          startMinute: dto.startMinute,
          endMinute: dto.endMinute ?? null,
          customerName: dto.customerName.trim(),
          customerWhatsapp: dto.customerWhatsapp.trim(),
        }),
      )
      .digest('hex');
  }

  /** Single replay rule for every lookup path (pre-check and post-P2002 re-read). */
  private resolvePublicReservationReplay(
    row: { createdAt: Date; publicRequestFingerprint: string | null } & Record<string, any>,
    fingerprint: string,
    now = Date.now(),
  ) {
    if (row.publicRequestFingerprint !== fingerprint) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        message: 'La clave de idempotencia ya fue utilizada con otro contenido',
      });
    }
    if (now - row.createdAt.getTime() > PUBLIC_RESERVATION_REPLAY_WINDOW_MS) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'IDEMPOTENCY_KEY_EXPIRED',
        message: 'Este intento de reserva ya no es válido. Iniciá una nueva reserva.',
      });
    }
    return this.publicReservationResult(row);
  }

  private publicReservationResult(row: Record<string, any>) {
    const { publicRequestFingerprint: _omit, ...result } = row;
    return result;
  }

  private isPublicOrderIdempotencyConflict(error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return (
        target.length === 2 &&
        target.includes('businessId') &&
        target.includes('publicRequestId')
      );
    }
    if (typeof target !== 'string') return false;
    if (target === 'Order_businessId_publicRequestId_key') return true;
    const fields = target
      .replace(/[()[\]"'`]/g, '')
      .split(/[\s,]+/)
      .filter(Boolean);
    return (
      fields.length === 2 &&
      fields.includes('businessId') &&
      fields.includes('publicRequestId')
    );
  }

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
                let availabilityStatus:
                  | 'AVAILABLE'
                  | 'OUT_OF_STOCK'
                  | 'UNAVAILABLE' = 'AVAILABLE';
                if (option.targetType === 'INGREDIENT') {
                  const currentStock =
                    option.ingredient?.currentStock == null
                      ? 0
                      : Number(option.ingredient.currentStock);
                  const structurallyAvailable =
                    option.ingredient != null &&
                    isIngredientOperational(option.ingredient);
                  hasStock =
                    structurallyAvailable && currentStock >= requiredQty;
                  availabilityStatus = !structurallyAvailable
                    ? 'UNAVAILABLE'
                    : hasStock
                      ? 'AVAILABLE'
                      : 'OUT_OF_STOCK';
                } else if (option.targetType === 'ITEM') {
                  hasStock =
                    optionSellabilityById.get(option.id)?.sellable ?? false;
                  availabilityStatus = hasStock ? 'AVAILABLE' : 'OUT_OF_STOCK';
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
                    ? {
                        id: option.ingredient.id,
                        name: option.ingredient.name,
                        status: option.ingredient.status,
                        deletedAt: option.ingredient.deletedAt,
                      }
                    : null,
                  item: option.item,
                  unit: option.unit,
                  hasStock,
                  availabilityStatus,
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

  /* =====================================================
     ITEMS
  ===================================================== */

  async listPublicItems(slug: string, type?: string) {
    const businessId = await this.resolveActiveBusinessId(slug);
    const business = businessId
      ? await this.prisma.business.findFirst({
          where: { id: businessId, status: 'ACTIVE' },
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
        })
      : null;

    if (!business) {
      return { business: null, data: [] };
    }

    const where: any = {
      businessId: business.id,
      status: 'ACTIVE',
      visibleInCatalog: true,
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
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    deletedAt: true,
                    currentStock: true,
                  },
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
              return { optionId: option.id, itemId: option.itemId, quantity };
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

    const visibleItems: typeof data = [];
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
      business: {
        ...publicBusiness,
        storeFooterSettings: normalizePublicFooterSettings(
          publicBusiness.storeFooterSettings,
        ),
      },
      data: await Promise.all(
        visibleItems.map(async (item) => {
          const { currentStock, averageCost, ...cleanItem } = item;
          return {
            ...toPublicItem(cleanItem),
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
    const business = await this.findActiveBusiness(slug);

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
        visibleInCatalog: true,
      },
    });

    if (!item) throw new BadRequestException('Invalid service');

    return this.availability.getSlots({
      businessId: business.id,
      itemId: item.id,
      durationMinutes: item.durationMinutes,
      date: this.parseDateOnly(date),
    });
  }

  async getAvailabilityCalendar(slug: string, itemId: string, month: string) {
    const business = await this.findActiveBusiness(slug);

    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
        type: 'SERVICE',
        status: 'ACTIVE',
        visibleInCatalog: true,
      },
    });

    if (!item) throw new BadRequestException('Invalid service');

    return this.availability.getAvailableDates({
      businessId: business.id,
      itemId: item.id,
      durationMinutes: item.durationMinutes,
      ...this.parseMonth(month),
    });
  }

  /* =====================================================
     CREATE RESERVATION
  ===================================================== */

  async createReservation(slug: string, dto: CreatePublicReservationDto) {
    const business = await this.findActiveBusiness(slug);
    // Scoped to the slug's business: a key from another business can never match here.
    const keyHash = dto.idempotencyKey
      ? this.publicReservationKeyHash(business.id, dto.idempotencyKey)
      : null;
    const fingerprint = keyHash ? this.publicReservationFingerprint(dto) : null;
    const findPrevious = (db: any) =>
      db.reservation.findUnique({
        where: {
          businessId_publicRequestId: {
            businessId: business.id,
            publicRequestId: keyHash,
          },
        },
        select: PUBLIC_RESERVATION_RESULT,
      });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Every new booking is policy 2: retries must be idempotent.
        if (!keyHash)
          throw new BadRequestException({
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'idempotencyKey is required',
          });
        if (keyHash) {
          const previous = await findPrevious(tx);
          if (previous)
            return this.resolvePublicReservationReplay(previous, fingerprint!);
        }
        // Hidden from the catalog = not bookable publicly. A hidden price is bookable.
        const hiddenService = await tx.item.findFirst({
          where: {
            id: dto.itemId,
            businessId: business.id,
            visibleInCatalog: false,
          },
          select: { id: true },
        });
        if (hiddenService) throw new BadRequestException('Invalid service');
        const slot = await this.availability.reserveSlot(tx, {
          businessId: business.id,
          itemId: dto.itemId,
          date: dto.date,
          startMinute: dto.startMinute,
          requestedEndMinute: dto.endMinute,
        });
        const created = await tx.reservation.create({
          data: {
            businessId: business.id,
            itemId: slot.itemId,
            customerName: dto.customerName,
            customerWhatsapp: dto.customerWhatsapp,
            date: slot.date,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            origin: 'PUBLIC_STORE',
            // Public bookings keep the documented CASH default (no payment step in the store);
            // the business can correct it from «Editar» before completing.
            ...(await newReservationPolicy(tx, business.id, slot.itemId)),
            publicRequestId: keyHash,
            publicRequestFingerprint: fingerprint,
          },
          select: PUBLIC_RESERVATION_RESULT,
        });
        return this.publicReservationResult(created);
      });
      // Logs never include the key, its hash or the fingerprint.
      console.log('[PublicService] Created public reservation');
      return result;
    } catch (error) {
      if (keyHash) {
        // A concurrent twin may have committed first. It surfaces as P2002 on the key index
        // or, more often, as "slot unavailable" after waiting on the agenda lock. Either way
        // the same replay rules apply; never a second booking.
        const concurrent = await findPrevious(this.prisma);
        if (concurrent)
          return this.resolvePublicReservationReplay(concurrent, fingerprint!);
      }
      throw toBookingConflict(error);
    }
  }

  /* =====================================================
     CREATE ORDER
  ===================================================== */

  async createOrder(slug: string, dto: CreatePublicOrderDto) {
    if (!dto.idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }
    const requestFingerprint = this.publicOrderFingerprint(dto);

    const business = await this.findActiveBusiness(slug);

    const previousOrder = await this.prisma.order.findUnique({
      where: {
        businessId_publicRequestId: {
          businessId: business.id,
          publicRequestId: dto.idempotencyKey,
        },
      },
      select: {
        publicToken: true,
        publicRequestFingerprint: true,
      },
    });
    if (previousOrder) {
      return this.idempotentPublicOrderResponse(
        previousOrder,
        requestFingerprint,
      );
    }

    if (!dto.items || dto.items.length === 0)
      throw new BadRequestException('Order must contain items');
    if (
      dto.items.some(
        (item) => !Number.isInteger(item.quantity) || item.quantity <= 0,
      )
    ) {
      throw new BadRequestException('Item quantity must be a positive integer');
    }

    const uniqueItemIds = Array.from(
      new Set(dto.items.map((item) => item.itemId)),
    );
    const dbItems = await this.prisma.item.findMany({
      where: {
        id: { in: uniqueItemIds },
        businessId: business.id,
        status: 'ACTIVE',
        visibleInCatalog: true,
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
    // Cart may hold price-on-request lines; a direct order cannot (WhatsApp / quotation instead).
    assertNoHiddenPrices(dbItems);
    const dbItemById = new Map(dbItems.map((item) => [item.id, item]));

    const visibleCustomizationNotes: string[] = [];
    const normalizedInputs = await Promise.all(
      dto.items.map(async (input) => {
        const item = dbItemById.get(input.itemId);
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
      normalizedInputs.map(({ input, item, excludedIds, resolvedOptions }) => {
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
      });

    const total = orderItemCreates.reduce(
      (acc, item) => acc + Number(item.lineTotal),
      0,
    );

    const fiscalSettings = await this.getFiscalSettingsForBusiness(business.id);
    const buyerFiscalContext = fiscalSettings.fiscalContextEnabled
      ? this.normalizeBuyerFiscalContext(
          dto.buyerFiscalContext,
        )
      : undefined;
    let order: {
      id: string;
      businessId: string;
      publicToken: string;
      origin: string;
      customerName: string | null;
      total: Prisma.Decimal;
    };
    try {
      const createOrder = async (
        db: Prisma.TransactionClient | PrismaService,
      ) =>
        db.order.create({
          data: {
            businessId: business.id,
            publicRequestId: dto.idempotencyKey,
            publicRequestFingerprint: requestFingerprint,
            status: 'SENT',
            origin: 'PUBLIC_STORE',
            customerName: dto.customerName.trim(),
            customerWhatsapp: dto.customerWhatsapp.trim(),
            note: visibleNote,
            paymentMethod: dto.paymentMethod ?? 'CASH',
            sentAt: new Date(),
            total,
            items: {
              create: orderItemCreates,
            },
          },
          select: {
            id: true,
            businessId: true,
            publicToken: true,
            origin: true,
            customerName: true,
            total: true,
            items: {
              select: {
                id: true,
                itemId: true,
                quantity: true,
                unitPrice: true,
              },
            },
          },
        });
      order =
        this.taxService && buyerFiscalContext
          ? await this.prisma.$transaction(
              async (tx) => {
                const created = await createOrder(tx);
                const fiscalPreview = await this.taxService.calculateTaxPreview(
                  business.id,
                  {
                    ...buyerFiscalContext,
                    cartItems: created.items.map((item) => ({
                      orderItemId: item.id,
                      itemId: item.itemId,
                      quantity: Number(item.quantity),
                      unitPrice: Number(item.unitPrice),
                    })),
                  },
                  tx,
                );
                await this.taxService.freezeTaxCalculation(
                  tx,
                  created.id,
                  fiscalPreview,
                  buyerFiscalContext,
                );
                return created;
              },
              { maxWait: 5000, timeout: 15000 },
            )
          : await createOrder(this.prisma);
    } catch (error) {
      if (!this.isPublicOrderIdempotencyConflict(error)) throw error;
      const concurrentOrder = await this.prisma.order.findUnique({
        where: {
          businessId_publicRequestId: {
            businessId: business.id,
            publicRequestId: dto.idempotencyKey,
          },
        },
        select: {
          publicToken: true,
          publicRequestFingerprint: true,
        },
      });
      if (!concurrentOrder) throw error;
      return this.idempotentPublicOrderResponse(
        concurrentOrder,
        requestFingerprint,
      );
    }

    console.log(`[PublicService] Created order origin: ${order.origin}`);

    if (order.origin === 'PUBLIC_STORE' && this.pushNotificationsService) {
      void this.pushNotificationsService
        .notifyAutomaticSaleCreated({
          businessId: order.businessId,
          saleId: order.id,
          total: Number(order.total),
          customerName: order.customerName,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `No se pudo iniciar la notificación de la venta ${order.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
    }

    return {
      message: 'Order created',
      orderId: order.publicToken,
    };
  }

  /* =====================================================
     CREATE QUOTATION (solicitud desde la tienda)
  ===================================================== */

  async createQuotation(slug: string, dto: CreatePublicQuotationDto) {
    if (!this.quotationsService) {
      throw new ServiceUnavailableException('Cotizaciones no disponibles');
    }
    const business = await this.findActiveBusiness(slug);

    // Solo productos que la tienda publica: sin esto se cotizaría catálogo oculto.
    const ids = [...new Set(dto.items.map((line) => line.itemId))];
    const visible = await this.prisma.item.count({
      where: {
        id: { in: ids },
        businessId: business.id,
        status: 'ACTIVE',
        visibleInCatalog: true,
      },
    });
    if (visible !== ids.length) throw new BadRequestException('Invalid items');

    const quotation = await this.quotationsService.create(
      business.id,
      {
        idempotencyKey: dto.idempotencyKey,
        customerName: dto.customerName,
        customerWhatsapp: dto.customerWhatsapp,
        customerEmail: dto.customerEmail,
        customerDocument: dto.customerDocument,
        note: dto.note,
        items: dto.items.map(({ itemId, quantity }) => ({ itemId, quantity })),
      },
      'PUBLIC_STORE',
    );

    // El tag del push es por cotización: un reintento reemplaza el aviso en vez de duplicarlo.
    void this.pushNotificationsService
      ?.notifyQuotationRequested({
        businessId: business.id,
        quotationId: quotation.id,
        displayNumber: quotation.displayNumber,
        customerName: quotation.customer.name,
      })
      .catch((error: unknown) => {
        this.logger.error(
          `No se pudo notificar la cotización ${quotation.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    return {
      message: 'Quotation created',
      quotationId: quotation.publicToken,
      number: quotation.displayNumber,
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
        archived: true,
        commercialPolicyVersion: true,
        inventoryPostedAt: true,
        accountingPostedAt: true,
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
            publishWithoutPrice: true,
            durationMinutes: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            phoneWhatsapp: true,
          },
        },
      },
    });

    if (!reservation) return null;
    const isMirror = Boolean(
      await this.prisma.order.findFirst({
        where: { id, businessId: reservation.business.id },
        select: { id: true },
      }),
    );
    const {
      archived,
      commercialPolicyVersion,
      inventoryPostedAt,
      accountingPostedAt,
      ...visible
    } = reservation;
    // Server-side eligibility (the token is still required to actually cancel).
    const canCancel =
      !isMirror &&
      (isPolicyV2(reservation)
        ? reservation.status === 'CONFIRMED' &&
          !reservationTransitionBlock(reservation, 'cancel', 'public')
        : reservation.status === 'PENDING' && !archived);

    return {
      ...visible,
      canCancel,
      date: reservation.date.toISOString(),
      item: {
        ...reservation.item,
        price: publicItemPrice(reservation.item),
      },
    };
  }

  async cancelReservation(id: string, token?: string, reasonInput?: unknown) {
    const reason = cancellationReason(reasonInput);
    const found = await this.prisma.reservation.findUnique({
      where: { id },
      select: { businessId: true, publicToken: true },
    });

    if (!found) return null;
    // The id is shown in shared links and lookups; only the booking-time token authorizes.
    if (!publicTokenMatches(found.publicToken, token)) {
      throw new ForbiddenException(RESERVATION_ERRORS.publicCancelUnauthorized);
    }

    return this.prisma.$transaction(async (tx) => {
      const { reservation, alreadyCancelled } =
        await this.availability.lockReservationForCancellation(
          tx,
          found.businessId,
          id,
        );
      if (!publicTokenMatches(reservation.publicToken, token)) throw new ForbiddenException(RESERVATION_ERRORS.publicCancelUnauthorized);
      const visible = (row: any) => ({ id: row.id, status: row.status, cancelledAt: row.cancelledAt });
      if (alreadyCancelled) return visible(reservation);
      // Mirrors were already rejected by lockReservationForCancellation.
      const restriction = reservationTransitionBlock(reservation, 'cancel', 'public');
      if (restriction) lifecycleConflict(restriction);
      if (reservation.status !== 'PENDING' && !isPolicyV2(reservation)) {
        throw new ConflictException(RESERVATION_ERRORS.publicCancelNotAllowed);
      }
      return visible(
        await tx.reservation.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
        }),
      );
    });
  }

  /* =====================================================
     FIND RESERVATIONS BY PHONE (búsqueda pública de turnos)
  ===================================================== */

  async findReservationsByPhone(slug: string, rawPhone: string) {
    const business = await this.findActiveBusiness(slug);

    const cleanPhone = (rawPhone || '').replace(/\D/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 4) {
      return [];
    }

    const trimmedRaw = (rawPhone || '').trim();

    // Suffix / variation matching
    const phoneConditions: Prisma.ReservationWhereInput[] = [
      { customerWhatsapp: { contains: cleanPhone } },
    ];
    if (trimmedRaw && trimmedRaw !== cleanPhone) {
      phoneConditions.push({ customerWhatsapp: { contains: trimmedRaw } });
    }

    for (const prefix of ['57', '54', '52', '34', '56', '51', '1']) {
      if (cleanPhone.startsWith(prefix) && cleanPhone.length >= prefix.length + 6) {
        const localPart = cleanPhone.slice(prefix.length);
        phoneConditions.push({ customerWhatsapp: { contains: localPart } });
      }
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        businessId: business.id,
        archived: false,
        OR: phoneConditions,
      },
      select: {
        // publicToken is deliberately omitted: it authorizes cancellation and this
        // lookup only needs a few phone digits.
        id: true,
        status: true,
        customerName: true,
        customerWhatsapp: true,
        date: true,
        startMinute: true,
        endMinute: true,
        note: true,
        createdAt: true,
        item: {
          select: {
            id: true,
            name: true,
            price: true,
            publishWithoutPrice: true,
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
      orderBy: [
        { date: 'desc' },
        { startMinute: 'desc' },
      ],
    });

    return reservations.map((reservation) => ({
      ...reservation,
      date: reservation.date.toISOString(),
      item: {
        ...reservation.item,
        price: publicItemPrice(reservation.item),
      },
    }));
  }
}
