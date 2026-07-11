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
  rutActivity?: {
    ciiuCode: string | null;
    ciiuDescription: string | null;
  };
  hasSimpleTaxResponsibility?: boolean;
  groupResolution?: SimpleTaxGroupResolution | null;
};

export type SimpleTaxGroupResolution =
  | {
      status: "RESOLVED";
      groupCode: string;
      groupName: string | null;
      ciiuCode: string;
      ciiuDescription: string | null;
      source: string;
    }
  | {
      status: "NO_RUT_ACTIVITY" | "NOT_FOUND";
      groupCode: null;
      groupName: null;
      ciiuCode: string | null;
      ciiuDescription: string | null;
      source: null;
    }
  | {
      status: "AMBIGUOUS";
      groupCode: null;
      groupName: null;
      ciiuCode: string;
      ciiuDescription: string | null;
      source: string;
      candidates: Array<{ groupCode: string; groupName: string | null }>;
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
  groupResolution?: SimpleTaxGroupResolution | null;
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

export type SimpleTaxAnnualReturnStatus = "DRAFT" | "CALCULATED" | "POSTED" | "PAID";

export type SimpleTaxAnnualReturn = {
  id: string;
  businessId: string;
  taxYear: number;
  status: SimpleTaxAnnualReturnStatus;
  uvtValue: number | string;
  grossIncome: number | string;
  manualGrossIncome: number | string;
  excludedIncome: number | string;
  taxableGrossIncome: number | string;
  taxableGrossIncomeUvt: number | string;
  groupCode: string;
  groupName: string;
  appliedRate: number | string;
  grossSimpleTax: number | string;
  electronicPaymentsIncome: number | string;
  electronicPaymentsDiscount: number | string;
  pensionContributionsDiscount: number | string;
  totalDiscounts: number | string;
  netAnnualTax: number | string;
  bimonthlyAdvancesTotal: number | string;
  balanceDue: number | string;
  balanceInFavor: number | string;
  bracket?: SimpleTaxAppliedBracket | null;
  calculationSnapshot?: {
    bracket?: SimpleTaxAppliedBracket | null;
    includedSales?: SimpleTaxIncludedSale[];
  } | null;
  includedSales?: SimpleTaxIncludedSale[];
  accountingEntryId?: string | null;
  paidAccountingEntryId?: string | null;
  postedAt?: string | null;
  paidAt?: string | null;
  paidAmount?: number | string | null;
  paymentAccountCode?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listSimpleTaxAnnualReturns() {
  return api<SimpleTaxAnnualReturn[]>("/tax/simple/annual");
}

export function getSimpleTaxAnnualReturn(year: number) {
  return api<SimpleTaxAnnualReturn | null>(`/tax/simple/annual/${year}`);
}

export function calculateSimpleTaxAnnualReturn(data: {
  taxYear: number;
  manualGrossIncome?: number;
  excludedIncome?: number;
  electronicPaymentsIncome?: number;
  pensionContributionsDiscount?: number;
}) {
  return api<SimpleTaxAnnualReturn>("/tax/simple/annual/calculate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function postSimpleTaxAnnualReturn(id: string) {
  return api<SimpleTaxAnnualReturn>(`/tax/simple/annual/${id}/post`, {
    method: "PATCH",
  });
}

export function paySimpleTaxAnnualReturn(
  id: string,
  data: {
    paymentDate: string;
    paymentMethod: "CASH" | "BANK";
    paymentAccountCode?: "110505" | "111005";
    paidAmount: number;
    notes?: string | null;
  },
) {
  return api<SimpleTaxAnnualReturn>(`/tax/simple/annual/${id}/pay`, {
    method: "PATCH",
    body: JSON.stringify(data),
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
