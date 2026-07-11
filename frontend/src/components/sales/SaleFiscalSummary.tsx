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
  taxSettingsEnabled = false,
}: {
  summary?: FiscalSummary | null;
  detailed?: boolean;
  taxSettingsEnabled?: boolean;
}) {
  const hasHistoricalTaxes = summary && (
    Number(summary.iva ?? 0) > 0 ||
    Number(summary.impoconsumo ?? 0) > 0 ||
    Number(summary.reteFuente ?? 0) > 0 ||
    Number(summary.reteIva ?? 0) > 0 ||
    Number(summary.reteIca ?? 0) > 0
  );

  if (!taxSettingsEnabled && !hasHistoricalTaxes) {
    return null;
  }

  if (!summary) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 p-4 text-center text-xs font-medium text-neutral-400">
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
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-4 text-white shadow-xl border border-slate-800">
      {detailed && (
        <div className="mb-3.5 flex items-center justify-between border-b border-white/10 pb-2.5 text-[11px]">
          <span className="text-slate-400 font-medium uppercase tracking-wider">Subtotal Neto</span>
          <span className="font-semibold tabular-nums text-slate-200">
            {formatMoney(summary.subtotal)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 border-b border-white/5 pb-3">
        {taxRows.map((row) => {
          const hasValue = row.value > 0;
          return (
            <div key={row.label} className={`min-w-0 ${!hasValue ? "opacity-40" : ""}`}>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                {row.label}
              </div>
              <div
                className={`truncate text-xs font-bold tabular-nums ${
                  row.kind === "charge"
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {row.kind === "withhold" && hasValue ? "−" : ""}
                {formatMoney(row.value)}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`mt-3.5 grid gap-3 ${detailed ? "grid-cols-3" : "grid-cols-2"}`}>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Total cobrado
          </div>
          <div className="text-xs font-bold tabular-nums text-slate-200">
            {formatMoney(summary.totalCollected)}
          </div>
        </div>
        {detailed && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
              Total retenido
            </div>
            <div className="text-xs font-bold tabular-nums text-amber-400">
              {formatMoney(summary.totalWithheld)}
            </div>
          </div>
        )}
        <div className="text-right">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Neto recibido
          </div>
          <div className="text-sm font-extrabold tabular-nums text-emerald-400">
            {formatMoney(summary.netReceived)}
          </div>
        </div>
      </div>
    </div>
  );
}
