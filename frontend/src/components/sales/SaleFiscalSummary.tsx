"use client";

import type { SaleFiscalSummary as FiscalSummary } from "@/src/types/sales";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export default function SaleFiscalSummary({
  summary,
  detailed = false,
}: {
  summary?: FiscalSummary | null;
  detailed?: boolean;
}) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-400">
        Sin liquidación fiscal
      </div>
    );
  }

  const taxRows = [
    { label: "IVA", value: summary.iva, kind: "charge" },
    ...(detailed
      ? [{ label: "Impoconsumo", value: summary.impoconsumo, kind: "charge" }]
      : []),
    { label: "Retefuente", value: summary.reteFuente, kind: "withhold" },
    { label: "ReteIVA", value: summary.reteIva, kind: "withhold" },
    { label: "ReteICA", value: summary.reteIca, kind: "withhold" },
  ];

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      {detailed && (
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-semibold tabular-nums text-slate-800">
            {formatMoney(summary.subtotal)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-4">
        {taxRows.map((row) => (
          <div key={row.label} className="min-w-0">
            <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
              {row.label}
            </div>
            <div
              className={`truncate text-xs font-semibold tabular-nums ${
                row.kind === "charge" ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {row.kind === "withhold" && row.value > 0 ? "−" : ""}
              {formatMoney(row.value)}
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-3 grid gap-2 border-t border-slate-100 pt-2 ${detailed ? "grid-cols-3" : "grid-cols-2"}`}>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400">
            Total cobrado
          </div>
          <div className="text-xs font-semibold tabular-nums text-slate-700">
            {formatMoney(summary.totalCollected)}
          </div>
        </div>
        {detailed && (
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400">
              Total retenido
            </div>
            <div className="text-xs font-semibold tabular-nums text-amber-700">
              {formatMoney(summary.totalWithheld)}
            </div>
          </div>
        )}
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">
            Neto recibido
          </div>
          <div className="text-sm font-bold tabular-nums text-emerald-700">
            {formatMoney(summary.netReceived)}
          </div>
        </div>
      </div>
    </div>
  );
}
