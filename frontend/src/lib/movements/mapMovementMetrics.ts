import type { BackendMovement } from "@/src/services/accounting";
import type { MovementDashboardMetrics } from "@/src/types/movements-ui";

function safeNum(n: any) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function mapMovementMetrics(rows: BackendMovement[], periodLabel: string): MovementDashboardMetrics {
  let sales = 0;
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
      if (value >= 0) sales += value;
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

    if (cls === "OTHER") {
      nonOperatingIncome += credit - debit;
    }
  }

  const netSales = sales - returns;
  const grossProfit = netSales - costs;
  const operatingProfit = grossProfit - operatingExpenses;
  const profitBeforeTax = operatingProfit + nonOperatingIncome - nonOperatingExpenses;

  // MVP: no hay base sólida para provisión/ reserva
  const taxProvision = 0;
  const legalReserve = 0;
  const netProfit = profitBeforeTax - taxProvision - legalReserve;

  const breakdown = [
    { key: "sales", label: "Ventas", value: sales, tone: "positive" as const },
    { key: "returns", label: "Devoluciones", value: returns, tone: "negative" as const },
    { key: "netSales", label: "Ventas netas", value: netSales, tone: "positive" as const },
    { key: "costs", label: "Costos", value: costs, tone: "negative" as const },
    { key: "grossProfit", label: "Utilidad bruta", value: grossProfit, tone: "positive" as const },
    { key: "operatingExpenses", label: "Gastos operativos", value: operatingExpenses, tone: "negative" as const },
    { key: "operatingProfit", label: "Utilidad operativa", value: operatingProfit, tone: operatingProfit >= 0 ? "positive" : "negative" },
    { key: "nonOperatingIncome", label: "Ingresos no operativos", value: nonOperatingIncome, tone: "positive" as const },
    { key: "nonOperatingExpenses", label: "Gastos no operativos", value: nonOperatingExpenses, tone: "negative" as const },
    { key: "profitBeforeTax", label: "Utilidad antes de impuesto", value: profitBeforeTax, tone: profitBeforeTax >= 0 ? "positive" : "negative" },
    { key: "netProfit", label: "Utilidad final", value: netProfit, tone: netProfit >= 0 ? "positive" : "negative" },
  ];

  const topKpis = [
    { key: "netSales", label: "Ventas netas", value: netSales, tone: "positive" as const },
    { key: "costs", label: "Costos", value: costs, tone: "negative" as const },
    { key: "operatingExpenses", label: "Gastos", value: operatingExpenses + nonOperatingExpenses, tone: "negative" as const },
    { key: "operatingProfit", label: "Utilidad operativa", value: operatingProfit, tone: operatingProfit >= 0 ? "positive" : "negative" },
  ];

  const hasData = rows.length > 0;

  return {
    periodLabel,
    hasData,
    sales,
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
    netProfit,
    topKpis,
    breakdown,
  };
}
