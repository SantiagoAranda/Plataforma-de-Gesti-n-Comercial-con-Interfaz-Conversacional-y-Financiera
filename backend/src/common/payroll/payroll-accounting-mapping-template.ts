import { PayrollAccountingSide } from '@prisma/client';
import { parse } from 'csv-parse/sync';

export type PayrollAccountingMappingTemplateRow = {
  concept_code: string;
  concept_name: string;
  account_code: string;
  account_name: string;
  side: PayrollAccountingSide;
};

const REQUIRED_FIELDS = [
  'concept_code',
  'concept_name',
  'account_code',
  'account_name',
] as const;

/** Parses and validates the shared payroll accounting mapping CSV at its boundary. */
export function parsePayrollAccountingMappingTemplate(
  source: string,
): PayrollAccountingMappingTemplateRow[] {
  const rows = parse<Record<string, unknown>>(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    record_delimiter: '\n',
  });

  return rows.map((row, index) => {
    const required = (field: (typeof REQUIRED_FIELDS)[number]) => {
      const value = row[field];
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(
          `Invalid payroll accounting mapping CSV row ${index + 2}: required values are missing.`,
        );
      }
      return value;
    };
    if (
      row.side !== PayrollAccountingSide.DEBIT &&
      row.side !== PayrollAccountingSide.CREDIT
    ) {
      throw new Error(
        `Invalid payroll accounting mapping CSV row ${index + 2}: side must be DEBIT or CREDIT.`,
      );
    }
    return {
      concept_code: required('concept_code'),
      concept_name: required('concept_name'),
      account_code: required('account_code'),
      account_name: required('account_name'),
      side: row.side,
    };
  });
}
