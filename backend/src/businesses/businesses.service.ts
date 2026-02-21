import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Business } from '@prisma/client';
import slugify from 'slugify';

@Injectable()
export class BusinessesService {
  constructor(private prisma: PrismaService) {}

  async createBusiness(data: {
    name: string;
    fiscalId: string;
    phoneWhatsapp: string;
  }): Promise<Business> {
    // Generar slug base
    const baseSlug = slugify(data.name, {
      lower: true,
      strict: true,
      trim: true,
    });

    let slug = baseSlug;
    let counter = 1;

    // Verificar unicidad del slug
    while (
      await this.prisma.business.findUnique({
        where: { slug },
      })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    try {
      return await this.prisma.business.create({
        data: {
          name: data.name,
          slug,
          fiscalId: data.fiscalId,
          phoneWhatsapp: data.phoneWhatsapp,
          status: 'ACTIVE', // explícito
        },
      });
    } catch (error) {
      throw new BadRequestException('Error creating business');
    }
  }
}