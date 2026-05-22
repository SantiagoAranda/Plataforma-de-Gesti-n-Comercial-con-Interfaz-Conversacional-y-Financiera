import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Business } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

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

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const BUSINESS_LOGOS_BUCKET = 'business-logos';
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
        throw new BadRequestException('Cada red social debe tener tipo y valor');
      }
      if (!ALLOWED_SOCIAL_TYPES.has(type)) {
        throw new BadRequestException(`Tipo de red social no soportado: ${type}`);
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

@Injectable()
export class BusinessesService {
  private readonly supabase: ReturnType<typeof createClient> | null;
  private readonly logosBucket: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      this.configService.get<string>('SUPABASE_SERVICE_KEY');

    this.supabase =
      supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey)
        : null;
    this.logosBucket =
      this.configService.get<string>('SUPABASE_BUSINESS_LOGOS_BUCKET') ??
      BUSINESS_LOGOS_BUCKET;
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
      return await this.prisma.business.create({
        data: {
          ...data,
          slug,
          status: 'ACTIVE',
        },
      });
    } catch {
      throw new BadRequestException('Error creating business');
    }
  }

  async getActiveBusinesses() {
    return this.prisma.business.findMany({
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
  }

  async getInactiveBusinesses() {
    return this.prisma.business.findMany({
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
    return this.prisma.business.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
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

    return business;
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

    if (!this.supabase) {
      throw new InternalServerErrorException(
        'Supabase Storage no está configurado',
      );
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

    const objectKey = `businesses/${businessId}/logo-${Date.now()}.webp`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.logosBucket)
      .upload(objectKey, optimized, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        'No se pudo subir el logo al storage',
      );
    }

    const { data: publicUrlData } = this.supabase.storage
      .from(this.logosBucket)
      .getPublicUrl(objectKey);

    try {
      const business = await this.prisma.business.update({
        where: { id: businessId },
        data: {
          logoUrl: publicUrlData.publicUrl,
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
        const { error: removePreviousError } = await this.supabase.storage
          .from(this.logosBucket)
          .remove([previous.logoObjectKey]);

        if (removePreviousError) {
          console.error(
            '[BusinessesService] Error deleting previous logo',
            removePreviousError,
          );
        }
      }

      return business;
    } catch (error) {
      await this.supabase.storage.from(this.logosBucket).remove([objectKey]);
      throw error;
    }
  }

  async deleteLogo(businessId: string) {
    if (!this.supabase) {
      throw new InternalServerErrorException(
        'Supabase Storage no está configurado',
      );
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { logoObjectKey: true },
    });

    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }

    if (business.logoObjectKey) {
      const { error: deleteError } = await this.supabase.storage
        .from(this.logosBucket)
        .remove([business.logoObjectKey]);

      if (deleteError) {
        throw new InternalServerErrorException(
          'No se pudo eliminar el logo del storage',
        );
      }
    }

    return this.prisma.business.update({
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
  }
}
