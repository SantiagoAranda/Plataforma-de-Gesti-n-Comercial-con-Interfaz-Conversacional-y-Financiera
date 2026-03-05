"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sale } from "@/src/types/sales";

type EditableItem = {
  qty: number;
  name: string;
  price: number;
  durationMin?: number;
};

function calcTotal(items: EditableItem[]) {
  return items.reduce(
    (acc, it) => acc + (Number.isFinite(it.price) ? it.price : 0),
    0
  );
}

function normalizeQty(type: Sale["type"], qty: number) {
  if (type === "SERVICIO") return 1;
  return Math.max(1, Math.floor(qty || 1));
}

export default function SaleEditModal({
  open,
  sale,
  onClose,
  onSave,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onSave: (updated: Sale) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [type, setType] = useState<Sale["type"]>("PRODUCTO");
  const [status, setStatus] = useState<Sale["status"]>("PENDIENTE");
  const [items, setItems] = useState<EditableItem[]>([]);

  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  useEffect(() => {
    if (!open || !sale) return;

    setCustomerName(sale.customerName);
    setCustomerWhatsapp(sale.customerWhatsapp ?? "");
    setType(sale.type);
    setStatus(sale.status);

    setItems(
      sale.items.map((it) => ({
        qty: sale.type === "SERVICIO" ? 1 : it.qty,
        name: it.name,
        price: it.price,
        durationMin: it.durationMin,
      }))
    );

    if (sale.type === "SERVICIO" && sale.scheduledAt) {
      const d = new Date(sale.scheduledAt);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");

      setScheduledDate(`${yyyy}-${mm}-${dd}`);
      setScheduledTime(`${hh}:${mi}`);
    } else {
      setScheduledDate("");
      setScheduledTime("");
    }
  }, [open, sale]);

  const total = useMemo(() => calcTotal(items), [items]);

  if (!open || !sale) return null;

  const setItem = (idx: number, patch: Partial<EditableItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;

        const next = { ...it, ...patch };

        next.qty = normalizeQty(type, next.qty);
        next.price = Number.isFinite(next.price) ? next.price : 0;

        return next;
      })
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        qty: 1,
        name: "",
        price: 0,
        durationMin: type === "SERVICIO" ? 60 : undefined,
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleChangeType = (nextType: Sale["type"]) => {
    setType(nextType);

    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        qty: normalizeQty(nextType, it.qty),
        durationMin:
          nextType === "SERVICIO" ? it.durationMin ?? 60 : undefined,
      }))
    );

    if (nextType !== "SERVICIO") {
      setScheduledDate("");
      setScheduledTime("");
    }
  };

  const handleSave = () => {
    const cleanedName = customerName.trim();
    if (!cleanedName) return;

    let scheduledAt: string | undefined = undefined;

    if (type === "SERVICIO") {
      if (!scheduledDate || !scheduledTime) return;

      const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
      scheduledAt = dt.toISOString();
    }

    const cleanedItems = items
      .map((it) => ({
        qty: normalizeQty(type, it.qty),
        name: it.name.trim(),
        price: Number(it.price) || 0,
        durationMin:
          type === "SERVICIO"
            ? Math.max(5, Math.floor(Number(it.durationMin) || 0)) || undefined
            : undefined,
      }))
      .filter((it) => it.name.length > 0);

    if (cleanedItems.length === 0) return;

    const updated: Sale = {
      ...sale,
      customerName: cleanedName,
      customerWhatsapp: customerWhatsapp.trim() || undefined,
      type,
      status,
      items: cleanedItems,
      scheduledAt,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* HEADER */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900 text-lg">Editar venta</h2>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-neutral-100 transition"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-5 overflow-y-auto">

          {/* CLIENTE */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Cliente
            </label>

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Nombre del cliente"
            />
          </div>

          {/* WHATSAPP */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              WhatsApp
            </label>

            <input
              value={customerWhatsapp}
              onChange={(e) => setCustomerWhatsapp(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="+54 9 11 1234 5678"
            />
          </div>

          {/* TIPO + ESTADO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Tipo
              </label>

              <select
                value={type}
                onChange={(e) =>
                  handleChangeType(e.target.value as Sale["type"])
                }
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
              >
                <option value="PRODUCTO">Producto</option>
                <option value="SERVICIO">Servicio</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Estado
              </label>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Sale["status"])}
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
              >
                <option value="PENDIENTE">Pendiente</option>
                <option value="CONFIRMADO">Confirmado</option>
                <option value="CERRADO">Cerrado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </div>

          {/* TURNO */}
          {type === "SERVICIO" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Fecha
                </label>

                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Hora
                </label>

                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>
          )}

          {/* ITEMS */}
          <div className="border-t border-neutral-200 pt-4">

            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-neutral-900">Ítems</span>

              <button
                type="button"
                onClick={addItem}
                className="text-sm font-semibold text-emerald-600 hover:underline"
              >
                + Agregar
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-neutral-200 p-4 bg-neutral-50"
                >
                  <div className="space-y-3">

                    <input
                      value={it.name}
                      onChange={(e) => setItem(idx, { name: e.target.value })}
                      placeholder="Nombre del producto"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />

                    <div className="grid grid-cols-3 gap-2">

                      <input
                        type="number"
                        value={type === "SERVICIO" ? 1 : it.qty}
                        disabled={type === "SERVICIO"}
                        onChange={(e) =>
                          setItem(idx, { qty: Number(e.target.value) })
                        }
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        placeholder="Cant"
                      />

                      <input
                        type="number"
                        value={it.price}
                        onChange={(e) =>
                          setItem(idx, { price: Number(e.target.value) })
                        }
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        placeholder="Precio"
                      />

                      <button
                        onClick={() => removeItem(idx)}
                        className="rounded-lg border border-neutral-300 hover:bg-red-50 text-red-500"
                      >
                        🗑
                      </button>

                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* TOTAL */}
            <div className="flex justify-between items-center mt-5 pt-4 border-t border-neutral-200">
              <span className="text-sm text-neutral-500">Total</span>

              <span className="text-2xl font-bold text-neutral-900">
                ${total.toFixed(2)}
              </span>
            </div>

          </div>

          {/* BOTONES */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-xl py-3 font-semibold border border-neutral-300 hover:bg-neutral-50"
            >
              Cancelar
            </button>

            <button
              onClick={handleSave}
              className="rounded-xl py-3 font-semibold bg-neutral-900 text-white hover:brightness-95"
            >
              Guardar
            </button>
          </div>

          <div className="text-xs text-neutral-400 text-center">
            En servicios la cantidad queda fija en 1
          </div>

        </div>
      </div>
    </div>
  );
}