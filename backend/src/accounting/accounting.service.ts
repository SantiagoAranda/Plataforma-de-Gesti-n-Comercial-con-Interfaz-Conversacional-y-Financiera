import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto } from './dto/create-entry.dto';

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  private validateLines(lines: { debit: number; credit: number; pucSubCode: string }[]) {
    if (!lines?.length) throw new BadRequestException('Entry must contain lines');

    for (const l of lines) {
      if (!l.pucSubCode) throw new BadRequestException('pucSubCode is required');
      const d = Number(l.debit ?? 0);
      const c = Number(l.credit ?? 0);
      const both = d > 0 && c > 0;
      const none = d === 0 && c === 0;
      if (both || none) throw new BadRequestException('Each line must have either debit or credit');
      if (d < 0 || c < 0) throw new BadRequestException('Debit/Credit must be >= 0');
    }
  }

  private sum(lines: { debit: number; credit: number }[]) {
    const debit = lines.reduce((a, l) => a + Number(l.debit ?? 0), 0);
    const credit = lines.reduce((a, l) => a + Number(l.credit ?? 0), 0);
    return { debit, credit };
  }

  async createEntry(businessId: string, dto: CreateEntryDto) {
    this.validateLines(dto.lines);

    // validar PUC existente (mínimo: que exista el código)
    const codes = [...new Set(dto.lines.map(l => l.pucSubCode))];
    const existing = await this.prisma.pucSubcuenta.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    if (existing.length !== codes.length) {
      throw new BadRequestException('One or more PUC codes are invalid');
    }

    const date = dto.date ? new Date(dto.date) : new Date();

    return this.prisma.accountingEntry.create({
      data: {
        businessId,
        date,
        memo: dto.memo ?? null,
        status: 'DRAFT',
        lines: {
          create: dto.lines.map(l => ({
            businessId,
            pucSubCode: l.pucSubCode,
            description: l.description ?? null,
            debit: l.debit,
            credit: l.credit,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async listEntries(
    businessId: string,
    opts: { status?: string; from?: string; to?: string },
  ) {
    const where: any = { businessId };
    if (opts.status) where.status = opts.status;
    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = new Date(opts.from);
      if (opts.to) where.date.lte = new Date(opts.to);
    }

    return this.prisma.accountingEntry.findMany({
      where,
      include: { lines: true },
      orderBy: { date: 'desc' },
    });
  }

  async getEntry(businessId: string, id: string) {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id, businessId },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    return entry;
  }

  async postEntry(businessId: string, id: string) {
    const entry = await this.getEntry(businessId, id);

    if (entry.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT entries can be posted');
    }

    const { debit, credit } = this.sum(entry.lines as any);
    if (Math.abs(debit - credit) > 0.0001) {
      throw new BadRequestException('Entry is not balanced');
    }

    return this.prisma.accountingEntry.update({
      where: { id: entry.id },
      data: { status: 'POSTED' },
      include: { lines: true },
    });
  }

  async voidEntry(businessId: string, id: string) {
    const entry = await this.getEntry(businessId, id);

    if (entry.status === 'VOID') {
      throw new BadRequestException('Entry already voided');
    }

    return this.prisma.accountingEntry.update({
      where: { id: entry.id },
      data: { status: 'VOID' },
      include: { lines: true },
    });
  }

  // PUC
  async searchPuc(q: string) {
    const query = q.trim();
    if (!query) return [];

    return this.prisma.pucSubcuenta.findMany({
      where: {
        OR: [
          { code: { contains: query } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { code: 'asc' },
    });
  }

  async getPuc(code: string) {
    const acc = await this.prisma.pucSubcuenta.findUnique({ where: { code } });
    if (!acc) throw new NotFoundException('PUC code not found');
    return acc;
  }
}