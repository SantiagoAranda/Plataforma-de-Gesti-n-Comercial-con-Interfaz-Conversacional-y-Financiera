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
    const baseSlug = slugify(data.name, {
      lower: true,
      strict: true,
      trim: true,
    });

    let slug = baseSlug;
    let counter = 1;

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



