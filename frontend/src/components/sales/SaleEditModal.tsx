"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sale } from "@/src/types/sales";

type EditableItem = {
  itemId?: string; // preserve for existing items
  qty: number;
  name: string;
  price: number;
  durationMin?: number;
};

type BusinessItem = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE";
  durationMinutes?: number;
};

function calcTotal(items: EditableItem[]) {
  return items.reduce(
    (acc, it) => acc + (Number.isFinite(it.price) ? it.price * it.qty : 0),
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
  const [businessItems, setBusinessItems] = useState<BusinessItem[]>([]);

  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const fetchItems = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBusinessItems(data.map((i: any) => ({ ...i, price: Number(i.price) })));
    } catch (err) {
      console.error("Error fetching items", err);
    }
  };

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  useEffect(() => {
    if (!open || !sale) return;

    setCustomerName(sale.customerName);
    setCustomerWhatsapp(sale.customerWhatsapp ?? "");
    setType(sale.type);
    setStatus(sale.status);

    setItems(
      sale.items.map((it) => ({
        itemId: it.itemId || (it as any).id, // preserve if available
        qty: sale.type === "SERVICIO" ? 1 : it.qty,
        name: it.name,
        price: it.price / it.qty, // store unit price in state for easier calc
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

  const total = useMemo(() => {
     return items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  }, [items]);

  if (!open || !sale) return null;

  const setItem = (idx: number, patch: Partial<EditableItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;

        const next = { ...it, ...patch };

        // If item changed by dropdown
        if (patch.itemId && patch.itemId !== it.itemId) {
           const selection = businessItems.find(bi => bi.id === patch.itemId);
           if (selection) {
              next.name = selection.name;
              next.price = selection.price;
              next.durationMin = selection.durationMinutes;
           }
        }

        next.qty = normalizeQty(type, next.qty);
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
        itemId: it.itemId,
        qty: normalizeQty(type, it.qty),
        name: it.name.trim(),
        price: (Number(it.price) || 0) * normalizeQty(type, it.qty),
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

  const isReadOnly = true; // For fields that cannot be edited in this view

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* HEADER */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0">
          <h2 className="font-bold text-neutral-900 text-lg">Editar venta</h2>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-6 overflow-y-auto bg-neutral-50/30">

          {/* READ-ONLY INFO SECTION */}
          <div className="space-y-4 p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
               <span className="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>
               <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Información no editable</span>
            </div>

            {/* CLIENTE */}
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Cliente
              </label>
              <div className="mt-1 w-full rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-sm text-neutral-600 font-medium">
                {customerName}
              </div>
            </div>

            {/* WHATSAPP */}
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                WhatsApp
              </label>
              <div className="mt-1 w-full rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-sm text-neutral-600 font-medium">
                {customerWhatsapp || "Sin WhatsApp"}
              </div>
            </div>

            {/* TIPO + ESTADO */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                  Tipo
                </label>
                <div className="mt-1 w-full rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-xs text-neutral-600 font-medium">
                  {type === "PRODUCTO" ? "Producto" : "Servicio"}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                  Estado
                </label>
                <div className="mt-1 w-full rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-xs text-neutral-600 font-medium">
                  {status}
                </div>
              </div>
            </div>
          </div>

          {/* TURNO */}
          {type === "SERVICIO" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">
                  Fecha
                </label>

                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">
                  Hora
                </label>

                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                />
              </div>
            </div>
          )}

          {/* ITEMS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-800 uppercase tracking-widest px-1">Items de la venta</span>

              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-bold hover:bg-emerald-100 transition active:scale-95"
              >
                + AGREGAR íTEM
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="relative rounded-2xl border border-neutral-200 p-4 bg-white shadow-sm"
                >
                  <div className="space-y-3">
                    {/* Selector de Producto */}
                    <div>
                      <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Producto / Servicio</label>
                      <select
                        value={it.itemId || ""}
                        onChange={(e) => setItem(idx, { itemId: e.target.value })}
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm bg-neutral-50/50 hover:bg-neutral-50 outline-none focus:ring-2 focus:ring-emerald-500 transition"
                      >
                        <option value="" disabled>Seleccionar de la tienda...</option>
                        {businessItems
                          .filter(bi => bi.type === (type === "PRODUCTO" ? "PRODUCT" : "SERVICE"))
                          .map(bi => (
                          <option key={bi.id} value={bi.id}>
                            {bi.name} - ${bi.price.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div>
                         <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Cantidad</label>
                         <input
                           type="number"
                           value={type === "SERVICIO" ? 1 : it.qty}
                           disabled={type === "SERVICIO"}
                           onChange={(e) =>
                             setItem(idx, { qty: Number(e.target.value) })
                           }
                           className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                           placeholder="Cant"
                         />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                           <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1 block">Subtotal</label>
                           <div className="w-full rounded-xl border border-neutral-100 px-3 py-2 text-sm bg-neutral-50 text-neutral-600 font-semibold">
                              ${(it.price * it.qty).toFixed(2)}
                           </div>
                        </div>
                        
                        <button
                          onClick={() => removeItem(idx)}
                          className="h-9 w-9 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition active:scale-90 shadow-sm"
                          title="Quitar ítem"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* TOTAL */}
            <div className="flex justify-between items-center mt-6 pt-5 border-t border-neutral-200">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Total venta</span>

              <span className="text-3xl font-black text-neutral-900">
                ${total.toFixed(2)}
              </span>
            </div>

          </div>

          {/* BOTONES */}
          <div className="flex gap-3 pt-4 sticky bottom-0 bg-neutral-50/10 backdrop-blur-sm -mx-1 px-1 mt-auto">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl py-4 font-bold text-sm border-2 border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 transition active:scale-[0.98] shadow-sm"
            >
              CANCELAR
            </button>

            <button
              onClick={handleSave}
              className="flex-[1.5] rounded-2xl py-4 font-black text-sm bg-neutral-900 text-white hover:brightness-110 transition active:scale-[0.98] shadow-lg shadow-neutral-900/20"
            >
              GUARDAR CAMBIOS
            </button>
          </div>

          <div className="text-[10px] text-neutral-400 text-center font-medium">
             Solo podés editar ítems y horas. <br/>Los datos de contacto y estado son de solo lectura.
          </div>

        </div>
      </div>
    </div>
  );
}