import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto } from './dto/create-entry.dto';

type LineInput = {
  pucCuentaCode?: string;
  pucSubCode?: string;
  debit: number;
  credit: number;
  description?: string;
};

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  private validateLines(lines: LineInput[]) {
    if (!lines?.length) throw new BadRequestException('Entry must contain lines');

    for (const l of lines) {
      const hasCuenta = !!l.pucCuentaCode;
      const hasSub = !!l.pucSubCode;

      // exactamente uno: cuenta o subcuenta
      if ((hasCuenta && hasSub) || (!hasCuenta && !hasSub)) {
        throw new BadRequestException('Provide either pucCuentaCode or pucSubCode');
      }

      const d = Number(l.debit ?? 0);
      const c = Number(l.credit ?? 0);

      const both = d > 0 && c > 0;
      const none = d === 0 && c === 0;
      if (both || none) throw new BadRequestException('Each line must have either debit or credit');

      if (d < 0 || c < 0) throw new BadRequestException('Debit/Credit must be >= 0');
    }
  }

  private sum(lines: { debit: any; credit: any }[]) {
    const debit = lines.reduce((a, l) => a + Number(l.debit ?? 0), 0);
    const credit = lines.reduce((a, l) => a + Number(l.credit ?? 0), 0);
    return { debit, credit };
  }

  async createEntry(businessId: string, dto: CreateEntryDto) {
    // dto.lines ahora debe permitir pucCuentaCode o pucSubCode
    this.validateLines(dto.lines as any);

    // validar existencia en PUC según tipo
    const cuentaCodes = [
      ...new Set((dto.lines as any[]).filter(l => l.pucCuentaCode).map(l => l.pucCuentaCode as string)),
    ];
    const subCodes = [
      ...new Set((dto.lines as any[]).filter(l => l.pucSubCode).map(l => l.pucSubCode as string)),
    ];

    if (cuentaCodes.length) {
      const cuentas = await this.prisma.pucCuenta.findMany({
        where: { code: { in: cuentaCodes } },
        select: { code: true },
      });
      if (cuentas.length !== cuentaCodes.length) {
        throw new BadRequestException('One or more PUC cuenta codes are invalid');
      }
    }

    if (subCodes.length) {
      const subs = await this.prisma.pucSubcuenta.findMany({
        where: { code: { in: subCodes }, active: true },
        select: { code: true },
      });
      if (subs.length !== subCodes.length) {
        throw new BadRequestException('One or more PUC subcuenta codes are invalid');
      }
    }

    const date = dto.date ? new Date(dto.date) : new Date();

    return this.prisma.accountingEntry.create({
      data: {
        businessId,
        date,
        memo: dto.memo ?? null,
        status: 'DRAFT',
        lines: {
          create: (dto.lines as any[]).map(l => ({
            pucCuentaCode: l.pucCuentaCode ?? null,
            pucSubCode: l.pucSubCode ?? null,
            description: l.description ?? null,
            debit: l.debit,
            credit: l.credit,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async listEntries(businessId: string, opts: { status?: string; from?: string; to?: string }) {
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

  // PUC (busca cuentas y subcuentas, unificado)
  async searchPuc(q: string) {
    const query = q.trim();
    if (!query) return [];

    const [cuentas, subcuentas] = await this.prisma.$transaction([
      this.prisma.pucCuenta.findMany({
        where: {
          OR: [
            { code: { contains: query } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
        orderBy: { code: 'asc' },
      }),
      this.prisma.pucSubcuenta.findMany({
        where: {
          active: true,
          OR: [
            { code: { contains: query } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
        orderBy: { code: 'asc' },
      }),
    ]);

    return [
      ...cuentas.map(c => ({ kind: 'CUENTA' as const, code: c.code, name: c.name })),
      ...subcuentas.map(s => ({ kind: 'SUBCUENTA' as const, code: s.code, name: s.name })),
    ];
  }

  async getPuc(code: string) {
    // intenta subcuenta primero, luego cuenta
    const sub = await this.prisma.pucSubcuenta.findUnique({ where: { code } });
    if (sub) return { kind: 'SUBCUENTA' as const, ...sub };

    const cuenta = await this.prisma.pucCuenta.findUnique({ where: { code } });
    if (cuenta) return { kind: 'CUENTA' as const, ...cuenta };

    throw new NotFoundException('PUC code not found');
  }

  async listPucClases() {
  return this.prisma.pucClase.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, name: true },
  });
}

async listPucGrupos(claseCode: string) {
  const code = (claseCode ?? '').trim();
  if (!code) throw new BadRequestException('Query param "clase" is required');

  return this.prisma.pucGrupo.findMany({
    where: { claseCode: code },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, claseCode: true },
  });
}

}
