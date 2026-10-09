"use client";

import type { Sale } from "@/src/types/sales";

type Step = "warning" | "confirm" | "sending";

export default function ElectronicInvoiceConfirmModal({ sale, step, onCancel, onContinue, onGenerate }: {
  sale: Sale | null;
  step: Step | null;
  onCancel: () => void;
  onContinue: () => void;
  onGenerate: () => void;
}) {
  if (!sale || !step) return null;
  const warning = step === "warning";
  const sending = step === "sending";
  return <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="electronic-invoice-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <h2 id="electronic-invoice-title" className="text-lg font-bold text-slate-900">{warning ? "Venta anterior a la actualización" : "Generar factura electrónica"}</h2>
      {warning ? <p className="mt-4 text-sm leading-6 text-slate-700">Esta venta fue registrada antes de la actualización del sistema de facturación electrónica. Parte de la información fiscal puede provenir de la configuración actual del negocio. Antes de continuar, verificá los datos de la venta y del comprador.</p>
        : <p className="mt-4 text-sm leading-6 text-slate-700">Esta acción enviará la venta a Factus para generar su factura electrónica. Una vez emitida, cualquier corrección deberá realizarse mediante una nota crédito.</p>}
      <div className="mt-6 flex gap-2">
        <button type="button" disabled={sending} onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancelar</button>
        <button type="button" disabled={sending} onClick={warning ? onContinue : onGenerate} className="flex-1 rounded-xl bg-[#0B3F64] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{warning ? "Continuar" : sending ? "Generando..." : "Generar factura"}</button>
      </div>
    </section>
  </div>;
}
