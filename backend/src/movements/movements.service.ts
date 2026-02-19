import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto, MovementType } from './dto/create-movement.dto';

@Injectable()
export class MovementsService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateMovementDto) {
    const isIncome = dto.type === MovementType.INCOME;

    const entry = await this.prisma.accountingEntry.create({
      data: {
        businessId,
        date: new Date(),
        memo: dto.description,
        lines: {
          create: isIncome
            ? [
                {
                  pucSubCode: '110505', // Caja
                  debit: dto.amount,
                  credit: 0,
                },
                {
                  pucSubCode: '410505', // Ingresos
                  debit: 0,
                  credit: dto.amount,
                },
              ]
            : [
                {
                  pucSubCode: '510505', // Gastos
                  debit: dto.amount,
                  credit: 0,
                },
                {
                  pucSubCode: '110505', // Caja
                  debit: 0,
                  credit: dto.amount,
                },
              ],
        },
      },
      include: {
        lines: true,
      },
    });

    return entry;
  }

  async findAll(businessId: string) {
    return this.prisma.accountingEntry.findMany({
      where: { businessId },
      orderBy: { date: 'desc' },
      include: {
        lines: true,
      },
    });
  }
}
