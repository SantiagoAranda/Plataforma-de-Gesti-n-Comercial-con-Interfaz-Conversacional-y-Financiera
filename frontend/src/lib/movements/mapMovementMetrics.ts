import type { AccountingMovement } from "@/src/services/accounting";
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

export function mapMovementMetrics(
  rows: AccountingMovement[],
  periodLabel: string,
): MovementDashboardMetrics & { view: MovementMetricsViewModel } {
  // Acumuladores de las diferentes categorías contables exactas para el P&L
  let grossSales = 0;              // 41 (excepto 4175)
  let returns = 0;                 // 4175
  let costs = 0;                   // 61
  let operatingExpenses = 0;       // 51 y 52
  let nonOperatingIncome = 0;      // 42
  let nonOperatingExpenses = 0;    // 53

  for (const r of rows ?? []) {
    const code = (r.pucCode ?? "").trim();
    if (!code) continue;

    const amount = safeNum(r.amount);
    const first = code.charAt(0);
    
    // Clasificación contable real:
    // Cuentas 4: Crédito suma, Débito resta
    // Cuentas 5 y 6: Débito suma, Crédito resta
    let signedValue = 0;
    if (first === "4") {
      signedValue = r.nature === "CREDIT" ? amount : -amount;
    } else if (first === "5" || first === "6") {
      signedValue = r.nature === "DEBIT" ? amount : -amount;
    } else {
      // Ignorar cualquier otra clase contable para el cálculo del P&L
      continue;
    }

    // Clasificación exacta basada en dígitos
    if (code.startsWith("4175")) {
      // Devoluciones es clase 4 (naturaleza crédito), pero funciona como contra-ingreso (naturaleza débito).
      // Un movimiento DEBIT en 4175 dará 'signedValue' negativo.
      // Para poder aplicar la fórmula "Ventas - Devoluciones" con Devoluciones como valor positivo:
      returns += -signedValue; 
    } else if (code.startsWith("41")) {
      grossSales += signedValue;
    } else if (code.startsWith("42")) {
      nonOperatingIncome += signedValue;
    } else if (code.startsWith("61")) {
      costs += signedValue;
    } else if (code.startsWith("51") || code.startsWith("52")) {
      operatingExpenses += signedValue;
    } else if (code.startsWith("53")) {
      nonOperatingExpenses += signedValue;
    }
  }

  // Fórmulas escalonadas del Estado de Resultados (P&L)
  const netSales = grossSales - returns;
  const grossProfit = netSales - costs;
  const operatingProfit = grossProfit - operatingExpenses;
  const profitBeforeTax = operatingProfit + nonOperatingIncome - nonOperatingExpenses;
  
  // Cálculos automáticos condicionados a utilidad positiva
  const taxProvision = profitBeforeTax > 0 ? profitBeforeTax * 0.35 : 0;
  const netIncome = profitBeforeTax - taxProvision;
  
  const legalReserve = netIncome > 0 ? netIncome * 0.10 : 0;
  const netProfit = netIncome - legalReserve;

  const percentageBase = netSales + nonOperatingIncome;
  const pct = (v: number) => percentageBase === 0 ? 0 : (Math.abs(v) / percentageBase) * 100;

  const summaryMetrics: VisibleMetric[] = [
    { key: "netSales", label: "Ventas Netas", value: netSales, percentage: pct(netSales) },
    { key: "nonOperatingIncome", label: "Ingresos No Operacionales", value: nonOperatingIncome, percentage: pct(nonOperatingIncome) },
    { key: "returns", label: "Devoluciones", value: returns, percentage: pct(returns) },
    { key: "costs", label: "Costos", value: costs, percentage: pct(costs) },
    { key: "operatingExpenses", label: "Gastos Operativos", value: operatingExpenses, percentage: pct(operatingExpenses) },
    { key: "nonOperatingExpenses", label: "Gastos No Operacionales", value: nonOperatingExpenses, percentage: pct(nonOperatingExpenses) },
    { key: "taxProvision", label: "Provisión Impuesto de Renta", value: taxProvision, percentage: pct(taxProvision) },
    { key: "legalReserve", label: "Reserva Legal", value: legalReserve, percentage: pct(legalReserve) },
    { key: "netProfit", label: "Utilidad del Ejercicio", value: netProfit, percentage: pct(netProfit), highlight: true },
  ];

  const breakdown: BreakdownItem[] = [
    { key: "grossSales", label: "Ventas", value: grossSales, kind: "base" },
    { key: "returns", label: "Devoluciones", value: returns, operator: "-", kind: "deduction" },
    { key: "netSales", label: "Ventas Netas", value: netSales, operator: "=", kind: "result" },
    { key: "costs", label: "Costos", value: costs, operator: "-", kind: "deduction" },
    { key: "grossProfit", label: "Utilidad Bruta", value: grossProfit, operator: "=", kind: "result" },
    { key: "operatingExpenses", label: "Gastos Operativos", value: operatingExpenses, operator: "-", kind: "deduction" },
    { key: "operatingProfit", label: "Utilidad Operacional", value: operatingProfit, operator: "=", kind: "result" },
    { key: "nonOperatingIncome", label: "Ingresos No Op.", value: nonOperatingIncome, operator: "+", kind: "addition" },
    { key: "nonOperatingExpenses", label: "Gastos No Op.", value: nonOperatingExpenses, operator: "-", kind: "deduction" },
    { key: "profitBeforeTax", label: "Utilidad antes Impuestos", value: profitBeforeTax, operator: "=", kind: "result" },
    { key: "taxProvision", label: "Provisión Impuestos", value: taxProvision, operator: "-", kind: "deduction" },
    { key: "netIncome", label: "Utilidad Líquida", value: netIncome, operator: "=", kind: "result" },
    { key: "legalReserve", label: "Reserva Legal", value: legalReserve, operator: "-", kind: "deduction" },
    { key: "netProfit", label: "Utilidad del Ejercicio", value: netProfit, operator: "=", kind: "result" },
  ];

  const formulas: CompositionFormula[] = [
    {
      key: "netProfit",
      title: "Estado de Resultados P&L",
      expression: "Ventas Netas - Costos - Gastos - Impuestos",
      resultValue: netProfit,
      items: breakdown,
    },
  ];

  const chartData = summaryMetrics.map(m => ({
    key: m.key,
    label: m.label,
    value: m.value,
    percentage: Number(pct(m.value).toFixed(2)),
  }));

  return {
    periodLabel,
    hasData: (rows?.length ?? 0) > 0,
    sales: grossSales,
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
    topKpis: [
      { key: "netSales", label: "Ventas Netas", value: netSales, tone: netSales >= 0 ? "positive" : "negative" },
      { key: "expenses", label: "Total Egresos", value: costs + operatingExpenses + nonOperatingExpenses, tone: "negative" },
      { key: "netProfit", label: "Utilidad", value: netProfit, tone: netProfit >= 0 ? "positive" : "negative" },
    ],
    breakdown,
    view: {
      summaryMetrics,
      formulas,
      percentageBase,
      chartData,
    },
  };
}
