"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import { MovementPeriodFilter } from "@/src/components/movements/MovementPeriodFilter";
import { MovementProfitHero } from "@/src/components/movements/MovementProfitHero";
import { MovementKpiCard } from "@/src/components/movements/MovementKpiCard";
import { MovementCompositionChart } from "@/src/components/movements/MovementCompositionChart";
import { MovementBreakdownList } from "@/src/components/movements/MovementBreakdownList";
import { MovementEmptyState } from "@/src/components/movements/MovementEmptyState";
import { mapMovementMetrics } from "@/src/lib/movements/mapMovementMetrics";
import { periodRange } from "@/src/lib/movements/movementPeriod";
import type { MovementPeriodKey } from "@/src/types/movements-ui";
import { listMovements, type BackendMovement } from "@/src/services/accounting";

export default function MovimientosPage() {
  const [period, setPeriod] = useState<MovementPeriodKey>("THIS_MONTH");
  const [rows, setRows] = useState<BackendMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const range = periodRange(period);
  const metrics = useMemo(() => mapMovementMetrics(rows, range.label), [rows, range.label]);

  const compositionItems = useMemo(
    () => [
      { label: "Ventas netas", value: metrics.netSales, tone: "green" as const },
      { label: "Costos", value: metrics.costs, tone: "amber" as const },
      { label: "Gastos operativos", value: metrics.operatingExpenses, tone: "red" as const },
      { label: "Otros gastos", value: metrics.nonOperatingExpenses, tone: "red" as const },
      { label: "Utilidad final", value: metrics.netProfit, tone: "blue" as const },
    ],
    [metrics],
  );

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeader
        title="Movimientos"
        subtitle="Resumen del negocio"
        showBack
        rightIcon={<CalendarDays className="h-5 w-5 text-emerald-600" />}
      />

      <main className="mx-auto w-full max-w-4xl px-3 pb-28 pt-3 space-y-5 sm:px-4">
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <CalendarDays className="h-4 w-4 text-emerald-600" />
            <span>Período: {range.label}</span>
          </div>
          <MovementPeriodFilter value={period} onChange={setPeriod} />
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

        {!loading && !error && !metrics.hasData && <MovementEmptyState />}

        {!loading && !error && metrics.hasData && (
          <>
            <MovementProfitHero amount={metrics.netProfit} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.topKpis.map((k) => (
                <MovementKpiCard
                  key={k.key}
                  label={k.label}
                  value={k.value}
                  tone={k.tone === "negative" ? "negative" : k.tone === "positive" ? "positive" : "neutral"}
                  icon={k.icon ?? <BarChart3 className="h-5 w-5" />}
                />
              ))}
            </div>

            <MovementCompositionChart items={compositionItems} />

            <MovementBreakdownList items={metrics.breakdown} />
          </>
        )}
      </main>

      <BottomNavbar active="movimientos" />
    </div>
  );
}
