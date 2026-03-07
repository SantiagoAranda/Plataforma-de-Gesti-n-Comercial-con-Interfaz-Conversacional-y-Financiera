"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Calendar,
  DollarSign,
  PiggyBank,
  PieChart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import { listMovements, type BackendMovement } from "@/src/services/accounting";

type PeriodKey = "THIS_MONTH" | "LAST_30" | "LAST_MONTH";

type Metrics = {
  ingresos: number;
  devoluciones: number;
  ventasNetas: number;
  costos: number;
  utilidadBruta: number;
  gastosOperacionales: number;
  gastosNoOperacionales: number;
  utilidadOperacional: number;
  utilidadFinal: number;
};

type CompositionItem = { label: string; value: number; tone: "green" | "red" | "blue" | "amber"; hint?: string };

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function normalizeDateISO(x: string | Date) {
  const d = x instanceof Date ? x : new Date(x);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function periodRange(key: PeriodKey): { from: string; to: string; label: string } {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (key === "LAST_30") {
    const start = new Date(end);
    start.setDate(end.getDate() - 29);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label: "Ultimos 30 dias" };
  }

  if (key === "LAST_MONTH") {
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const close = new Date(end.getFullYear(), end.getMonth(), 0);
    return { from: start.toISOString().slice(0, 10), to: close.toISOString().slice(0, 10), label: "Mes anterior" };
  }

  // THIS_MONTH
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label: "Mes en curso" };
}

function safeSum(arr: number[]) {
  return arr.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

function calcMetrics(rows: BackendMovement[]): Metrics {
  // Convencion: para INCOME usamos (credit - debit) para que ventas sean positivas.
  // Para EXPENSE usamos (debit - credit) para que costos/gastos sean positivos.
  let ingresos = 0;
  let devoluciones = 0;
  let costos = 0;
  let gastosOp = 0;
  let gastosNoOp = 0;

  for (const r of rows ?? []) {
    const code = String(r.pucCode ?? "");
    const classKind = r.class;
    const credit = Number(r.credit ?? 0);
    const debit = Number(r.debit ?? 0);

    if (classKind === "INCOME") {
      const value = credit - debit;
      if (value >= 0) ingresos += value;
      else devoluciones += Math.abs(value);
      continue;
    }

    if (classKind === "EXPENSE") {
      const value = debit - credit;
      const first = code.trim()[0];
      if (first === "5") costos += value;
      else if (first === "6") gastosOp += value;
      else gastosNoOp += value;
    }
  }

  const ventasNetas = ingresos - devoluciones;
  const utilidadBruta = ventasNetas - costos;
  const utilidadOperacional = utilidadBruta - gastosOp;
  const utilidadFinal = utilidadOperacional - gastosNoOp;

  return {
    ingresos,
    devoluciones,
    ventasNetas,
    costos,
    utilidadBruta,
    gastosOperacionales: gastosOp,
    gastosNoOperacionales: gastosNoOp,
    utilidadOperacional,
    utilidadFinal,
  };
}

function KpiCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: number;
  tone: "green" | "red" | "blue" | "amber";
  icon: React.ReactNode;
}) {
  const palette: Record<typeof tone, string> = {
    green: "from-emerald-50 to-emerald-100 text-emerald-700",
    red: "from-rose-50 to-orange-100 text-rose-700",
    blue: "from-sky-50 to-blue-100 text-blue-700",
    amber: "from-amber-50 to-yellow-100 text-amber-700",
  } as any;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-white to-white shadow-sm ring-1 ring-black/5 px-4 py-3">
      <div
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br",
          palette[tone],
          "shadow-inner"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
        <div className="text-lg font-semibold text-neutral-900">{formatMoney(value)}</div>
      </div>
    </div>
  );
}

