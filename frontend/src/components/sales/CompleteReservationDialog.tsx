"use client";

import { useEffect, useRef, useState } from 'react';
import type { Sale } from '@/src/types/sales';
import { formatMoney } from '@/src/lib/formatters';

// scheduledAt is already the business-local wall time (YYYY-MM-DDTHH:mm:ss, no zone).
function formatSchedule(scheduledAt?: string, durationMin?: number | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(scheduledAt ?? '');
  if (!match) return '';
  const [, y, mo, d, h, mi] = match;
  const start = Number(h) * 60 + Number(mi);
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${d}/${mo}/${y} · ${hhmm(start)}${durationMin ? `–${hhmm(start + durationMin)}` : ''}`;
}

export default function CompleteReservationDialog({ sale, onClose, onComplete }: {
  sale: Sale;
  onClose: () => void;
  onComplete: (sale: Sale) => Promise<void>;
}) {
  const [provided, setProvided] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus();
  }, []);
  async function submit() {
    if (!provided || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try { await onComplete(sale); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo finalizar la atención.'); setProvided(false); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="complete-title" onKeyDown={event => {
      if (event.key === 'Escape' && !submitting.current) onClose();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="complete-title" className="text-lg font-semibold">Finalizar atención</h2>
      <p className="mt-3">{sale.customerName || 'Cliente'}</p>
      <p>{sale.items[0]?.name || 'Servicio'}</p>
      <p className="text-sm text-slate-600">{formatSchedule(sale.scheduledAt, sale.items[0]?.durationMin)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
        <dt className="text-slate-600">Importe pactado</dt><dd className="text-right font-medium">{formatMoney(sale.total)}</dd>
        <dt className="text-slate-600">Método de pago</dt><dd className="text-right font-medium">{sale.paymentMethod === 'BANK_TRANSFER' ? 'Transferencia' : sale.paymentMethod === 'CASH' ? 'Efectivo' : 'Sin registrar'}</dd>
      </dl>
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={provided} disabled={busy} onChange={event => setProvided(event.target.checked)} className="mt-1" />
        Confirmo que el servicio efectivamente se prestó
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 disabled:opacity-50">Volver</button>
        <button type="button" disabled={!provided || busy || !sale.allowedActions?.includes('complete')} onClick={submit} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Finalizando…' : 'Finalizar atención'}</button>
      </div>
    </section>
  </div>;
}
