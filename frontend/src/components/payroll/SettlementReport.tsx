"use client";

import { useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";
import { getBusinessDayKey } from "@/src/lib/businessDate";
import {
  payrollApi,
  type MoneyLike,
  type PayrollTerminationReason,
  type Settlement,
} from "@/src/lib/payroll/api";
import { SheetShell } from "./SheetShell";

export const TERMINATION_REASON_LABELS: Record<PayrollTerminationReason, string> = {
  CONTRACT_EXPIRATION: "Vencimiento de contrato",
  VOLUNTARY_RESIGNATION: "Renuncia voluntaria",
  EMPLOYER_TERMINATION: "Terminación por el empleador",
  MUTUAL_AGREEMENT: "Mutuo acuerdo",
  OTHER: "Otro motivo",
};

export const TERMINATION_REASON_NOTICE = "El motivo de finalización no modifica el cálculo de la liquidación.";

function money(value: MoneyLike) {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export function MoneyLine({
  label,
  value,
  color = "text-slate-700",
  valueColor = "text-slate-900",
  indent = false,
  medium = false,
  sign,
}: {
  label: string;
  value: MoneyLike;
  color?: string;
  valueColor?: string;
  indent?: boolean;
  medium?: boolean;
  sign?: "+" | "-";
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 text-[13px]", indent && "pl-4")}>
      <span className={cn("min-w-0 flex-1 font-normal leading-5", color)}>{label}</span>
      <span className={cn("shrink-0 tabular-nums leading-5", valueColor, medium ? "font-medium" : "font-normal")}>
        {sign ? `${sign} ${money(value)}` : money(value)}
      </span>
    </div>
  );
}

export function formatSettlementDate(value?: string | Date | null): string {
  if (!value) return "-";
  const dateStr = typeof value === "string" ? value : value.toISOString();
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "-";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

/**
 * Read-only settlement detail. Lines and total are rendered exactly as returned by
 * the backend (simulation or persisted settlement); nothing is recalculated here.
 */
export function SettlementReportDetail({ settlement }: { settlement: Settlement }) {
  const params = (settlement.usedParameters ?? {}) as Record<string, unknown>;
  const asDate = (value: unknown) => (typeof value === "string" ? value : undefined);
  const requestedEnd = settlement.requestedEndDate ?? asDate(params.requestedEndDate) ?? settlement.endDate;
  const effectiveEnd = settlement.effectiveEndDate ?? asDate(params.effectiveEndDate) ?? settlement.endDate;
  const causedDays = settlement.causedDays ?? Number(params.causedDays ?? settlement.totalWorkedDays ?? 0);
  const cutoffDiffers = formatSettlementDate(requestedEnd) !== formatSettlementDate(effectiveEnd);

  return (
    <section className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
        <Field label="Inicio del corte" value={formatSettlementDate(settlement.cutoffStartDate ?? settlement.startDate)} />
        <Field label={cutoffDiffers ? "Corte calculado hasta" : "Fecha de corte"} value={formatSettlementDate(effectiveEnd)} />
        <Field label="Días causados" value={String(causedDays)} />
        <Field label="Año de cálculo" value={String(settlement.calculationYear ?? params.calculationYear ?? "-")} />
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-widest text-slate-400">Detalle de liquidación</p>
      <div className="mt-2 space-y-2">
        {(settlement.lines ?? []).map((line) => (
          <MoneyLine key={line.code} label={line.name} value={line.amount} color="text-slate-600" valueColor="text-slate-800" />
        ))}
        {!settlement.lines?.length && (
          <p className="text-xs text-slate-400">El servicio no devolvió conceptos para esta liquidación.</p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-violet-50 px-4 py-3">
        <span className="text-[13px] font-medium text-violet-900">Total liquidación</span>
        <span className="text-lg font-semibold tabular-nums text-violet-700">{money(settlement.totalAmount)}</span>
      </div>
    </section>
  );
}

/** Read-only viewer for a persisted settlement (used from Contabilidad). */
export function SettlementReportSheet({
  settlementId,
  onClose,
}: {
  settlementId: string | null;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; settlement?: Settlement; error?: string } | null>(null);

  useEffect(() => {
    if (!settlementId) return;
    let alive = true;
    payrollApi.getSettlement(settlementId)
      .then((settlement) => { if (alive) setLoaded({ id: settlementId, settlement }); })
      .catch((err: unknown) => {
        if (alive) setLoaded({ id: settlementId, error: err instanceof Error ? err.message : "No se pudo cargar el informe de liquidación." });
      });
    return () => { alive = false; };
  }, [settlementId]);

  const current = loaded && loaded.id === settlementId ? loaded : null;
  const settlement = current?.settlement ?? null;
  const error = current?.error ?? null;

  const employee = settlement?.employee;
  const reason = settlement?.terminationReason;
  const contractEnded = settlement?.contract?.isActive === false;
  const registeredAt = settlement?.postedAt ?? settlement?.calculatedAt ?? null;

  return (
    <SheetShell
      open={Boolean(settlementId)}
      onClose={onClose}
      title="Liquidación de contrato"
      subtitle="Informe registrado"
      accent="text-violet-600"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-2xl bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Cerrar
        </button>
      }
    >
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {!error && !settlement && <p className="py-8 text-center text-sm text-slate-400">Cargando informe…</p>}
      {settlement && (
        <div className="space-y-3">
          <section className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-base font-medium text-slate-900">
              {employee ? `${employee.firstName} ${employee.lastName}` : "Empleado"}
            </p>
            {employee?.documentNumber && <p className="text-xs text-slate-400">{employee.documentNumber}</p>}
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="Fecha de finalización" value={formatSettlementDate(settlement.requestedEndDate ?? settlement.endDate)} />
              {/* postedAt is an instant: show the business (Bogotá) day, not the UTC one. */}
              <Field label="Registrada el" value={formatSettlementDate(registeredAt ? getBusinessDayKey(registeredAt) : null)} />
              <Field label="Importe registrado" value={money(settlement.totalAmount)} />
              <Field label="Estado contractual" value={contractEnded ? "Contrato finalizado" : "Contrato activo"} />
            </div>
            <div className="mt-3">
              <Field
                label="Motivo de finalización"
                value={reason ? TERMINATION_REASON_LABELS[reason] ?? reason : "No informado"}
              />
              {settlement.terminationNote && (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{settlement.terminationNote}</p>
              )}
            </div>
          </section>
          <SettlementReportDetail settlement={settlement} />
          <p className="px-1 text-[11px] leading-relaxed text-slate-400">
            {TERMINATION_REASON_NOTICE} El informe contempla exclusivamente los conceptos soportados actualmente por Sactec.
          </p>
        </div>
      )}
    </SheetShell>
  );
}
