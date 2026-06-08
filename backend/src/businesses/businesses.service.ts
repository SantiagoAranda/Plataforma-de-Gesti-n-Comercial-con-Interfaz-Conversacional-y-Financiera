import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Business, PayrollAccountingSide, Prisma } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';

type FooterPhone = {
  label: string;
  value: string;
};

type FooterSocial = {
  type: string;
  label: string;
  value: string;
};

type StoreFooterSettingsPayload = {
  description?: string | null;
  email?: string | null;
  phones?: FooterPhone[];
  socials?: FooterSocial[];
};

type PayrollAccountingMappingTemplateRow = {
  concept_code: string;
  concept_name: string;
  account_code: string;
  account_name: string;
  side: PayrollAccountingSide;
};

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_SOCIAL_TYPES = new Set([
  'facebook',
  'instagram',
  'youtube',
  'tiktok',
  'linkedin',
  'x',
  'twitter',
  'whatsapp',
  'website',
]);

function cleanOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validatePhones(value: unknown): FooterPhone[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('phones debe ser un array');
  }

  return value
    .map((phone) => {
      if (!phone || typeof phone !== 'object') {
        throw new BadRequestException('Cada telefono debe ser un objeto');
      }

      const record = phone as Record<string, unknown>;
      const label = cleanOptionalString(record.label);
      const phoneValue = cleanOptionalString(record.value);

      if (!label && !phoneValue) return null;
      if (!phoneValue) {
        throw new BadRequestException('Cada telefono debe tener numero');
      }

      return {
        label: label ?? 'Telefono',
        value: phoneValue,
      };
    })
    .filter((phone): phone is FooterPhone => Boolean(phone));
}

function validateSocials(value: unknown): FooterSocial[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('socials debe ser un array');
  }

  return value
    .map((social) => {
      if (!social || typeof social !== 'object') {
        throw new BadRequestException('Cada red social debe ser un objeto');
      }

      const record = social as Record<string, unknown>;
      const type = cleanOptionalString(record.type)?.toLowerCase() ?? null;
      const label = cleanOptionalString(record.label);
      const socialValue = cleanOptionalString(record.value);

      if (!type && !label && !socialValue) return null;
      if (!type || !socialValue) {
        throw new BadRequestException(
          'Cada red social debe tener tipo y valor',
        );
      }
      if (!ALLOWED_SOCIAL_TYPES.has(type)) {
        throw new BadRequestException(
          `Tipo de red social no soportado: ${type}`,
        );
      }

      return {
        type,
        label: label ?? type,
        value: socialValue,
      };
    })
    .filter((social): social is FooterSocial => Boolean(social));
}

function validateStoreFooterSettingsPayload(
  body: unknown,
): StoreFooterSettingsPayload {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Payload invalido');
  }

  const record = body as Record<string, unknown>;

  return {
    description: cleanOptionalString(record.description),
    email: cleanOptionalString(record.email),
    phones: validatePhones(record.phones),
    socials: validateSocials(record.socials),
  };
}

function parsePayrollAccountingMappingTemplate() {
  const filePath = path.join(
    process.cwd(),
    'prisma',
    'seed-data',
    'payroll_accounting_mapping.csv',
  );

  if (!fs.existsSync(filePath)) {
    throw new InternalServerErrorException(
      'Plantilla de mapeo contable de nomina no encontrada',
    );
  }

  return parse(fs.readFileSync(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    record_delimiter: '\n',
  }) as PayrollAccountingMappingTemplateRow[];
}

