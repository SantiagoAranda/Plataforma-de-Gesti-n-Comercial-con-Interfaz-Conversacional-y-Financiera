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
  /** Ventas brutas (antes de devoluciones) */
  grossSales: number;
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
  /** Utilidad líquida (después de impuesto) */
  netIncome: number;

  /** Utilidad del ejercicio (después de reserva) */
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

export type BreakdownItem = {
  key: string;
  label: string;
  value: number;
  operator?: "+" | "-" | "=";
  kind?: "base" | "addition" | "deduction" | "result";
  percentage?: number;
};

export type CompositionFormula = {
  key: string;
  title: string;
  expression: string;
  resultValue: number;
  resultPercentage?: number;
  items: BreakdownItem[];
};

export type VisibleMetric = {
  key: string;
  label: string;
  value: number;
  percentage?: number;
  highlight?: boolean;
  breakdown?: {
    title?: string;
    expression?: string;
    items: BreakdownItem[];
  };
};

export type MovementMetricsViewModel = {
  summaryMetrics: VisibleMetric[];
  formulas: CompositionFormula[];
  percentageBase: number;
  chartData: Array<{
    key: string;
    label: string;
    value: number;
    percentage: number;
  }>;
};
