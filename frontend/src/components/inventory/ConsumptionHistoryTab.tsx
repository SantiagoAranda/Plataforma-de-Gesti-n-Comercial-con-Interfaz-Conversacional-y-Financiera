"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/src/lib/formatters";
import { getErrorMessage } from "@/src/lib/errors";
import {
  getRecipeConsumptionHistory,
  getServiceConsumptionHistory,
  type ConsumptionHistoryLine,
} from "@/src/services/inventory";
import { Calendar, RefreshCw } from "lucide-react";

type Props = {
  itemId: string;
  type: "recipe" | "service";
};

export function ConsumptionHistoryTab({ itemId, type }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ConsumptionHistoryLine[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const query = {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      };

      const data =
        type === "recipe"
          ? await getRecipeConsumptionHistory(itemId, query)
          : await getServiceConsumptionHistory(itemId, query);

      setHistory(data);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Error al cargar historial"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, [itemId, type, dateFrom, dateTo]);

  const formatReservationTime = (minutes: number) => {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const formatDateString = (utcStr: string) => {
    try {
      const d = new Date(utcStr);
      return d.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return utcStr;
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Date Filters */}
      <div className="grid grid-cols-2 gap-2 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
        <div>
          <label className="block text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400"
          />
        </div>
        <div>
          <label className="block text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Cargando historial de consumo...</span>
        </div>
      ) : error ? (
        <p className="text-xs text-rose-600 bg-rose-50/50 border border-rose-100 p-2.5 rounded-xl font-medium">{error}</p>
      ) : history.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 bg-white rounded-xl">
          No hay registros de consumo en este período.
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {history.map((line) => (
            <div
              key={line.id}
              className="p-2.5 rounded-xl border border-slate-100 bg-white shadow-2xs space-y-1.5 text-[11px]"
            >
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span>{line.ingredient?.name || "Insumo desconocido"}</span>
                <span className="text-slate-800">
                  {line.type === "SALE" ? "-" : "+"}
                  {formatMoney(line.quantity)} {line.ingredient?.customUnitLabel || line.ingredient?.consumptionUnit}
                </span>
              </div>

              <div className="flex justify-between text-slate-400 text-[10px] font-medium">
                <span>Costo: ${formatMoney(line.unitCost)} (Total: ${formatMoney(line.totalValue)})</span>
                <span>{formatDateString(line.occurredAt)}</span>
              </div>

              {/* Reference Details */}
              {line.order && (
                <div className="mt-1 bg-slate-50 px-2 py-1 rounded text-[10px] font-semibold text-slate-600 border border-slate-100/50">
                  Pedido: <span className="text-slate-800 font-bold">#{line.order.documentNumber}</span>
                </div>
              )}
              {line.reservation && (
                <div className="mt-1 bg-slate-50 px-2 py-1 rounded text-[10px] font-semibold text-slate-600 border border-slate-100/50 flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                  <span>
                    Reserva: <span className="text-slate-800 font-bold">{line.reservation.customerName}</span> (
                    {new Date(line.reservation.date).toLocaleDateString("es-CO")} {formatReservationTime(line.reservation.startMinute)})
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
