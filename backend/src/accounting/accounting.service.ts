// src/accounting/accounting.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { CreateMovementDto, MovementNature } from './dto/create-movement.dto';
import { MovementsQueryDto } from './dto/movements-query.dto';

// Nota: en tu schema debit/credit son Decimal. Prisma devuelve Decimal.js.
// Con Number(...) alcanza para sumar/mostrar.
type LineInput = {
  pucCuentaCode?: string;
  pucSubCode?: string;
  debit: number;
  credit: number;
  description?: string;
};

const MSG = {
  ENTRY_NOT_FOUND: 'Entry not found',
  ENTRY_NOT_EDITABLE: 'Entry not editable (only DRAFT)',
  ENTRY_NOT_DELETABLE: 'Entry not deletable (only DRAFT)',
  ENTRY_LINES_REQUIRED: 'Entry must contain lines',
  ENTRY_LINE_PUC_ONEOF: 'Provide either pucCuentaCode or pucSubCode',
  ENTRY_LINE_DEBIT_OR_CREDIT: 'Each line must have either debit or credit',
  ENTRY_LINE_NONNEGATIVE: 'Debit/Credit must be >= 0',
  INVALID_PUC_CUENTA: 'One or more PUC cuenta codes are invalid',
  INVALID_PUC_SUB: 'One or more PUC subcuenta codes are invalid',
  POST_ONLY_DRAFT: 'Only DRAFT entries can be posted',
  POST_NOT_BALANCED: 'Entry is not balanced',
  VOID_ALREADY: 'Entry already voided',
  MOV_AMOUNT_POSITIVE: 'Movement amount must be > 0',
  DATE_REQUIRED: 'Query param is required',
};