@Injectable()
export class BusinessesService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

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

  async createBusiness(data: {
    name: string;
    fiscalId: string;
    phoneWhatsapp: string;
  }): Promise<Business> {
    // ✅ Diagnóstico: Log de nombre antes de guardar
    console.log(`[BusinessesService] Creating business: "${data.name}"`);
    console.log(
      `[BusinessesService] Name Hex: ${Buffer.from(data.name).toString('hex')}`,
    );

    const slug = await generateSlug(data.name, async (s) => {
      const existing = await this.prisma.business.findUnique({
        where: { slug: s },
      });
      return !existing;
    });
    console.log(`[BusinessesService] Generated slug: "${slug}"`);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            ...data,
            slug,
            status: 'ACTIVE',
          },
        });

        await this.initializePayrollAccountingMappingsForBusiness(
          tx,
          business.id,
        );

        return business;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException('Error creating business');
    }
  }

  private async assertPucAccountExists(
    tx: Prisma.TransactionClient,
    accountCode: string,
  ) {
    const code = accountCode.trim();

    if (code.length === 4) {
      const account = await tx.pucCuenta.findUnique({
        where: { code },
        select: { code: true },
      });
      if (account) return;
    }

    if (code.length === 6) {
      const subaccount = await tx.pucSubcuenta.findFirst({
        where: { code, active: true },
        select: { code: true },
      });
      if (subaccount) return;
    }

    throw new InternalServerErrorException(
      `Cuenta PUC de nomina no existe o esta inactiva: ${code}`,
    );
  }

  private async initializePayrollAccountingMappingsForBusiness(
    tx: Prisma.TransactionClient,
    businessId: string,
  ) {
    const rows = parsePayrollAccountingMappingTemplate();

    for (const row of rows) {
      await this.assertPucAccountExists(tx, row.account_code);
      await tx.payrollAccountingMapping.upsert({
        where: {
          businessId_conceptCode_side: {
            businessId,
            conceptCode: row.concept_code,
            side: row.side,
          },
        },
        update: {
          conceptName: row.concept_name,
          accountCode: row.account_code,
          accountName: row.account_name,
          isActive: true,
        },
        create: {
          businessId,
          conceptCode: row.concept_code,
          conceptName: row.concept_name,
          accountCode: row.account_code,
          accountName: row.account_name,
          side: row.side,
          isActive: true,
        },
      });
    }
  }

  async getActiveBusinesses() {
    const businesses = await this.prisma.business.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        logoObjectKey: true,
        phoneWhatsapp: true,
        status: true,
      },
    });

    return businesses.map((business) => this.withPublicLogoUrl(business));
  }

  async getInactiveBusinesses() {
    const businesses = await this.prisma.business.findMany({
      where: {
        status: 'INACTIVE',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        logoObjectKey: true,
        phoneWhatsapp: true,
        status: true,
        inactivatedAt: true,
      },
    });

    return businesses.map((business) => this.withPublicLogoUrl(business));
  }

  async inactivateBusiness(id: string) {
    return this.prisma.business.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        inactivatedAt: new Date(),
      },
    });
  }

  async activateBusiness(id: string) {
    return this.prisma.business.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        inactivatedAt: null,
      },
    });
  }

  async getBusinessById(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    return business ? this.withPublicLogoUrl(business) : null;
  }

  async getProfile(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        fiscalId: true,
        phoneWhatsapp: true,
        logoUrl: true,
        logoObjectKey: true,
        logoMimeType: true,
        logoSizeBytes: true,
        status: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    return this.withPublicLogoUrl(business);
  }

  async getStoreFooterSettings(businessId: string) {
    const settings = await this.prisma.storeFooterSettings.findUnique({
      where: { businessId },
      select: {
        id: true,
        description: true,
        email: true,
        phones: true,
        socials: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return (
      settings ?? {
        description: null,
        email: null,
        phones: [],
        socials: [],
      }
    );
  }

  async updateStoreFooterSettings(businessId: string, body: unknown) {
    const payload = validateStoreFooterSettingsPayload(body);

    return this.prisma.storeFooterSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        description: payload.description,
        email: payload.email,
        phones: payload.phones ?? [],
        socials: payload.socials ?? [],
      },
      update: {
        description: payload.description,
        email: payload.email,
        phones: payload.phones ?? [],
        socials: payload.socials ?? [],
      },
      select: {
        id: true,
        description: true,
        email: true,
        phones: true,
        socials: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async uploadLogo(businessId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Debes seleccionar una imagen para el logo',
      );
    }

    if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'El logo debe ser una imagen JPG, PNG o WEBP',
      );
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('El logo no puede superar los 2 MB');
    }

    const previous = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { logoObjectKey: true },
    });

    if (!previous) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const optimized = await sharp(file.buffer)
      .rotate()
      .resize(768, 768, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    const objectKey = `businesses/${businessId}/logos/${Date.now()}.webp`;
    const logoUrl = this.storageService.getPublicUrl(objectKey);

    try {
      await this.storageService.uploadObject({
        objectKey,
        body: optimized,
        contentType: 'image/webp',
      });
    } catch (error) {
      throw new InternalServerErrorException('No se pudo subir el logo a R2');
    }

    try {
      const business = await this.prisma.business.update({
        where: { id: businessId },
        data: {
          logoUrl,
          logoObjectKey: objectKey,
          logoMimeType: 'image/webp',
          logoSizeBytes: optimized.length,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          fiscalId: true,
          phoneWhatsapp: true,
          logoUrl: true,
          logoObjectKey: true,
          logoMimeType: true,
          logoSizeBytes: true,
          status: true,
        },
      });

      if (previous.logoObjectKey) {
        try {
          await this.storageService.deleteObject(previous.logoObjectKey);
        } catch (error) {
          console.error(
            '[BusinessesService] Error deleting previous logo',
            error,
          );
        }
      }

      return this.withPublicLogoUrl(business);
    } catch (error) {
      try {
        await this.storageService.deleteObject(objectKey);
      } catch (deleteError) {
        console.error(
          '[BusinessesService] Error deleting uploaded logo after DB failure',
          deleteError,
        );
      }
      throw error;
    }
  }

  async deleteLogo(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { logoObjectKey: true },
    });

    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    if (business.logoObjectKey) {
      try {
        await this.storageService.deleteObject(business.logoObjectKey);
      } catch (error) {
        throw new InternalServerErrorException(
          'No se pudo eliminar el logo de R2',
        );
      }
    }

    const updatedBusiness = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        logoUrl: null,
        logoObjectKey: null,
        logoMimeType: null,
        logoSizeBytes: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        fiscalId: true,
        phoneWhatsapp: true,
        logoUrl: true,
        logoObjectKey: true,
        logoMimeType: true,
        logoSizeBytes: true,
        status: true,
      },
    });

    return this.withPublicLogoUrl(updatedBusiness);
  }
}
