import { Injectable } from '@nestjs/common';
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
    const slug = slugify(data.name, { lower: true, strict: true });

    return this.prisma.business.create({
      data: {
        name: data.name,
        slug,
        fiscalId: data.fiscalId,
        phoneWhatsapp: data.phoneWhatsapp,
      },
    });
  }
}
