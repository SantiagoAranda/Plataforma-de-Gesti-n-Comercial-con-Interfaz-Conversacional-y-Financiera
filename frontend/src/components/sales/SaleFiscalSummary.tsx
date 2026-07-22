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
    <div className="rounded-2xl bg-slate-50/70 p-3.5 text-slate-800 border border-slate-200/80">
      {detailed && (
        <div className="mb-3 flex items-center justify-between border-b border-slate-200/60 pb-2 text-[11px]">
          <span className="text-slate-500 font-bold uppercase tracking-wider">Subtotal Neto</span>
          <span className="font-bold tabular-nums text-slate-900">
            {formatMoney(summary.subtotal)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 border-b border-slate-200/60 pb-3">
        {taxRows.map((row) => {
          const hasValue = row.value > 0;
          return (
            <div key={row.label} className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                {row.label}
              </div>
              <div
                className={`truncate text-xs font-bold tabular-nums ${
                  row.kind === "charge"
                    ? "text-emerald-600"
                    : "text-amber-600"
                }`}
              >
                {row.kind === "withhold" && hasValue ? "−" : ""}
                {formatMoney(row.value)}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`mt-3 grid gap-3 ${detailed ? "grid-cols-3" : "grid-cols-2"}`}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
            Total cobrado
          </div>
          <div className="text-xs font-extrabold tabular-nums text-slate-900">
            {formatMoney(summary.totalCollected)}
          </div>
        </div>
        {detailed && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              Total retenido
            </div>
            <div className="text-xs font-extrabold tabular-nums text-amber-600">
              {formatMoney(summary.totalWithheld)}
            </div>
          </div>
        )}
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
            Neto recibido
          </div>
          <div className="text-sm font-extrabold tabular-nums text-emerald-600">
            {formatMoney(summary.netReceived)}
          </div>
        </div>
      </div>
    </div>
  );
}
