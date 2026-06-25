import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TaxService } from './tax.service';
import { PrismaService } from '../prisma/prisma.service';
import { PersonType, DocumentType, SaleConcept, TaxType, TaxDirection, Prisma } from '@prisma/client';
import { TaxPreviewDto } from './dto/tax-preview.dto';

const mockFn = () => jest.fn<(...args: any[]) => any>();

describe('TaxService', () => {
  let service: TaxService;
  let prisma: PrismaService;

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
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateTaxPreview', () => {
    const businessId = 'business-123';

    it('returns empty preview if no seller profile is configured', async () => {
      mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue(null);
      mockPrismaService.item.findMany.mockResolvedValue([
        { id: 'item-1', price: new Prisma.Decimal(10000) },
      ]);

      const dto: TaxPreviewDto = {
        buyerIsIvaResponsable: false,
        buyerIsRetenedor: false,
        buyerIsGranContribuyente: false,
        buyerIsAutorretenedor: false,
        buyerIsRegimenSimple: false,
        saleConcept: SaleConcept.GOODS,
        cartItems: [{ itemId: 'item-1', quantity: 2 }],
      };

      const result = await service.calculateTaxPreview(businessId, dto);
      expect(result.subtotal.toString()).toBe('20000'); // emptyTaxPreview fallback
      expect(result.vatTotal.toString()).toBe('0');
      expect(result.netReceived.toString()).toBe('20000');
      expect(result.profileMissing).toBe(true);
    });

    it('calculates IVA for responsible seller and impoconsumo per item', async () => {
      mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        responsibilities: [
          { responsibility: { code: '48' } }, // responsable de IVA
        ],
      });
      mockPrismaService.taxGlobalParameter.findFirst.mockResolvedValue({
        uvt: new Prisma.Decimal(52374),
        defaultVatRate: new Prisma.Decimal(0.19),
        defaultImpoconsumoRate: new Prisma.Decimal(0.08),
      });
      mockPrismaService.item.findMany.mockResolvedValue([
        { id: 'item-1', price: new Prisma.Decimal(10000), appliesImpoconsumo: true, impoconsumoRate: null },
        { id: 'item-2', price: new Prisma.Decimal(5000), appliesImpoconsumo: false, impoconsumoRate: null },
      ]);
      mockPrismaService.salesTaxRule.findMany.mockResolvedValue([]);

      const dto: TaxPreviewDto = {
        buyerIsIvaResponsable: false,
        buyerIsRetenedor: false,
        buyerIsGranContribuyente: false,
        buyerIsAutorretenedor: false,
        buyerIsRegimenSimple: false,
        saleConcept: SaleConcept.GOODS,
        cartItems: [
          { itemId: 'item-1', quantity: 1 }, // 10000
          { itemId: 'item-2', quantity: 2 }, // 10000
        ],
      };

      const result = await service.calculateTaxPreview(businessId, dto);
      // subtotal = 10000 + 10000 = 20000
      // IVA = 20000 * 0.19 = 3800
      // Impoconsumo = 10000 * 0.08 = 800
      // NetReceived = 20000 + 3800 + 800 = 24600
      expect(result.subtotal.toNumber()).toBe(20000);
      expect(result.vatTotal.toNumber()).toBe(3800);
      expect(result.impoconsumoTotal.toNumber()).toBe(800);
      expect(result.netReceived.toNumber()).toBe(24600);
      expect(result.autoRetencionTotal.toNumber()).toBe(0);
    });

    it('applies withholdings (retefuente, reteiva, reteica) based on buyer flags', async () => {
      mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        responsibilities: [
          { responsibility: { code: '48' } }, // responsable de IVA
        ],
      });
      mockPrismaService.taxGlobalParameter.findFirst.mockResolvedValue({
        uvt: new Prisma.Decimal(52374),
        defaultVatRate: new Prisma.Decimal(0.19),
        defaultImpoconsumoRate: new Prisma.Decimal(0.08),
      });
      mockPrismaService.item.findMany.mockResolvedValue([
        { id: 'item-1', price: new Prisma.Decimal(2000000), appliesImpoconsumo: false, impoconsumoRate: null }, // supera base retefuente de 27 UVTs
      ]);
      mockPrismaService.salesTaxRule.findMany.mockResolvedValue([]);
      mockPrismaService.municipalityIcaRate.findFirst.mockResolvedValue({
        minBaseUvt: new Prisma.Decimal(0),
        reteIcaRate: new Prisma.Decimal(0.004),
      });

      const dto: TaxPreviewDto = {
        buyerIsIvaResponsable: true,
        buyerIsRetenedor: true,
        buyerIsGranContribuyente: true,
        buyerIsAutorretenedor: false,
        buyerIsRegimenSimple: false,
        fiscalMunicipalityCode: '11001',
        saleConcept: SaleConcept.GOODS,
        cartItems: [{ itemId: 'item-1', quantity: 1 }],
      };

      const result = await service.calculateTaxPreview(businessId, dto);
      // subtotal = 2000000
      // IVA = 380000
      // retefuente = 2000000 * 2.5% = 50000
      // reteiva = 380000 * 15% = 57000
      // reteica = 2000000 * 0.4% = 8000
      // netReceived = 2000000 + 380000 - 50000 - 57000 - 8000 = 2265000
      expect(result.subtotal.toNumber()).toBe(2000000);
      expect(result.vatTotal.toNumber()).toBe(380000);
      expect(result.reteFuenteTotal.toNumber()).toBe(50000);
      expect(result.reteIvaTotal.toNumber()).toBe(57000);
      expect(result.reteIcaTotal.toNumber()).toBe(8000);
      expect(result.netReceived.toNumber()).toBe(2265000);
    });

    it('calculates 4.00 per-thousand ReteICA as 400 on a 100000 base', async () => {
      mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        mainCiiuCode: '4711',
        responsibilities: [{ responsibility: { code: '49' } }],
      });
      mockPrismaService.taxGlobalParameter.findFirst.mockResolvedValue({
        uvt: new Prisma.Decimal(52374),
        defaultVatRate: new Prisma.Decimal(0.19),
        defaultImpoconsumoRate: new Prisma.Decimal(0.08),
      });
      mockPrismaService.item.findMany.mockResolvedValue([
        {
          id: 'item-1',
          price: new Prisma.Decimal(100000),
          appliesImpoconsumo: false,
          impoconsumoRate: null,
        },
      ]);
      mockPrismaService.salesTaxRule.findMany.mockResolvedValue([]);
      mockPrismaService.municipalityIcaRate.findFirst.mockResolvedValue({
        minBaseUvt: new Prisma.Decimal(0),
        reteIcaRate: new Prisma.Decimal('0.004000'),
      });

      const result = await service.calculateTaxPreview(businessId, {
        buyerIsIvaResponsable: false,
        buyerIsRetenedor: true,
        buyerIsGranContribuyente: false,
        buyerIsAutorretenedor: false,
        buyerIsRegimenSimple: false,
        fiscalMunicipalityCode: '11001',
        saleConcept: SaleConcept.GOODS,
        cartItems: [{ itemId: 'item-1', quantity: 1 }],
      });

      expect(result.reteIcaTotal.toNumber()).toBe(400);
      expect(
        result.taxLines.find((line) => line.taxType === TaxType.RETEICA)?.rate.toString(),
      ).toBe('0.004');
    });

    it('calculates autorretencion but does NOT subtract it from netReceived', async () => {
      mockPrismaService.businessTaxProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        responsibilities: [
          { responsibility: { code: '15' } }, // Autorretenedor de renta
        ],
      });
      mockPrismaService.taxGlobalParameter.findFirst.mockResolvedValue({
        uvt: new Prisma.Decimal(52374),
        defaultVatRate: new Prisma.Decimal(0.19),
        defaultImpoconsumoRate: new Prisma.Decimal(0.08),
      });
      mockPrismaService.item.findMany.mockResolvedValue([
        { id: 'item-1', price: new Prisma.Decimal(100000), appliesImpoconsumo: false, impoconsumoRate: null },
      ]);
      mockPrismaService.salesTaxRule.findMany.mockResolvedValue([]);

      const dto: TaxPreviewDto = {
        buyerIsIvaResponsable: false,
        buyerIsRetenedor: false,
        buyerIsGranContribuyente: false,
        buyerIsAutorretenedor: false,
        buyerIsRegimenSimple: false,
        saleConcept: SaleConcept.GOODS,
        cartItems: [{ itemId: 'item-1', quantity: 1 }],
      };

      const result = await service.calculateTaxPreview(businessId, dto);
      // subtotal = 100000
      // IVA = 0 (vendedor no responsable de iva en este test mock ya que no tiene 48)
      // autorretencion = 100000 * 0.4% = 400
      // netReceived = 100000
      expect(result.subtotal.toNumber()).toBe(100000);
      expect(result.autoRetencionTotal.toNumber()).toBe(400);
      expect(result.netReceived.toNumber()).toBe(100000);
    });
  });
});
