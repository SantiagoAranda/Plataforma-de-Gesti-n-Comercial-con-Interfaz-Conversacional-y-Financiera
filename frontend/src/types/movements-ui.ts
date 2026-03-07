import type React from "react";

export type MovementPeriodKey = "THIS_MONTH" | "LAST_30_DAYS" | "PREVIOUS_MONTH";

export type MovementMetricLine = {
  key: string;
  label: string;
  value: number;
  percentage?: number | null;
  tone?: "positive" | "negative" | "neutral" | "warning";
};

export type MovementDashboardMetrics = {
  periodLabel: string;
  hasData: boolean;

  sales: number;
  returns: number;
  netSales: number;

  costs: number;
  grossProfit: number;

  operatingExpenses: number;
  operatingProfit: number;

  nonOperatingIncome: number;
  nonOperatingExpenses: number;

  profitBeforeTax: number;
  taxProvision: number;
  legalReserve: number;

  netProfit: number;

  topKpis: Array<{
    key: string;
    label: string;
    value: number;
    tone?: "positive" | "negative" | "neutral" | "warning";
    icon?: React.ReactNode;
  }>;

  breakdown: MovementMetricLine[];
};
