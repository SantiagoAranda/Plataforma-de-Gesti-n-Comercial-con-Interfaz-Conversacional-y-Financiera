import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertTaxProfileDto } from './dto/upsert-tax-profile.dto';
import { CreateIcaRateDto } from './dto/create-ica-rate.dto';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTaxProfile(businessId: string) {
    const profile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      include: {
        responsibilities: {
          include: {
            responsibility: true,
          },
        },
      },
    });
    return profile;
  }

  async upsertTaxProfile(businessId: string, dto: UpsertTaxProfileDto) {
    // Validación de exclusión mutua 48 (Responsable de IVA) vs 49 (No responsable de IVA)
    const codes = dto.responsibilityCodes;
    if (codes.includes('48') && codes.includes('49')) {
      throw new BadRequestException('Un perfil fiscal no puede ser Responsable de IVA (48) y No responsable de IVA (49) simultáneamente.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Obtener o crear perfil
      let profile = await tx.businessTaxProfile.findUnique({
        where: { businessId },
      });

      if (!profile) {
        profile = await tx.businessTaxProfile.create({
          data: {
            businessId,
            personType: dto.personType,
            documentType: dto.documentType,
            nit: dto.nit,
            dv: dto.dv,
            tradeName: dto.tradeName,
            email: dto.email,
            phone: dto.phone,
            departmentCode: dto.departmentCode,
            municipalityCode: dto.municipalityCode,
            address: dto.address,
            mainCiiuCode: dto.mainCiiuCode,
            mainCiiuDescription: dto.mainCiiuDescription,
          },
        });
      } else {
        profile = await tx.businessTaxProfile.update({
          where: { businessId },
          data: {
            personType: dto.personType,
            documentType: dto.documentType,
            nit: dto.nit,
            dv: dto.dv,
            tradeName: dto.tradeName,
            email: dto.email,
            phone: dto.phone,
            departmentCode: dto.departmentCode,
            municipalityCode: dto.municipalityCode,
            address: dto.address,
            mainCiiuCode: dto.mainCiiuCode,
            mainCiiuDescription: dto.mainCiiuDescription,
          },
        });
      }

      // 2. Resolver responsabilidades DIAN
      // Eliminar actuales
      await tx.businessTaxResponsibility.deleteMany({
        where: { taxProfileId: profile.id },
      });

      // Crear nuevas buscando las responsabilidades por código
      if (codes.length > 0) {
        const dbResponsibilities = await tx.taxResponsibility.findMany({
          where: { code: { in: codes } },
        });

        await tx.businessTaxResponsibility.createMany({
          data: dbResponsibilities.map((r) => ({
            taxProfileId: profile!.id,
            taxResponsibilityId: r.id,
          })),
        });
      }

      return tx.businessTaxProfile.findUnique({
        where: { id: profile.id },
        include: {
          responsibilities: {
            include: {
              responsibility: true,
            },
          },
        },
      });
    });
  }

  async listTaxResponsibilities() {
    const allowedCodes = ['05', '07', '10', '47', '48', '49', '52'];
    return this.prisma.taxResponsibility.findMany({
      where: {
        code: { in: allowedCodes },
      },
      orderBy: { code: 'asc' },
    });
  }

  // --- ICA rates ---
  async listIcaRates(businessId: string) {
    return this.prisma.municipalityIcaRate.findMany({
      where: { businessId },
      orderBy: { municipalityCode: 'asc' },
    });
  }

  async createIcaRate(businessId: string, dto: CreateIcaRateDto) {
    const existing = await this.prisma.municipalityIcaRate.findUnique({
      where: {
        businessId_municipalityCode_ciiuCode: {
          businessId,
          municipalityCode: dto.municipalityCode,
          ciiuCode: dto.ciiuCode,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Ya existe una tarifa ICA para este municipio y actividad económica.');
    }

    return this.prisma.municipalityIcaRate.create({
      data: {
        businessId,
        municipalityCode: dto.municipalityCode,
        ciiuCode: dto.ciiuCode,
        activityName: dto.activityName,
        icaRate: new Prisma.Decimal(dto.icaRatePerThousand).div(1000),
        reteIcaRate: new Prisma.Decimal(dto.reteIcaRatePerThousand).div(1000),
        minBaseUvt: dto.minBaseUvt,
      },
    });
  }

  async updateIcaRate(businessId: string, id: string, dto: Partial<CreateIcaRateDto>) {
    const existing = await this.prisma.municipalityIcaRate.findFirst({
      where: { id, businessId },
    });
    if (!existing) throw new NotFoundException('Tarifa ICA no encontrada');

    return this.prisma.municipalityIcaRate.update({
      where: { id },
      data: {
        municipalityCode: dto.municipalityCode,
        ciiuCode: dto.ciiuCode,
        activityName: dto.activityName,
        icaRate:
          dto.icaRatePerThousand === undefined
            ? undefined
            : new Prisma.Decimal(dto.icaRatePerThousand).div(1000),
        reteIcaRate:
          dto.reteIcaRatePerThousand === undefined
            ? undefined
            : new Prisma.Decimal(dto.reteIcaRatePerThousand).div(1000),
        minBaseUvt: dto.minBaseUvt,
      },
    });
  }

  async deleteIcaRate(businessId: string, id: string) {
    const existing = await this.prisma.municipalityIcaRate.findFirst({
      where: { id, businessId },
    });
    if (!existing) throw new NotFoundException('Tarifa ICA no encontrada');

    await this.prisma.municipalityIcaRate.delete({ where: { id } });
    return { ok: true };
  }

  // --- Sales Tax Rules ---
  async listTaxRules(businessId: string) {
    return this.prisma.salesTaxRule.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTaxRule(businessId: string, dto: CreateTaxRuleDto) {
    return this.prisma.salesTaxRule.create({
      data: {
        businessId,
        taxType: dto.taxType,
        direction: dto.direction,
        ciiuCode: dto.ciiuCode,
        saleConcept: dto.saleConcept,
        rate: dto.rate,
        minBaseUvt: dto.minBaseUvt,
        pucAccountCode: dto.pucAccountCode,
        postToAccounting: dto.postToAccounting ?? false,
      },
    });
  }

  async updateTaxRule(businessId: string, id: string, dto: Partial<CreateTaxRuleDto>) {
    const existing = await this.prisma.salesTaxRule.findFirst({
      where: { id, businessId },
    });
    if (!existing) throw new NotFoundException('Regla tributaria no encontrada');

    return this.prisma.salesTaxRule.update({
      where: { id },
      data: {
        taxType: dto.taxType,
        direction: dto.direction,
        ciiuCode: dto.ciiuCode,
        saleConcept: dto.saleConcept,
        rate: dto.rate,
        minBaseUvt: dto.minBaseUvt,
        pucAccountCode: dto.pucAccountCode,
        postToAccounting: dto.postToAccounting,
      },
    });
  }

  async deleteTaxRule(businessId: string, id: string) {
    const existing = await this.prisma.salesTaxRule.findFirst({
      where: { id, businessId },
    });
    if (!existing) throw new NotFoundException('Regla tributaria no encontrada');

    await this.prisma.salesTaxRule.delete({ where: { id } });
    return { ok: true };
  }

  async listCiiu(search?: string) {
    const q = search?.trim();
    return this.prisma.economicActivityCiiu.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
      take: 50,
    });
  }
}
