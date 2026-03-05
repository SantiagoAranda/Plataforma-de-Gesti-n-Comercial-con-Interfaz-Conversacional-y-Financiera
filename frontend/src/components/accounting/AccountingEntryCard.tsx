"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { useLongPress } from "@/src/hooks/useLongPress";

type EntryStatus = "DRAFT" | "POSTED";

export type UiAccountingLine = {
  pucCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string | null;
};

export type UiAccountingEntryGroup = {
  id: string;        // entryId
  dateISO: string;   // yyyy-mm-dd
  memo: string;
  status: EntryStatus;
  totalDebit: number;
  totalCredit: number;
  lines: UiAccountingLine[];
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatARS(n: number) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDateShort(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: EntryStatus) {
  if (status === "POSTED") {
    return { label: "CONFIRMADO", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  return { label: "BORRADOR", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" };
}

function lineCountLabel(hiddenCount: number) {
  return `Ver más (${hiddenCount} ${hiddenCount === 1 ? "línea" : "líneas"})`;
}

/** Row */
function AccountingLineRow({ line }: { line: UiAccountingLine }) {
  const debit = Number(line.debit ?? 0);
  const credit = Number(line.credit ?? 0);

  return (
    <div className="py-2">
      <div
        className={cn(
          "grid items-start gap-2",
          "grid-cols-[minmax(0,1fr)_88px_88px]",
          "sm:grid-cols-[minmax(0,1fr)_110px_110px]",
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 truncate">
            {line.pucCode}{" "}
            <span className="font-normal text-neutral-500">
              · {line.accountName || "(sin nombre)"}
            </span>
          </div>
          {line.description ? (
            <div className="mt-0.5 text-xs text-neutral-500 truncate">
              {line.description}
            </div>
          ) : null}
        </div>

        <div className="text-right font-mono tabular-nums text-sm">
          {debit > 0 ? (
            <span className="text-emerald-700">{formatARS(debit)}</span>
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </div>

        <div className="text-right font-mono tabular-nums text-sm">
          {credit > 0 ? (
            <span className="text-red-600">{formatARS(credit)}</span>
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountingLinesList({
  lines,
  expanded,
  onToggleExpanded,
}: {
  lines: UiAccountingLine[];
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const MAX = 3;
  const hidden = Math.max(0, lines.length - MAX);
  const visibleLines = expanded ? lines : lines.slice(0, MAX);

  return (
    <div className="px-4 pb-4">
      <div className="mt-3 mb-1 grid grid-cols-[minmax(0,1fr)_88px_88px] sm:grid-cols-[minmax(0,1fr)_110px_110px] gap-2 text-[11px] font-semibold tracking-widest text-neutral-400">
        <div>Cuenta</div>
        <div className="text-right">Débito</div>
        <div className="text-right">Crédito</div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="divide-y divide-neutral-100 px-3">
          {visibleLines.map((l, idx) => (
            <AccountingLineRow key={`${l.pucCode}-${idx}`} line={l} />
          ))}
        </div>

        {hidden > 0 && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="w-full px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition rounded-b-2xl"
          >
            {expanded ? "Ver menos" : lineCountLabel(hidden)}
          </button>
        )}
      </div>
    </div>
  );
}

export function AccountingEntryCard({
  entry,
  selectionMode,
  isSelected,
  onLongPressEntry,
  onTapEntry,
}: {
  entry: UiAccountingEntryGroup;

  selectionMode: boolean;
  isSelected: boolean;

  onLongPressEntry: (entryId: string) => void;
  onTapEntry: (entryId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // Animación expand
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [h, setH] = React.useState(0);

  React.useEffect(() => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    const ro = new ResizeObserver(() => setH(el.scrollHeight));
    ro.observe(el);
    setH(el.scrollHeight);
    return () => ro.disconnect();
  }, []);

  const { handlers } = useLongPress(() => onLongPressEntry(entry.id), {
    ms: 520,
    moveThresholdPx: 12,
  });

  function handleTap() {
    if (selectionMode) {
      onTapEntry(entry.id);
      return;
    }
    setExpanded((p) => !p);
  }

  const badge = statusBadge(entry.status);

  return (
    <div className={cn("select-none relative", expanded ? "z-30" : "z-0")}>
      {/* Header card */}
      <div
        className={cn(
          "rounded-3xl border shadow-sm px-4 py-4",
          "transition",
          "hover:bg-neutral-50 active:scale-[0.99]",
          isSelected
            ? "bg-blue-50/60 border-blue-300 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
            : "bg-white border-neutral-200",
          "z-0",
        )}
        {...handlers}
        onClick={(e) => {
          e.preventDefault();
          handleTap();
        }}
        role="button"
        aria-pressed={isSelected}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-widest text-neutral-400">
              {formatDateShort(entry.dateISO)}
            </div>

            <div className="mt-1 text-sm font-semibold text-neutral-900 truncate">
              {entry.memo || "(Sin memo)"}
            </div>
          </div>

          <div className="shrink-0 flex items-start gap-2">
            {isSelected && (
              <CheckCircle2
                className="h-5 w-5 text-blue-600"
                aria-label="Seleccionada"
              />
            )}

            <span className={cn("px-3 py-1 rounded-full border text-xs font-semibold", badge.cls)}>
              {badge.label}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            <span className="text-emerald-700 font-semibold">Débito:</span>{" "}
            <span className="font-mono tabular-nums">{formatARS(entry.totalDebit)}</span>
            <span className="mx-2 text-neutral-300">|</span>
            <span className="text-red-600 font-semibold">Crédito:</span>{" "}
            <span className="font-mono tabular-nums">{formatARS(entry.totalCredit)}</span>
          </div>

          <div className="text-xs text-neutral-400 font-semibold">
            {selectionMode ? "Seleccionar" : expanded ? "Ver menos" : "Ver detalle"}
          </div>
        </div>
      </div>

      {/* Expand details (solo cuando NO hay selectionMode) */}
      {!selectionMode && (
        <div
          className={cn(
            "overflow-hidden transition-[max-height,opacity] duration-300 ease-out",
            "relative z-40",
          )}
          style={{
            maxHeight: expanded ? `${h}px` : "0px",
            opacity: expanded ? 1 : 0,
          }}
        >
          {/* Importante: el ref debe medir el contenido REAL, pero sin quedar dentro de overflow-hidden del listado */}
          <div
            ref={contentRef}
            className={cn("mt-2 rounded-2xl bg-white border border-neutral-200 shadow-sm")}
          >
            <AccountingLinesList
              lines={entry.lines}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((p) => !p)}
            />
          </div>
        </div>
      )}
    </div>
  );
}