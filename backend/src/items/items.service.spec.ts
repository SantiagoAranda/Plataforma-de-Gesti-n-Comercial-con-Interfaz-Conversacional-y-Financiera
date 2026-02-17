import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateItemDto) {
    return this.prisma.item.create({
      data: {
        businessId,
        type: dto.type,
        name: dto.name,
        price: dto.price,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.item.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
