"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, History, RefreshCw } from "lucide-react";

import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";
import { getErrorMessage } from "@/src/lib/errors";
import {
  getRecipeConsumptionHistory,
  getServiceConsumptionHistory,
  type ConsumptionHistoryLine,
} from "@/src/services/inventory";

type Props = {
  itemId: string;
  itemName?: string;
  type: "recipe" | "service";
};

const historyCache = new Map<string, ConsumptionHistoryLine[]>();

function formatOccurredAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ConsumptionHistoryTab({ itemId, itemName, type }: Props) {
  const cacheKey = `${type}:${itemId}`;
  const [loading, setLoading] = useState(() => !historyCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ConsumptionHistoryLine[]>(() => historyCache.get(cacheKey) ?? []);
  const [expandedSales, setExpandedSales] = useState<Record<string, boolean>>({});

  const fetchHistory = async (force = false) => {
    if (!force) {
      const cached = historyCache.get(cacheKey);
      if (cached) {
        setHistory(cached);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);
      const data = type === "recipe"
        ? await getRecipeConsumptionHistory(itemId, { limit: 2 })
        : await getServiceConsumptionHistory(itemId);
      historyCache.set(cacheKey, data);
      setHistory(data);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "No se pudo cargar el historial."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, [cacheKey]);

  const sales = useMemo(() => {
    const grouped = new Map<string, ConsumptionHistoryLine[]>();
    for (const line of history) {
      const key = line.order?.id ?? line.reservation?.id ?? line.id;
      grouped.set(key, [...(grouped.get(key) ?? []), line]);
    }
    return [...grouped.entries()].slice(0, 2).map(([id, lines]) => ({ id, lines }));
  }, [history]);

  if (loading) {
    return <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white px-3 text-xs text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Cargando historial…</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-700"><p>No se pudo cargar el historial.</p><button type="button" onClick={() => void fetchHistory(true)} className="mt-2 inline-flex items-center gap-1 font-medium text-[#0b3f64] hover:underline"><RefreshCw className="h-3 w-3" />Reintentar</button></div>;
  }

  if (sales.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-7 text-center text-xs text-slate-500">No hay consumos registrados para esta receta.</div>;
  }

  return <section className="space-y-2">
    <div className="flex items-center gap-2 px-0.5"><History className="h-4 w-4 text-[#0b3f64]" /><h3 className="text-xs font-medium text-black">Últimos consumos</h3></div>
    {sales.map(({ id, lines }) => {
      const firstLine = lines[0];
      const order = firstLine.order;
      const quantitySold = order?.quantitySold;
      const totalCost = lines.reduce((total, line) => total + Number(line.totalValue || 0), 0);
      const expanded = Boolean(expandedSales[id]);
      const occurredAt = order?.createdAt ?? firstLine.occurredAt;

      return <article key={id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setExpandedSales((previous) => ({ ...previous, [id]: !previous[id] }))} className="flex w-full items-center gap-2.5 p-3 text-left transition hover:bg-slate-50">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700"><History className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-black">{order?.documentNumber ? `Venta #${order.documentNumber}` : "Consumo registrado"}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{itemName ? `${itemName} · ` : ""}{formatOccurredAt(occurredAt)}</span></span>
          <span className="shrink-0 text-right"><span className="block text-xs font-medium text-black">{quantitySold == null ? "—" : `${formatQuantityCompact(quantitySold)} un.`}</span><span className="mt-0.5 block text-[10px] text-slate-500">${formatMoney(totalCost)}</span></span>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
        </button>
        {expanded && <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3">
          {lines.map((line) => <div key={line.id} className="flex items-start justify-between gap-3 text-[11px]"><div className="min-w-0"><p className="truncate text-black">{line.ingredient?.name ?? "Recurso consumido"}</p><p className="mt-0.5 text-slate-500">{formatQuantityCompact(line.quantity)} {line.ingredient?.customUnitLabel || line.ingredient?.consumptionUnit || ""}</p></div><p className="shrink-0 text-right text-slate-600">${formatMoney(line.totalValue)}</p></div>)}
        </div>}
      </article>;
    })}
  </section>;
}
