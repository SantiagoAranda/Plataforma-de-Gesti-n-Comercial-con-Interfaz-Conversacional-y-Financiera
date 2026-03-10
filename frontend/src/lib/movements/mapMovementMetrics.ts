import type { BackendMovement } from "@/src/services/accounting";
import type {
  MovementDashboardMetrics,
  MovementMetricsViewModel,
  CompositionFormula,
  VisibleMetric,
  BreakdownItem,
} from "@/src/types/movements-ui";

function safeNum(n: unknown) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function mapMovementMetrics(rows: BackendMovement[], periodLabel: string): MovementDashboardMetrics & {
  view: MovementMetricsViewModel;
} {
  let grossSales = 0; // Ventas brutas
  let returns = 0;
  let costs = 0;
  let operatingExpenses = 0;
  let nonOperatingExpenses = 0;
  let nonOperatingIncome = 0;

  for (const r of rows ?? []) {
    const cls = r.class;
    const code = String(r.pucCode ?? "");
    const debit = safeNum(r.debit);
    const credit = safeNum(r.credit);

    if (cls === "INCOME") {
      const value = credit - debit;
      if (value >= 0) grossSales += value;
      else returns += Math.abs(value);
      continue;
    }

    if (cls === "EXPENSE") {
      const value = debit - credit;
      const first = code.trim()[0];
      if (first === "5") costs += value;
      else if (first === "6") operatingExpenses += value;
      else nonOperatingExpenses += value;
      continue;
    }

    // Treat unclassified accounts as non-operating income/other.
    if (cls === "UNKNOWN") {
      nonOperatingIncome += credit - debit;
    }
  }

  const netSales = grossSales - returns;
  const grossProfit = netSales - costs; // Utilidad
  const operatingProfit = grossProfit - operatingExpenses; // Utilidad operacional
  const profitBeforeTax = operatingProfit + nonOperatingIncome - nonOperatingExpenses; // Utilidad antes de impuesto

  // MVP: sin fuente real aún
  const taxProvision = 0;
  const legalReserve = 0;
  const netIncome = profitBeforeTax - taxProvision; // Utilidad líquida
  const netProfit = netIncome - legalReserve; // Utilidad del ejercicio

  const baseCompositionValue = Math.abs(netSales + nonOperatingIncome);
  const pct = (v: number) => {
    const base = baseCompositionValue;
    if (!base || !Number.isFinite(base)) return 0;
    return (Math.abs(v) / base) * 100;
  };
  const pctRounded = (v: number) => Number(pct(v).toFixed(2));

  const summaryMetrics: VisibleMetric[] = [
    {
      key: "netSales",
      label: "Ventas Netas",
      value: netSales,
      percentage: pctRounded(netSales),
      breakdown: {
        expression: "Ventas - Devoluciones",
        items: [
          { label: "Ventas", value: grossSales, operator: "+" },
          { label: "Devoluciones", value: returns, operator: "-" },
          { label: "Resultado", value: netSales, kind: "result" },
        ],
      },
    },
    {
      key: "nonOperatingIncome",
      label: "Ingresos No Operacionales",
      value: nonOperatingIncome,
      percentage: pctRounded(nonOperatingIncome),
      breakdown: {
        expression: "Ingresos no operacionales registrados",
        items: [{ label: "Ingresos No Operacionales", value: nonOperatingIncome, operator: "+", kind: "base" }],
      },
    },
    {
      key: "returns",
      label: "Devoluciones",
      value: returns,
      percentage: pctRounded(returns),
      breakdown: {
        expression: "Ingresos en débito",
        items: [{ label: "Devoluciones", value: returns, operator: "-", kind: "deduction" }],
      },
    },
    {
      key: "costs",
      label: "Costos",
      value: costs,
      percentage: pctRounded(costs),
      breakdown: {
        expression: "Cuentas 5XXXX",
        items: [{ label: "Costos", value: costs, operator: "-", kind: "deduction" }],
      },
    },
    {
      key: "operatingExpenses",
      label: "Total Gastos Operacional",
      value: operatingExpenses,
      percentage: pctRounded(operatingExpenses),
      breakdown: {
        expression: "Cuentas 6XXXX",
        items: [{ label: "Gastos operacionales", value: operatingExpenses, operator: "-", kind: "deduction" }],
      },
    },
    {
      key: "nonOperatingExpenses",
      label: "Gastos No Operacionales",
      value: nonOperatingExpenses,
      percentage: pctRounded(nonOperatingExpenses),
      breakdown: {
        expression: "Gastos no operacionales",
        items: [{ label: "Gastos no operacionales", value: nonOperatingExpenses, operator: "-", kind: "deduction" }],
      },
    },
    {
      key: "taxProvision",
      label: "Provisiones Impuesto de Renta",
      value: taxProvision,
      percentage: pctRounded(taxProvision),
      breakdown: {
        expression: "Provisión configurada",
        items: [{ label: "Provisión", value: taxProvision, operator: "-", kind: "deduction" }],
      },
    },
    {
      key: "legalReserve",
      label: "Reserva Legal",
      value: legalReserve,
      percentage: pctRounded(legalReserve),
      breakdown: {
        expression: "Reserva configurada",
        items: [{ label: "Reserva", value: legalReserve, operator: "-", kind: "deduction" }],
      },
    },
    {
      key: "netProfit",
      label: "Utilidad del Ejercicio",
      value: netProfit,
      percentage: pctRounded(netProfit),
      highlight: true,
      breakdown: {
        expression: "Utilidad Líquida - Reserva Legal",
        items: [
          { label: "Utilidad Líquida", value: netIncome, operator: "+" },
          { label: "Reserva Legal", value: legalReserve, operator: "-", kind: "deduction" },
          { label: "Resultado", value: netProfit, kind: "result" },
        ],
      },
    },
  ];

  const buildFormula = (
    key: string,
    title: string,
    expression: string,
    resultValue: number,
    items: BreakdownItem[],
  ): CompositionFormula => ({
    key,
    title,
    expression,
    resultValue,
    resultPercentage: pctRounded(resultValue),
    items: items.map((i) => ({ ...i, percentage: pctRounded(i.value) })),
  });

  const formulas: CompositionFormula[] = [
    buildFormula("netSales", "Ventas Netas", "Ventas - Devoluciones", netSales, [
      { label: "Ventas", value: grossSales, operator: "+", kind: "base" },
      { label: "Devoluciones", value: returns, operator: "-", kind: "deduction" },
      { label: "Resultado", value: netSales, kind: "result" },
    ]),
    buildFormula("grossProfit", "Utilidad", "Ventas Netas - Costos", grossProfit, [
      { label: "Ventas Netas", value: netSales, operator: "+", kind: "base" },
      { label: "Costos", value: costs, operator: "-", kind: "deduction" },
      { label: "Resultado", value: grossProfit, kind: "result" },
    ]),
    buildFormula("operatingProfit", "Utilidad Operacional", "Utilidad - Total Gastos Operacional", operatingProfit, [
      { label: "Utilidad", value: grossProfit, operator: "+", kind: "base" },
      { label: "Total Gastos Operacional", value: operatingExpenses, operator: "-", kind: "deduction" },
      { label: "Resultado", value: operatingProfit, kind: "result" },
    ]),
    buildFormula("profitBeforeTax", "Utilidad Antes de Impuesto", "Utilidad Operacional + Ingresos No Operacionales - Gastos No Operacionales", profitBeforeTax, [
      { label: "Utilidad Operacional", value: operatingProfit, operator: "+", kind: "base" },
      { label: "Ingresos No Operacionales", value: nonOperatingIncome, operator: "+", kind: "addition" },
      { label: "Gastos No Operacionales", value: nonOperatingExpenses, operator: "-", kind: "deduction" },
      { label: "Resultado", value: profitBeforeTax, kind: "result" },
    ]),
    buildFormula("netIncome", "Utilidad Líquida", "Utilidad Antes de Impuesto - Provisiones Impuesto de Renta", netIncome, [
      { label: "Utilidad Antes de Impuesto", value: profitBeforeTax, operator: "+", kind: "base" },
      { label: "Provisiones Impuesto de Renta", value: taxProvision, operator: "-", kind: "deduction" },
      { label: "Resultado", value: netIncome, kind: "result" },
    ]),
    buildFormula("netProfit", "Utilidad del Ejercicio", "Utilidad Líquida - Reserva Legal", netProfit, [
      { label: "Utilidad Líquida", value: netIncome, operator: "+", kind: "base" },
      { label: "Reserva Legal", value: legalReserve, operator: "-", kind: "deduction" },
      { label: "Resultado", value: netProfit, kind: "result", },
    ]),
  ];

  const breakdown = [
    { key: "grossSales", label: "Ventas brutas", value: grossSales, tone: "positive" as const },
    { key: "returns", label: "Devoluciones", value: returns, tone: "negative" as const },
    { key: "netSales", label: "Ventas netas", value: netSales, tone: "positive" as const },
    { key: "costs", label: "Costos", value: costs, tone: "negative" as const },
    { key: "grossProfit", label: "Utilidad", value: grossProfit, tone: "positive" as const },
    { key: "operatingExpenses", label: "Gastos operativos", value: operatingExpenses, tone: "negative" as const },
    {
      key: "operatingProfit",
      label: "Utilidad operativa",
      value: operatingProfit,
      tone: (operatingProfit >= 0 ? "positive" : "negative") as "positive" | "negative",
    },
    { key: "nonOperatingIncome", label: "Ingresos no operativos", value: nonOperatingIncome, tone: "positive" as const },
    { key: "nonOperatingExpenses", label: "Gastos no operativos", value: nonOperatingExpenses, tone: "negative" as const },
    {
      key: "profitBeforeTax",
      label: "Utilidad antes de impuesto",
      value: profitBeforeTax,
      tone: (profitBeforeTax >= 0 ? "positive" : "negative") as "positive" | "negative",
    },
    {
      key: "netIncome",
      label: "Utilidad líquida",
      value: netIncome,
      tone: (netIncome >= 0 ? "positive" : "negative") as "positive" | "negative",
    },
    {
      key: "netProfit",
      label: "Utilidad del ejercicio",
      value: netProfit,
      tone: (netProfit >= 0 ? "positive" : "negative") as "positive" | "negative",
    },
  ];

  const topKpis = [
    { key: "netSales", label: "Ventas netas", value: netSales, tone: "positive" as const },
    { key: "costs", label: "Costos", value: costs, tone: "negative" as const },
    { key: "operatingExpenses", label: "Gastos", value: operatingExpenses + nonOperatingExpenses, tone: "negative" as const },
    {
      key: "operatingProfit",
      label: "Utilidad operativa",
      value: operatingProfit,
      tone: (operatingProfit >= 0 ? "positive" : "negative") as "positive" | "negative",
    },
  ];

  const hasData = rows.length > 0;

  return {
    periodLabel,
    hasData,
    sales: grossSales, // alias para compatibilidad
    grossSales,
    returns,
    netSales,
    costs,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    nonOperatingIncome,
    nonOperatingExpenses,
    profitBeforeTax,
    taxProvision,
    legalReserve,
    netIncome,
    netProfit,
    topKpis,
    breakdown,
    view: {
      summaryMetrics,
      formulas,
      percentageBase: baseCompositionValue,
      chartData: (() => {
        const keys = ["returns", "costs", "operatingExpenses", "nonOperatingExpenses", "taxProvision", "legalReserve", "netProfit", "netSales", "nonOperatingIncome"];
        const items = summaryMetrics
          .filter((m) => keys.includes(m.key))
          .map((m) => ({
            key: m.key,
            label: m.label,
            value: m.value,
            percentage: Math.max(0, m.percentage ?? 0),
          }));

        if (!items.length) return items;

        const total = items.reduce((s, i) => s + i.percentage, 0);
        if (!Number.isFinite(total) || total === 0) {
          return items.map((i) => ({ ...i, percentage: 0 }));
        }

        let acc = 0;
        const normalized = items.map((i, idx) => {
          if (idx === items.length - 1) {
            const remaining = Number((100 - acc).toFixed(2));
            return { ...i, percentage: Math.max(0, remaining) };
          }
          const pctNorm = Math.max(0, Number(((i.percentage / total) * 100).toFixed(2)));
          acc += pctNorm;
          return { ...i, percentage: pctNorm };
        });

        return normalized;
      })(),
    },
  };
}
