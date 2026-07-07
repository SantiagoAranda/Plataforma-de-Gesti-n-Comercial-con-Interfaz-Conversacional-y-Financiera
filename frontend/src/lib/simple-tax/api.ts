import { api } from "@/src/lib/api";

export type SimpleTaxConfig = {
  id: string | null;
  businessId: string;
  enabled: boolean;
  taxYear: number;
  groupCode: string | null;
  activityLabel: string | null;
  ciiuCode: string | null;
  filingMode: "BIMONTHLY_ADVANCE" | "ANNUAL_EXCEPTION";
};

export type SimpleTaxRateBracket = {
  id: string;
  taxYear: number;
  periodType: "BIMONTHLY" | "ANNUAL";
  groupCode: string;
  groupName: string;
  lowerUvt: number | string;
  upperUvt: number | string | null;
  rate: number | string;
};

export type SimpleTaxAppliedBracket = {
  lowerUvt: number | string;
  upperUvt: number | string | null;
  rate: number | string;
};

export type SimpleTaxIncludedSale = {
  id: string;
  displayNumber?: string | null;
  customerName?: string | null;
  fiscalDate: string;
  subtotal: number;
  status: string;
};

export type SimpleTaxCalculation = {
  id?: string;
  status?: "DRAFT" | "CALCULATED" | "POSTED" | "PAID";
  taxYear: number;
  periodNumber: number;
  periodStart: string;
  periodEnd: string;
  uvtValue?: number;
  salesGrossIncome: number;
  manualGrossIncome: number;
  excludedIncome: number;
  taxableGrossIncome: number;
  taxableGrossIncomeUvt: number;
  groupCode: string;
  groupName: string;
  appliedRate: number;
  grossSimpleTax: number;
  electronicPaymentsIncome: number;
  electronicPaymentsDiscount: number;
  pensionContributionsDiscount: number;
  totalDiscounts: number;
  netSimpleTax: number;
  bracket?: SimpleTaxAppliedBracket | null;
  calculationSnapshot?: {
    bracket?: SimpleTaxAppliedBracket | null;
    includedSales?: SimpleTaxIncludedSale[];
  } | null;
  includedSales?: SimpleTaxIncludedSale[];
  calculatedAt?: string;
  accountingEntryId?: string | null;
  paidAccountingEntryId?: string | null;
  postedAt?: string | null;
  paidAt?: string | null;
  paidAmount?: number | string | null;
  paymentAccountCode?: string | null;
  warnings?: string[];
  filingMode?: "BIMONTHLY_ADVANCE" | "ANNUAL_EXCEPTION";
  informativeOnly?: boolean;
};

export type SimpleTaxPeriod = SimpleTaxCalculation & {
  id: string;
  status: "DRAFT" | "CALCULATED" | "POSTED" | "PAID";
  calculationSnapshot?: SimpleTaxCalculation | null;
};

export function getSimpleTaxConfig() {
  return api<SimpleTaxConfig>("/settings/simple-tax-config");
}

export function updateSimpleTaxConfig(data: {
  enabled: boolean;
  taxYear: number;
  groupCode?: string | null;
  activityLabel?: string | null;
  ciiuCode?: string | null;
  filingMode?: "BIMONTHLY_ADVANCE" | "ANNUAL_EXCEPTION";
}) {
  return api<SimpleTaxConfig>("/settings/simple-tax-config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function listSimpleTaxRates(taxYear: number, periodType: "BIMONTHLY" | "ANNUAL" = "BIMONTHLY") {
  return api<SimpleTaxRateBracket[]>(
    `/settings/simple-tax-rates?taxYear=${taxYear}&periodType=${periodType}`,
  );
}

export function listSimpleTaxPeriods(taxYear: number) {
  return api<SimpleTaxPeriod[]>(`/tax/simple/periods?taxYear=${taxYear}`);
}

export function calculateSimpleTaxPeriod(data: {
  taxYear: number;
  periodNumber: number;
  manualGrossIncome?: number;
  excludedIncome?: number;
  electronicPaymentsIncome?: number;
  pensionContributionsDiscount?: number;
  notes?: string | null;
}) {
  return api<SimpleTaxCalculation>("/tax/simple/calculate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function postSimpleTaxPeriod(id: string) {
  return api<SimpleTaxPeriod>(`/tax/simple/periods/${id}/post`, {
    method: "PATCH",
  });
}

export function paySimpleTaxPeriod(
  id: string,
  data: {
    paymentDate: string;
    paymentMethod: "CASH" | "BANK";
    paymentAccountCode?: "110505" | "111005";
    paidAmount: number;
    notes?: string | null;
  },
) {
  return api<SimpleTaxPeriod>(`/tax/simple/periods/${id}/pay`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
