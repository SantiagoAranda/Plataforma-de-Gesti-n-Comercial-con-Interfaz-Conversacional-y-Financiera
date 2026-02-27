import * as React from "react";
import type { UiAccountingEntry } from "@/src/types/accounting-ui";

import { useContextMenu } from "@/src/hooks/useContextMenu";
import { ContextMenu } from "@/src/hooks/ContextMenu";

function formatMoney(v: number) {
  const abs = Math.abs(v);
  return `$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isPositiveImpact(entry: UiAccountingEntry) {
  const a = entry.amount;
  switch (entry.kind) {
    case "INCOME":
      return true;
    case "EXPENSE":
      return false;
    case "ASSET":
      return a >= 0;
    case "LIABILITY":
      return a < 0;
    case "EQUITY":
      return a >= 0;
    default:
      return a >= 0;
  }
}

function amountClass(positive: boolean) {
  return positive ? "text-emerald-600" : "text-red-500";
}

function badgeLabelSource(source: UiAccountingEntry["source"]) {
  switch (source) {
    case "AUTO_ORDER":
      return "ORDEN AUTOMÁTICA";
    case "MANUAL":
      return "MANUAL";
    case "SYSTEM":
      return "SISTEMA";
    case "RECURRENT":
      return "RECURRENTE";
  }
}

function badgeClassSource(positive: boolean) {
  return positive
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-neutral-100 text-neutral-600 border-neutral-200";
}

function badgeLabelStatus(status: UiAccountingEntry["status"]) {
  switch (status) {
    case "DRAFT":
      return "BORRADOR";
    case "POSTED":
      return "CONFIRMADO";
    case "VOID":
      return "ANULADO";
  }
}

function badgeClassStatus(status: UiAccountingEntry["status"]) {
  switch (status) {
    case "DRAFT":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "POSTED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "VOID":
      return "bg-red-50 text-red-700 border-red-200";
  }
}

function levelLabel(level: UiAccountingEntry["pucLevel"]) {
  return level === "SUBCUENTA" ? "SUBCUENTA" : "CUENTA";
}

export function AccountingCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: UiAccountingEntry;
  onEdit: (entry: UiAccountingEntry) => void;
  onDelete: (entry: UiAccountingEntry) => void;
}) {
  const positive = isPositiveImpact(entry);

  const { open, pos, close, handlers } = useContextMenu(500);

  return (
    <>
      <div
        className="rounded-3xl bg-white border border-neutral-200 shadow-sm px-4 py-4 select-none"
        {...handlers}
      >
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-neutral-800 truncate">
              {entry.pucCode} - {entry.accountName}
            </div>
            <div className="text-sm text-neutral-500 truncate">
              {entry.description}
            </div>
          </div>

          <div className={cn("font-semibold flex items-center gap-1 shrink-0", amountClass(positive))}>
            <span>{positive ? "↑" : "↓"}</span>
            <span>{formatMoney(entry.amount)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 flex justify-between items-center text-xs text-neutral-500">
          <span>{entry.time}</span>

          <div className="flex items-center gap-2">
            {/* Estado */}
            <span className={cn("px-3 py-1 rounded-full border", badgeClassStatus(entry.status))}>
              {badgeLabelStatus(entry.status)}
            </span>

            {/* Origen */}
            <span className={cn("px-3 py-1 rounded-full border", badgeClassSource(positive))}>
              {badgeLabelSource(entry.source)}
            </span>
          </div>
        </div>

        {/* ✅ Línea discreta: nivel + estado + origen (detalle) */}
        <div className="mt-2 text-[11px] text-neutral-400">
          {levelLabel(entry.pucLevel)} · {entry.status} · {entry.source}
        </div>
      </div>

      <ContextMenu
        open={open}
        x={pos.x}
        y={pos.y}
        onClose={close}
        onEdit={() => onEdit(entry)}
        onDelete={() => onDelete(entry)}
      />
    </>
  );
}