function parseDateOrThrow(s: string, fieldName: string) {
  if (!s) throw new BadRequestException(`${MSG.DATE_REQUIRED}: ${fieldName}`);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date: ${fieldName}`);
  return d;
}

// Clasificación simple por primer dígito del código (clase PUC)
function classFromPucCode(
  code: string,
):
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'INCOME'
  | 'EXPENSE'
  | 'MEMO'
  | 'CONTROL'
  | 'UNKNOWN' {
  const c = (code ?? '').trim();
  const first = c[0];
  if (first === '1') return 'ASSET';
  if (first === '2') return 'LIABILITY';
  if (first === '3') return 'EQUITY';
  if (first === '4') return 'INCOME';
  if (first === '5' || first === '6' || first === '7') return 'EXPENSE';
  if (first === '8') return 'MEMO';
  if (first === '9') return 'CONTROL';
  return 'UNKNOWN';
}

function isCashLike(pucCode: string) {
  // Ajustá según tu PUC. Con tu estructura, "11" suele ser Disponible.
  const c = (pucCode ?? '').trim();
  return c.startsWith('11');
}

/* ===========================
   PROGRESS (Activos/Pasivos/...)
   =========================== */

function parseProgressDateOrDefault(s?: string) {
  if (!s) {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Convención de signo para acumular saldos “positivos” por sección:
 * - Activo (1):    saldo = debit - credit
 * - Pasivo (2):    saldo = credit - debit
 * - Patrim (3):    saldo = credit - debit
 * - Ingresos (4):  saldo = credit - debit
 * - Gastos (5-7):  saldo = debit - credit
 */
function balanceSignedForClase(claseCode: string, debit: number, credit: number) {
  const cls = (claseCode ?? '').trim();
  if (cls === '1') return debit - credit;
  if (cls === '2') return credit - debit;
  if (cls === '3') return credit - debit;
  if (cls === '4') return credit - debit;
  if (cls === '5' || cls === '6' || cls === '7') return debit - credit;
  return debit - credit;
}

function sectionMeta(claseCode: string) {
  if (claseCode === '1') return { key: 'ASSET', title: 'Activos' };
  if (claseCode === '2') return { key: 'LIABILITY', title: 'Pasivos' };
  if (claseCode === '3') return { key: 'EQUITY', title: 'Patrimonio' };
  if (claseCode === '4') return { key: 'INCOME', title: 'Ingresos' };
  if (claseCode === '5' || claseCode === '6' || claseCode === '7')
    return { key: 'EXPENSE', title: 'Gastos' };
  return { key: 'OTHER', title: 'Otros' };
}

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  private validateLines(lines: LineInput[]) {
    if (!lines?.length) throw new BadRequestException(MSG.ENTRY_LINES_REQUIRED);

    for (const l of lines) {
      const hasCuenta = !!l.pucCuentaCode;
      const hasSub = !!l.pucSubCode;

      if ((hasCuenta && hasSub) || (!hasCuenta && !hasSub)) {
        throw new BadRequestException(MSG.ENTRY_LINE_PUC_ONEOF);
      }

      const d = Number(l.debit ?? 0);
      const c = Number(l.credit ?? 0);

      const both = d > 0 && c > 0;
      const none = d === 0 && c === 0;
      if (both || none) throw new BadRequestException(MSG.ENTRY_LINE_DEBIT_OR_CREDIT);

      if (d < 0 || c < 0) throw new BadRequestException(MSG.ENTRY_LINE_NONNEGATIVE);
    }
  }

  private sum(lines: { debit: any; credit: any }[]) {
    const debit = lines.reduce((a, l) => a + Number(l.debit ?? 0), 0);
    const credit = lines.reduce((a, l) => a + Number(l.credit ?? 0), 0);
    return { debit, credit };
  }

  private async validatePucExistence(lines: LineInput[]) {
    const cuentaCodes = [
      ...new Set(lines.filter(l => l.pucCuentaCode).map(l => l.pucCuentaCode as string)),
    ];
    const subCodes = [...new Set(lines.filter(l => l.pucSubCode).map(l => l.pucSubCode as string))];

    if (cuentaCodes.length) {
      const cuentas = await this.prisma.pucCuenta.findMany({
        where: { code: { in: cuentaCodes } },
        select: { code: true },
      });
      if (cuentas.length !== cuentaCodes.length) throw new BadRequestException(MSG.INVALID_PUC_CUENTA);
    }

    if (subCodes.length) {
      const subs = await this.prisma.pucSubcuenta.findMany({
        where: { code: { in: subCodes }, active: true },
        select: { code: true },
      });
      if (subs.length !== subCodes.length) throw new BadRequestException(MSG.INVALID_PUC_SUB);
    }
  }

  // ---------------- ENTRIES ----------------
  async createEntry(businessId: string, dto: CreateEntryDto) {
    this.validateLines(dto.lines as any);
    await this.validatePucExistence(dto.lines as any);

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
    if (!entry) throw new NotFoundException(MSG.ENTRY_NOT_FOUND);
    return entry;
  }

  async updateEntry(businessId: string, id: string, dto: UpdateEntryDto) {
    const entry = await this.getEntry(businessId, id);

    if (entry.status !== 'DRAFT') throw new BadRequestException(MSG.ENTRY_NOT_EDITABLE);

    const date = dto.date ? new Date(dto.date) : undefined;
    const memoProvided = dto.memo !== undefined;

    if (!dto.lines) {
      return this.prisma.accountingEntry.update({
        where: { id: entry.id },
        data: {
          ...(date ? { date } : {}),
          ...(memoProvided ? { memo: dto.memo ?? null } : {}),
        },
        include: { lines: true },
      });
    }

    const lines = dto.lines as any as LineInput[];
    this.validateLines(lines);
    await this.validatePucExistence(lines);

    return this.prisma.$transaction(async tx => {
      await tx.accountingLine.deleteMany({ where: { entryId: entry.id } });

      return tx.accountingEntry.update({
        where: { id: entry.id },
        data: {
          ...(date ? { date } : {}),
          ...(memoProvided ? { memo: dto.memo ?? null } : {}),
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
    });
  }

  async deleteEntry(businessId: string, id: string) {
    const entry = await this.getEntry(businessId, id);

    if (entry.status !== 'DRAFT') throw new BadRequestException(MSG.ENTRY_NOT_DELETABLE);

    return this.prisma.$transaction(async tx => {
      await tx.accountingLine.deleteMany({ where: { entryId: entry.id } });
      await tx.accountingEntry.delete({ where: { id: entry.id } });
      return { ok: true, id: entry.id };
    });
  }

  async postEntry(businessId: string, id: string) {
    const entry = await this.getEntry(businessId, id);

    if (entry.status !== 'DRAFT') throw new BadRequestException(MSG.POST_ONLY_DRAFT);

    const { debit, credit } = this.sum(entry.lines as any);
    if (Math.abs(debit - credit) > 0.0001) throw new BadRequestException(MSG.POST_NOT_BALANCED);

    return this.prisma.accountingEntry.update({
      where: { id: entry.id },
      data: { status: 'POSTED' },
      include: { lines: true },
    });
  }

  async voidEntry(businessId: string, id: string) {
    const entry = await this.getEntry(businessId, id);

    if (entry.status === 'VOID') throw new BadRequestException(MSG.VOID_ALREADY);

    return this.prisma.accountingEntry.update({
      where: { id: entry.id },
      data: { status: 'VOID' },
      include: { lines: true },
    });
  }

  // ---------------- MOVEMENTS ----------------
  async createMovement(businessId: string, dto: CreateMovementDto) {
    const amount = Number(dto.amount ?? 0);
    if (!(amount > 0)) throw new BadRequestException(MSG.MOV_AMOUNT_POSITIVE);

    const hasCuenta = !!dto.pucCuentaCode;
    const hasSub = !!dto.pucSubCode;
    if ((hasCuenta && hasSub) || (!hasCuenta && !hasSub)) {
      throw new BadRequestException(MSG.ENTRY_LINE_PUC_ONEOF);
    }

    const debit = dto.nature === MovementNature.DEBIT ? amount : 0;
    const credit = dto.nature === MovementNature.CREDIT ? amount : 0;

    const line: LineInput = {
      pucCuentaCode: dto.pucCuentaCode,
      pucSubCode: dto.pucSubCode,
      debit,
      credit,
      description: dto.description,
    };

    this.validateLines([line]);
    await this.validatePucExistence([line]);

    const date = dto.date ? new Date(dto.date) : new Date();

    return this.prisma.accountingEntry.create({
      data: {
        businessId,
        date,
        memo: dto.memo ?? null,
        status: 'DRAFT',
        lines: {
          create: [
            {
              pucCuentaCode: dto.pucCuentaCode ?? null,
              pucSubCode: dto.pucSubCode ?? null,
              description: dto.description ?? null,
              debit,
              credit,
            },
          ],
        },
      },
      include: { lines: true },
    });
  }

  async listMovements(businessId: string, q: MovementsQueryDto) {
    const onlyPosted = (q.onlyPosted ?? 'false') === 'true';

    const entryWhere: any = { businessId };
    if (onlyPosted) entryWhere.status = 'POSTED';
    else if (q.status) entryWhere.status = q.status;

    if (q.from || q.to) {
      entryWhere.date = {};
      if (q.from) entryWhere.date.gte = new Date(q.from);
      if (q.to) entryWhere.date.lte = new Date(q.to);
    }

    const text = (q.q ?? '').trim();
    if (text) {
      entryWhere.OR = [{ memo: { contains: text, mode: 'insensitive' } }];
    }

    const lineWhere: any = {};
    if (q.pucCode) {
      lineWhere.OR = [
        { pucCuentaCode: { contains: q.pucCode } },
        { pucSubCode: { contains: q.pucCode } },
      ];
    }
    if (text) {
      lineWhere.OR = (lineWhere.OR ?? []).concat([
        { description: { contains: text, mode: 'insensitive' } },
        { pucCuentaCode: { contains: text } },
        { pucSubCode: { contains: text } },
      ]);
    }

    const lines = await this.prisma.accountingLine.findMany({
      where: {
        ...lineWhere,
        entry: entryWhere,
      },
      include: {
        entry: { select: { id: true, date: true, status: true, memo: true } },
      },
      orderBy: [{ entry: { date: 'desc' } }],
      take: 500,
    });

    const codes = Array.from(
      new Set(
        lines
          .map(l => (l.pucSubCode ?? l.pucCuentaCode ?? '').trim())
          .filter(Boolean),
      ),
    );

    const [cuentas, subcuentas] = await this.prisma.$transaction([
      this.prisma.pucCuenta.findMany({
        where: { code: { in: codes } },
        select: { code: true, name: true },
      }),
      this.prisma.pucSubcuenta.findMany({
        where: { code: { in: codes } },
        select: { code: true, name: true },
      }),
    ]);

    const nameByCode = new Map<string, string>();
    for (const c of cuentas) nameByCode.set(c.code, c.name);
    for (const s of subcuentas) nameByCode.set(s.code, s.name);

    return lines.map(l => {
      const pucCode = (l.pucSubCode ?? l.pucCuentaCode ?? '').trim();
      const pucName = pucCode ? nameByCode.get(pucCode) ?? null : null;

      const debit = Number(l.debit ?? 0);
      const credit = Number(l.credit ?? 0);
      const amountSigned = debit - credit;

      return {
        id: l.id,
        entryId: l.entryId,
        date: l.entry.date,
        status: l.entry.status,
        memo: l.entry.memo ?? null,
        pucCode,
        pucName,
        description: l.description ?? null,
        debit,
        credit,
        amountSigned,
        class: pucCode ? classFromPucCode(pucCode) : 'UNKNOWN',
      };
    });
  }

  /**
   * ✅ Endpoint de “tarjetas con Progress” (Activos/Pasivos/…)
   * - SOLO FINALIZADO: usa solo AccountingEntry POSTED
   * - Agrupa por Grupo PUC (ej "11 Bancos y Efectivo")
   * - Devuelve porcentajes para barra de progreso (amount / totalSeccion)
   *
   * Nota: para “Balance” tiene sentido usar clases 1/2/3.
   * Si querés también Ingresos/Gastos, quedan incluidas (4/5/6/7).
   */
  async movementsProgress(businessId: string, opts: { date?: string }) {
    const date = parseProgressDateOrDefault(opts.date);

    const lines = await this.prisma.accountingLine.findMany({
      where: {
        entry: {
          businessId,
          status: 'POSTED',
          date: { lte: date },
        },
      },
      include: {
        // Para lines imputadas a CUENTA (pucCuentaCode)
        pucCuenta: {
          select: {
            code: true,
            name: true,
            grupo: { select: { code: true, name: true, claseCode: true } },
          },
        },
        // Para lines imputadas a SUBCUENTA (pucSubCode)
        pucSubcuenta: {
          select: {
            code: true,
            name: true,
            cuenta: {
              select: {
                code: true,
                name: true,
                grupo: { select: { code: true, name: true, claseCode: true } },
              },
            },
          },
        },
      },
    });

    type Bucket = { claseCode: string; grupoCode: string; label: string; amount: number };
    const buckets = new Map<string, Bucket>();

    for (const l of lines) {
      const debit = Number(l.debit ?? 0);
      const credit = Number(l.credit ?? 0);

      const grupoFromSub = l.pucSubcuenta?.cuenta?.grupo;
      const grupoFromCuenta = l.pucCuenta?.grupo;
      const grupo = grupoFromSub ?? grupoFromCuenta;
      if (!grupo) continue;

      const claseCode = grupo.claseCode; // "1".."7"
      const grupoCode = grupo.code;      // "11","14",...
      const label = grupo.name;          // nombre del grupo (seed)

      const amount = balanceSignedForClase(claseCode, debit, credit);

      const key = `${claseCode}:${grupoCode}`;
      const prev = buckets.get(key);
      if (!prev) buckets.set(key, { claseCode, grupoCode, label, amount });
      else prev.amount += amount;
    }

    // Agrupar por clase => secciones
    const byClase = new Map<string, Bucket[]>();
    for (const b of buckets.values()) {
      if (!byClase.has(b.claseCode)) byClase.set(b.claseCode, []);
      byClase.get(b.claseCode)!.push({ ...b, amount: Number(b.amount) });
    }

    const sections = Array.from(byClase.entries())
      .map(([claseCode, items]) => {
        // Filtrar montos <= 0 (evita barras raras si algo quedó negativo)
        const filtered = items.filter(i => i.amount > 0);

        const total = filtered.reduce((a, x) => a + x.amount, 0);
        filtered.sort((a, b) => b.amount - a.amount);

        const meta = sectionMeta(claseCode);

        return {
          key: meta.key,
          title: meta.title,
          total,
          items: filtered.map(i => ({
            code: i.grupoCode,
            label: i.label,
            amount: i.amount,
            progress: total > 0 ? i.amount / total : 0,
          })),
        };
      })
      // Orden “tipo Balance”
      .sort((a, b) => {
        const order = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'OTHER'];
        return order.indexOf(a.key) - order.indexOf(b.key);
      });

    return { date, sections };
  }

  // ---------------- REPORTS ----------------
  private async postedLinesInRange(businessId: string, from: Date, to: Date) {
    return this.prisma.accountingLine.findMany({
      where: {
        entry: { businessId, status: 'POSTED', date: { gte: from, lte: to } },
      },
    });
  }

  private async postedLinesUpTo(businessId: string, date: Date) {
    return this.prisma.accountingLine.findMany({
      where: {
        entry: { businessId, status: 'POSTED', date: { lte: date } },
      },
    });
  }

  async reportPnl(businessId: string, opts: { from: string; to: string }) {
    const from = parseDateOrThrow(opts.from, 'from');
    const to = parseDateOrThrow(opts.to, 'to');

    const lines = await this.postedLinesInRange(businessId, from, to);

    let income = 0;
    let expense = 0;

    for (const l of lines) {
      const pucCode = (l.pucSubCode ?? l.pucCuentaCode ?? '').trim();
      const cls = classFromPucCode(pucCode);
      const signed = Number(l.debit ?? 0) - Number(l.credit ?? 0);

      if (cls === 'INCOME') income += -signed;
      if (cls === 'EXPENSE') expense += signed;
    }

    return {
      from,
      to,
      income,
      expense,
      net: income - expense,
    };
  }

  async reportBalanceSheet(businessId: string, opts: { date: string }) {
    const date = parseDateOrThrow(opts.date, 'date');

    const lines = await this.postedLinesUpTo(businessId, date);

    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    for (const l of lines) {
      const pucCode = (l.pucSubCode ?? l.pucCuentaCode ?? '').trim();
      const cls = classFromPucCode(pucCode);
      const signed = Number(l.debit ?? 0) - Number(l.credit ?? 0);

      if (cls === 'ASSET') assets += signed;
      if (cls === 'LIABILITY') liabilities += -signed;
      if (cls === 'EQUITY') equity += -signed;
    }

    return {
      date,
      assets,
      liabilities,
      equity,
      check: assets - (liabilities + equity),
    };
  }

  async reportCashFlow(businessId: string, opts: { from: string; to: string }) {
    const from = parseDateOrThrow(opts.from, 'from');
    const to = parseDateOrThrow(opts.to, 'to');

    const lines = await this.postedLinesInRange(businessId, from, to);

    let cashNet = 0;
    for (const l of lines) {
      const pucCode = (l.pucSubCode ?? l.pucCuentaCode ?? '').trim();
      if (!isCashLike(pucCode)) continue;

      const signed = Number(l.debit ?? 0) - Number(l.credit ?? 0);
      cashNet += signed;
    }

    return {
      from,
      to,
      cashNet,
      rule: 'Only PUC codes starting with "11" (Disponible). Adjust isCashLike() if needed.',
    };
  }

  // ---------------- PUC ----------------
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