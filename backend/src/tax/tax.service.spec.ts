import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PersonType, SaleConcept, TaxType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaxPreviewDto } from './dto/tax-preview.dto';
import { TaxService } from './tax.service';

const mockFn = () => jest.fn<(...args: any[]) => any>();

describe('TaxService', () => {
  let service: TaxService;

  const mockPrismaService = {
    businessTaxProfile: {
      findUnique: mockFn(),
    },
    taxGlobalParameter: {
      findFirst: mockFn(),
    },
    item: {
      findMany: mockFn(),
    },
    salesTaxRule: {
      findMany: mockFn(),
    },
    municipalityIcaRate: {
      findFirst: mockFn(),
    },
    orderFiscalContext: {
      upsert: mockFn(),
    },
    saleTaxLine: {
      deleteMany: mockFn(),
      createMany: mockFn(),
    },
    taxCalculationSnapshot: {
      upsert: mockFn(),
    },
    order: {
      findUnique: mockFn(),
    },
  };

  const businessId = 'business-123';
  const globalParams = {
    uvt: new Prisma.Decimal(52374),
    defaultVatRate: new Prisma.Decimal(0.19),
    defaultImpoconsumoRate: new Prisma.Decimal(0.08),
  };

  const baseDto = (
    overrides: Partial<TaxPreviewDto> = {},
  ): TaxPreviewDto => ({
    buyerType: PersonType.JURIDICA,
    buyerIsIvaResponsable: false,
    buyerIsRetenedor: false,
    buyerIsGranContribuyente: false,
    buyerIsAutorretenedor: false,
    buyerIsRegimenSimple: false,
    saleConcept: SaleConcept.GOODS,
    cartItems: [{ itemId: 'item-1', quantity: 1 }],
    ...overrides,
  });

  const mockSeller = (
    codes: string[],
    overrides: Record<string, any> = {},
  ) => {
    mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      personType: PersonType.JURIDICA,
      mainCiiuCode: '4711',
      isIncomeTaxDeclarant: true,
      responsibilities: codes.map((code) => ({ responsibility: { code } })),
      ...overrides,
    });
  };

  const mockItems = (
    items: Array<{
      id?: string;
      price: number;
      appliesImpoconsumo?: boolean;
      impoconsumoRate?: Prisma.Decimal | null;
      saleConcept?: SaleConcept;
    }>,
  ) => {
    mockPrismaService.item.findMany.mockResolvedValue(
      items.map((item, index) => ({
        id: item.id ?? `item-${index + 1}`,
        price: new Prisma.Decimal(item.price),
        appliesImpoconsumo: item.appliesImpoconsumo ?? false,
        impoconsumoRate: item.impoconsumoRate ?? null,
        saleConcept: item.saleConcept,
      })),
    );
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TaxService>(TaxService);
    mockPrismaService.taxGlobalParameter.findFirst.mockResolvedValue(globalParams);
    mockPrismaService.salesTaxRule.findMany.mockResolvedValue([]);
    mockPrismaService.municipalityIcaRate.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty preview if no seller profile is configured', async () => {
    mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue(null);
    mockItems([{ price: 10000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({ cartItems: [{ itemId: 'item-1', quantity: 2 }] }),
    );

    expect(result.profileMissing).toBe(true);
    expect(result.subtotal.toNumber()).toBe(20000);
    expect(result.vatTotal.toNumber()).toBe(0);
    expect(result.netReceived.toNumber()).toBe(20000);
  });

  it('calculates IVA 19% when item does not apply impoconsumo', async () => {
    mockSeller(['48']);
    mockItems([{ price: 100000, appliesImpoconsumo: false }]);

    const result = await service.calculateTaxPreview(businessId, baseDto());

    expect(result.subtotal.toNumber()).toBe(100000);
    expect(result.vatTotal.toNumber()).toBe(19000);
    expect(result.impoconsumoTotal.toNumber()).toBe(0);
    expect(result.netReceived.toNumber()).toBe(119000);
  });

  it('calculates Impoconsumo 8% without IVA on the same item', async () => {
    mockSeller(['48']);
    mockItems([{ price: 100000, appliesImpoconsumo: true }]);

    const result = await service.calculateTaxPreview(businessId, baseDto());

    expect(result.vatTotal.toNumber()).toBe(0);
    expect(result.impoconsumoTotal.toNumber()).toBe(8000);
    expect(result.netReceived.toNumber()).toBe(108000);
    expect(result.taxLines.find((line) => line.taxType === TaxType.IVA)?.applied).toBe(false);
  });

  it('sets IVA and Impoconsumo to zero for Persona Natural No Responsable', async () => {
    mockSeller(['49'], { personType: PersonType.NATURAL });
    mockItems([
      { id: 'item-1', price: 100000, appliesImpoconsumo: true },
      { id: 'item-2', price: 50000, appliesImpoconsumo: false },
    ]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        cartItems: [
          { itemId: 'item-1', quantity: 1 },
          { itemId: 'item-2', quantity: 1 },
        ],
      }),
    );

    expect(result.subtotal.toNumber()).toBe(150000);
    expect(result.vatTotal.toNumber()).toBe(0);
    expect(result.impoconsumoTotal.toNumber()).toBe(0);
    expect(result.netReceived.toNumber()).toBe(150000);
  });

  it('applies ReteFuente compras: 10 UVT and 2.5% for declarante', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsRetenedor: true }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(25000);
    expect(result.taxLines.find((line) => line.taxType === TaxType.RETEFUENTE)?.rate.toString()).toBe('0.025');
  });

  it('applies ReteFuente servicios: 15 UVT and 4% for declarante', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsRetenedor: true, saleConcept: SaleConcept.SERVICES }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(40000);
  });

  it('applies ReteFuente servicios: 15 UVT and 6% for no declarante', async () => {
    mockSeller(['48'], { isIncomeTaxDeclarant: false });
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        saleConcept: SaleConcept.SERVICES,
      }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(60000);
  });

  it('uses seller tax profile as source of truth for declarante and ignores frontend legacy override', async () => {
    mockSeller(['48'], { isIncomeTaxDeclarant: true });
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        withholdingSubjectIsDeclarante: false,
      }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(25000);
    expect(result.taxLines.find((line) => line.taxType === TaxType.RETEFUENTE)?.rate.toString()).toBe('0.025');
  });

  it('derives saleConcept from items instead of frontend manual concept', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000, saleConcept: SaleConcept.SERVICES }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        saleConcept: SaleConcept.GOODS,
      }),
    );

    expect(result.saleConceptUsed).toBe(SaleConcept.SERVICES);
    expect(result.reteFuenteTotal.toNumber()).toBe(40000);
  });

  it('applies ReteFuente honorarios declarante at 11%', async () => {
    mockSeller(['48']);
    mockItems([{ price: 100000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        saleConcept: SaleConcept.HONORARIOS,
      }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(11000);
  });

  it('applies ReteFuente arrendamientos at 3.5%', async () => {
    mockSeller(['48']);
    mockItems([{ price: 2000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        saleConcept: SaleConcept.ARRENDAMIENTOS,
      }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(70000);
  });

  it('does not apply ReteFuente below the minimum COP base', async () => {
    mockSeller(['48']);
    mockItems([{ price: 500000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsRetenedor: true }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(0);
  });

  it('calculates ReteICA 9.66 per thousand over 1,000,000', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        fiscalMunicipalityCode: '11001',
      }),
    );

    expect(result.reteIcaTotal.toNumber()).toBe(9660);
    expect(result.taxLines.find((line) => line.taxType === TaxType.RETEICA)?.rate.toString()).toBe('0.00966');
  });

  it('applies ReteICA override in per-thousand format and exposes the frozen decimal rate', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: false,
        fiscalMunicipalityCode: undefined,
        reteIcaRateOverride: 9.66,
      } as any),
    );

    const reteIcaLine = result.taxLines.find((line) => line.taxType === TaxType.RETEICA);
    expect(result.reteIcaTotal.toNumber()).toBe(9660);
    expect(result.reteIcaRateUsed.toString()).toBe('0.00966');
    expect(result.reteIcaRateOverrideUsed?.toString()).toBe('0.00966');
    expect(reteIcaLine?.applied).toBe(true);
    expect(reteIcaLine?.rate.toString()).toBe('0.00966');
  });

  it('does not apply ReteFuente or ReteICA when buyer belongs to RST', async () => {
    mockSeller(['05', '07', '48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        buyerIsGranContribuyente: false,
        buyerIsRegimenSimple: true,
        fiscalMunicipalityCode: '11001',
        reteIcaRateOverride: 10,
      }),
    );

    expect(result.vatTotal.toNumber()).toBe(190000);
    expect(result.reteFuenteTotal.toNumber()).toBe(0);
    expect(result.reteIcaTotal.toNumber()).toBe(0);
    expect(result.reteIvaTotal.toNumber()).toBe(0);
    expect(result.subtotal.add(result.vatTotal).toNumber()).toBe(1190000);
    expect(
      result.reteFuenteTotal
        .add(result.reteIcaTotal)
        .add(result.reteIvaTotal)
        .toNumber(),
    ).toBe(0);
    expect(result.netReceived.toNumber()).toBe(1190000);
    expect(result.taxLines.find((line) => line.taxType === TaxType.RETEICA)?.applied).toBe(false);
  });

  it('keeps calculating ReteICA when buyer is not RST and rate is 10 per thousand', async () => {
    mockSeller(['05', '07', '48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        buyerIsGranContribuyente: false,
        buyerIsRegimenSimple: false,
        fiscalMunicipalityCode: '11001',
        reteIcaRateOverride: 10,
      }),
    );

    expect(result.reteIcaTotal.toNumber()).toBe(10000);
    expect(result.taxLines.find((line) => line.taxType === TaxType.RETEICA)?.applied).toBe(true);
  });

  it('does not apply ReteICA for buyer Persona Natural', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerType: PersonType.NATURAL,
        buyerIsRetenedor: true,
        fiscalMunicipalityCode: '11001',
      }),
    );

    expect(result.reteIcaTotal.toNumber()).toBe(0);
  });

  it('does not apply ReteICA for seller RST', async () => {
    mockSeller(['47', '48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        fiscalMunicipalityCode: '11001',
      }),
    );

    expect(result.reteIcaTotal.toNumber()).toBe(0);
  });

  it('does not apply ReteICA for seller Gran Contribuyente', async () => {
    mockSeller(['13', '48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        fiscalMunicipalityCode: '11001',
      }),
    );

    expect(result.reteIcaTotal.toNumber()).toBe(0);
  });

  it('does not apply ReteICA below the configured minimum COP base', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);
    mockPrismaService.municipalityIcaRate.findFirst.mockResolvedValue({
      minBaseUvt: new Prisma.Decimal(27),
      reteIcaRate: new Prisma.Decimal(0.00966),
    });

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsRetenedor: true,
        fiscalMunicipalityCode: '11001',
      }),
    );

    expect(result.reteIcaTotal.toNumber()).toBe(0);
  });

  it('applies ReteIVA only for buyer Gran Contribuyente', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const withoutGran = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsRetenedor: true }),
    );

    const withGran = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsGranContribuyente: true }),
    );

    expect(withoutGran.reteIvaTotal.toNumber()).toBe(0);
    expect(withGran.reteIvaTotal.toNumber()).toBe(28500);
  });

  it('calculates ReteIVA as IVA times 15%', async () => {
    mockSeller(['48']);
    mockItems([{ price: 2000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsGranContribuyente: true }),
    );

    expect(result.vatTotal.toNumber()).toBe(380000);
    expect(result.reteIvaTotal.toNumber()).toBe(57000);
  });

  it('calculates net received as subtotal plus charged taxes minus withholdings', async () => {
    mockSeller(['48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({
        buyerIsGranContribuyente: true,
        fiscalMunicipalityCode: '11001',
      }),
    );

    expect(result.netReceived.toNumber()).toBe(1126840);
  });

  it('sets practiced ReteFuente to zero for seller Autorretenedor and does not subtract Autorretencion from net received', async () => {
    mockSeller(['15', '48']);
    mockItems([{ price: 1000000 }]);

    const result = await service.calculateTaxPreview(
      businessId,
      baseDto({ buyerIsRetenedor: true }),
    );

    expect(result.reteFuenteTotal.toNumber()).toBe(0);
    expect(result.autoRetencionTotal.toNumber()).toBe(25000);
    expect(result.netReceived.toNumber()).toBe(1190000);
  });
});
