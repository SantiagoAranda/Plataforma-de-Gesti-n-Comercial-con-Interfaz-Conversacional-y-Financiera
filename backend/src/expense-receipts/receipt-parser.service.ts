import { Injectable } from '@nestjs/common';

type ParsedReceipt = {
  amount?: number;
  paidAt?: Date;
  destinationName?: string;
  destinationBank?: string;
  destinationAccount?: string;
  bankName?: string;
  reference?: string;
  description?: string;
  confidence: number;
  parsedPayload: Record<string, unknown>;
};

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

@Injectable()
export class ReceiptParserService {
  parse(rawText: string): ParsedReceipt {
    const text = this.clean(rawText);
    const amount = this.extractAmount(text);
    const paidAt = this.extractDate(text);
    const reference = this.extractByLabel(text, [
      'referencia',
      'comprobante',
      'transaccion',
      'operacion',
      'numero',
      'id',
    ]);
    const destinationName = this.extractByLabel(text, [
      'para',
      'destinatario',
      'beneficiario',
      'nombre',
      'a nombre de',
    ]);
    const destinationBank = this.extractBank(text, [
      'bancolombia',
      'davivienda',
      'daviplata',
      'nequi',
      'banco de bogota',
      'bbva',
      'nu',
    ]);
    const destinationAccount = this.extractByLabel(text, [
      'cuenta',
      'producto',
      'celular',
    ]);

    let hits = 0;
    for (const value of [amount, paidAt, reference, destinationName, destinationBank]) {
      if (value) hits += 1;
    }

    return {
      amount,
      paidAt,
      reference,
      destinationName,
      destinationBank,
      destinationAccount,
      bankName: destinationBank,
      description: destinationName ? `Comprobante ${destinationName}` : undefined,
      confidence: Math.min(0.95, hits / 5),
      parsedPayload: {
        extractedFields: {
          amount: Boolean(amount),
          paidAt: Boolean(paidAt),
          reference: Boolean(reference),
          destinationName: Boolean(destinationName),
          destinationBank: Boolean(destinationBank),
        },
      },
    };
  }

  private clean(value: string) {
    return value
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private extractAmount(text: string) {
    const candidates = Array.from(
      text.matchAll(/(?:\$|cop|valor|monto|total|pagaste|enviaste)?\s*((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)/gi),
    )
      .map((match) => this.normalizeColombianAmount(match[1]))
      .filter((value): value is number => value !== undefined)
      .filter((value) => value > 0);

    if (!candidates.length) return undefined;
    return Math.max(...candidates);
  }

  private normalizeColombianAmount(raw: string) {
    const value = raw.replace(/[^\d.,]/g, '');
    if (!value) return undefined;

    const hasComma = value.includes(',');
    const hasDot = value.includes('.');

    let normalized = value;
    if (hasComma && hasDot) {
      normalized = value.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
      const parts = value.split('.');
      normalized =
        parts.at(-1)?.length === 2 && parts.length === 2
          ? value
          : value.replace(/\./g, '');
    } else if (hasComma) {
      const parts = value.split(',');
      normalized =
        parts.at(-1)?.length === 2 && parts.length === 2
          ? value.replace(',', '.')
          : value.replace(/,/g, '');
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? Number(number.toFixed(2)) : undefined;
  }

  private extractDate(text: string) {
    const lower = text.toLowerCase();
    const longDate = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm))?)?/i.exec(
      lower,
    );

    if (longDate) {
      const month = MONTHS[this.strip(longDate[2])];
      if (month !== undefined) {
        let hour = Number(longDate[4] ?? 0);
        const minute = Number(longDate[5] ?? 0);
        const meridiem = (longDate[6] ?? '').replace(/\s/g, '');
        if (/p\.?m\.?|pm/.test(meridiem) && hour < 12) hour += 12;
        if (/a\.?m\.?|am/.test(meridiem) && hour === 12) hour = 0;
        return new Date(Number(longDate[3]), month, Number(longDate[1]), hour, minute);
      }
    }

    const numeric = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(
      text,
    );
    if (!numeric) return undefined;

    const year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    const date = new Date(
      year,
      Number(numeric[2]) - 1,
      Number(numeric[1]),
      Number(numeric[4] ?? 0),
      Number(numeric[5] ?? 0),
    );

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private extractByLabel(text: string, labels: string[]) {
    for (const label of labels) {
      const regex = new RegExp(`${label}\\s*[:#-]?\\s*([^\\n]{3,80})`, 'i');
      const match = regex.exec(text);
      if (match?.[1]) return match[1].trim().replace(/\s{2,}/g, ' ');
    }
    return undefined;
  }

  private extractBank(text: string, banks: string[]) {
    const normalized = this.strip(text);
    return banks.find((bank) => normalized.includes(this.strip(bank)));
  }

  private strip(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
