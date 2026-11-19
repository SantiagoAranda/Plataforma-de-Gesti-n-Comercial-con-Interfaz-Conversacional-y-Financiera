"use client";

import { useState } from "react";
import { Ban, Check, ExternalLink, FileText, MessageCircle, X } from "lucide-react";
import { QUOTATION_ACTIONS, QUOTATION_BADGES, quotationView } from "@/src/lib/quotations/quotationPresentation";
import type { Quotation, QuotationAction } from "@/src/types/quotations";
import CardActionsMenu, { cardMenuActionClass } from "./CardActionsMenu";

const money = (n: number) => `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)}`;
const dateFmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", ...opts }).format(new Date(iso));

export type QuotationCardProps = {
  quotation: Quotation;
  onView: (quotation: Quotation) => void;
  onSend: (quotation: Quotation) => void;
  onAction: (quotation: Quotation, action: Exclude<QuotationAction, "send">) => void;
};

export default function QuotationCard({ quotation: q, onView, onSend, onAction }: QuotationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const view = quotationView(q);
  const badge = QUOTATION_BADGES[view];
  const actions = QUOTATION_ACTIONS[view];
  const canSend = actions.includes("send");
  const unpriced = q.items.filter((i) => i.unitPrice === null).length;
  const run = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div data-quotation-id={q.id} className="rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-200/60 bg-violet-50 text-sm font-bold text-violet-700 shadow-sm">
              {(q.customer.name?.trim().charAt(0) || "C").toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium leading-tight text-slate-800">{q.customer.name || "Sin nombre"}</h3>
              <p className="text-[10px] font-normal text-slate-400">Ref: {q.displayNumber}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
            <CardActionsMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <button type="button" className={cardMenuActionClass} onClick={run(() => onView(q))}><FileText size={16} />Ver cotización</button>
              {canSend && <button type="button" className={cardMenuActionClass} onClick={run(() => onSend(q))}><MessageCircle size={16} />Enviar por WhatsApp</button>}
              {actions.includes("accept") && <button type="button" className={cardMenuActionClass} onClick={run(() => onAction(q, "accept"))}><Check size={16} />Marcar como aceptada</button>}
              {actions.includes("reject") && <button type="button" className={`${cardMenuActionClass} text-rose-700`} onClick={run(() => onAction(q, "reject"))}><X size={16} />Marcar como rechazada</button>}
              {actions.includes("cancel") && <button type="button" className={`${cardMenuActionClass} text-rose-700`} onClick={run(() => onAction(q, "cancel"))}><Ban size={16} />Cancelar cotización</button>}
            </CardActionsMenu>
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
          <div className="space-y-2">
            {q.items.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-700">{i.name}</span>
                  {i.description && <span className="block truncate text-[10px] text-slate-400">{i.description}</span>}
                </div>
                <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-center text-[10px] font-medium text-slate-700 shadow-sm">{i.quantity}</span>
                <span className="min-w-[72px] shrink-0 pt-0.5 text-right font-semibold tabular-nums text-slate-700">
                  {i.lineTotal === null ? <span className="text-[10px] font-medium text-slate-400">Consultar precio</span> : money(i.lineTotal)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200/60 pt-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Total cotizado</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{money(q.total)}</span>
          </div>
          {unpriced > 0 && <p className="mt-1 text-[10px] text-slate-400">No incluye {unpriced} producto{unpriced > 1 ? "s" : ""} con precio por consultar.</p>}
        </div>

        <p className={`mb-3 text-[11px] font-medium ${view === "EXPIRED" ? "text-slate-500" : "text-violet-700"}`}>
          {view === "EXPIRED" ? "Venció" : "Válida hasta"} el {dateFmt(q.validUntil, { day: "numeric", month: "short", year: "numeric" })}
          {q.sentAt && view === "OPEN" ? " · Enviada" : ""}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSend(q)}
            disabled={!canSend || !q.customer.whatsapp}
            title={!q.customer.whatsapp ? "El cliente no dejó WhatsApp" : undefined}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 text-xs font-medium uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#20bd5b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageCircle className="h-3.5 w-3.5 fill-white" />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => onView(q)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#0B3F64] shadow-sm transition-colors hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver cotización
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-3">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{q.origin === "PUBLIC_STORE" ? "Catálogo" : "Manual"}</span>
          <span className="text-[10px] font-medium text-slate-500">{dateFmt(q.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
    </div>
  );
}
