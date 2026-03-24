import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Business } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util';

@Injectable()
export class BusinessesService {
  constructor(private prisma: PrismaService) {}

  async createBusiness(data: {
    name: string;
    fiscalId: string;
    phoneWhatsapp: string;
  }): Promise<Business> {
    // ✅ Diagnóstico: Log de nombre antes de guardar
    console.log(`[BusinessesService] Creating business: "${data.name}"`);
    console.log(`[BusinessesService] Name Hex: ${Buffer.from(data.name).toString('hex')}`);

    const slug = await generateSlug(data.name, async (s) => {
      const existing = await this.prisma.business.findUnique({ where: { slug: s } });
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
    } catch (error) {
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
            items: true
          }
        }
      }
    })
  }
}



