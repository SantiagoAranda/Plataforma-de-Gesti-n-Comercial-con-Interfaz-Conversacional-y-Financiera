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

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const BUSINESS_LOGOS_BUCKET = 'business-logos';

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