function HeroCard({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <div className="rounded-[28px] border border-neutral-200 p-5 shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-white to-white">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-600">Resultado del periodo</div>
          <div className={cn("mt-2 text-4xl font-bold tracking-tight", positive ? "text-emerald-700" : "text-rose-700")}>
            {formatMoney(Math.abs(value))} {positive ? "ganados" : "perdidos"}
          </div>
          <div className="mt-1 text-xs text-neutral-500">Ingresos - costos - gastos operativos y otros</div>
        </div>
        <div className={cn("grid h-14 w-14 place-items-center rounded-2xl", positive ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
          {positive ? <TrendingUp className="h-7 w-7" /> : <TrendingDown className="h-7 w-7" />}
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: CompositionItem["tone"] }) {
  const pctRaw = total > 0 ? (Math.abs(value) / total) * 100 : 0;
  const pct = Math.min(100, Math.max(4, Math.round(pctRaw))); // evitar desbordes visuales
  const colors: Record<CompositionItem["tone"], string> = {
    green: "bg-emerald-500",
    red: "bg-rose-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>{label}</span>
        <span className="font-semibold text-neutral-800">{formatMoney(value)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-neutral-100">
        <div className={cn("h-full rounded-full", colors[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" | "blue" }) {
  const color =
    tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-700" : tone === "blue" ? "text-blue-700" : "text-neutral-800";
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
      <span className="text-sm font-semibold text-neutral-600">{label}</span>
      <span className={cn("text-sm font-bold", color)}>{formatMoney(value)}</span>
    </div>
  );
}

function RecentChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-200">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold text-neutral-900">{formatMoney(value)}</div>
    </div>
  );
}

export default function MovimientosPage() {
  const [rows, setRows] = useState<BackendMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("THIS_MONTH");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setError(null);
        const range = periodRange(period);
        const data = await listMovements({
          from: range.from,
          to: range.to,
          onlyPosted: "false",
        });
        setRows(data ?? []);
      } catch (e: any) {
        console.error(e);
        setRows([]);
        setError(e?.message ?? "No se pudieron cargar los movimientos");
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const metrics = useMemo(() => calcMetrics(rows), [rows]);

  const composition: CompositionItem[] = useMemo(() => {
    return [
      { label: "Ventas netas", value: metrics.ventasNetas, tone: "green" },
      { label: "Costos", value: metrics.costos, tone: "amber" },
      { label: "Gastos operativos", value: metrics.gastosOperacionales, tone: "red" },
      { label: "Otros gastos", value: metrics.gastosNoOperacionales, tone: "red" },
      { label: "Utilidad final", value: metrics.utilidadFinal, tone: "blue" },
    ];
  }, [metrics]);

  const totalBase = useMemo(() => {
    const positives = composition.filter((c) => c.value > 0).map((c) => c.value);
    return safeSum(positives);
  }, [composition]);

  const kpis = [
    { title: "Ingresos", value: metrics.ingresos, tone: "green", icon: <ArrowUpCircle className="h-5 w-5" /> },
    { title: "Costos", value: metrics.costos, tone: "amber", icon: <ArrowDownCircle className="h-5 w-5" /> },
    { title: "Gastos", value: metrics.gastosOperacionales + metrics.gastosNoOperacionales, tone: "red", icon: <DollarSign className="h-5 w-5" /> },
    { title: "Utilidad operacional", value: metrics.utilidadOperacional, tone: "blue", icon: <BarChart3 className="h-5 w-5" /> },
  ] satisfies Array<{ title: string; value: number; tone: "green" | "red" | "blue" | "amber"; icon: React.ReactNode }>;

  const recentTotals = useMemo(() => {
    const latestDates = rows
      .filter((r) => r.status === "POSTED")
      .reduce<Record<string, number>>((acc, r) => {
        const day = normalizeDateISO(r.date);
        if (!day) return acc;
        const delta =
          r.class === "INCOME"
            ? Number(r.credit ?? 0) - Number(r.debit ?? 0)
            : -(Number(r.debit ?? 0) - Number(r.credit ?? 0));
        acc[day] = (acc[day] ?? 0) + delta;
        return acc;
      }, {});

    const sorted = Object.entries(latestDates).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 3);
    return sorted.map(([day, val]) => ({ day, val }));
  }, [rows]);

  const periodLabel = periodRange(period).label;

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeader title="Movimientos" subtitle="Salud financiera" showBack rightIcon="calendar" />

      <main className="mx-auto max-w-md px-4 pb-28 pt-3 space-y-5">
        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <span>Periodo: {periodLabel}</span>
          </div>
          <select
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-800"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          >
            <option value="THIS_MONTH">Mes en curso</option>
            <option value="LAST_30">Ultimos 30 dias</option>
            <option value="LAST_MONTH">Mes anterior</option>
          </select>
        </div>

        {loading && (
          <div className="rounded-2xl bg-white p-4 text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
            Cargando dashboard...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-white p-4 text-sm text-red-600 shadow-sm ring-1 ring-black/5">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <HeroCard value={metrics.utilidadFinal} />

            <div className="grid grid-cols-2 gap-3">
              {kpis.map((k) => (
                <KpiCard key={k.title} {...k} />
              ))}
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Composicion</div>
                  <div className="text-lg font-semibold text-neutral-900">De donde sale el resultado</div>
                </div>
                <PieChart className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="space-y-3">
                {composition.map((item) => (
                  <BarRow key={item.label} label={item.label} value={item.value} total={totalBase || Math.abs(item.value)} tone={item.tone} />
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-3">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-5 w-5 text-blue-600" />
                <div className="text-lg font-semibold text-neutral-900">Resumen del periodo</div>
              </div>
              <div className="space-y-2">
                <BreakdownRow label="Ventas netas" value={metrics.ventasNetas} tone="green" />
                <BreakdownRow label="Costos" value={metrics.costos} tone="red" />
                <BreakdownRow label="Utilidad bruta" value={metrics.utilidadBruta} tone="blue" />
                <BreakdownRow label="Gastos operativos" value={metrics.gastosOperacionales} tone="red" />
                <BreakdownRow label="Otros gastos" value={metrics.gastosNoOperacionales} tone="red" />
                <BreakdownRow label="Utilidad final" value={metrics.utilidadFinal} tone="green" />
              </div>
            </div>

            {recentTotals.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                  <span>Actividad reciente</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {recentTotals.map((r) => (
                    <RecentChip key={r.day} label={r.day} value={r.val} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNavbar active="movimientos" />
    </div>
  );
}
