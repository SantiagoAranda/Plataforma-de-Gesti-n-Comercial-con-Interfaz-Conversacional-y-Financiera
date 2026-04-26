"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Send } from "lucide-react";
import type { Sale } from "@/src/types/sales";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import ItemSelector from "@/src/components/shared/ItemSelector";

type EditableItem = {
  itemId: string;
  qty: number;
  name: string;
  price: number;
  durationMin?: number | null;
};

type BusinessItem = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE";
  durationMinutes?: number;
};

function formatMoney(n: number) {
  return (n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function normalizeQty(type: Sale["type"], qty: number) {
  if (type === "SERVICIO") return 1;
  return Math.max(1, Math.floor(qty || 1));
}

function ItemThumbnail() {
  return (
    <div className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-200">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
      </svg>
    </div>
  );
}

export default function SaleCreateModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    customerName: string;
    customerWhatsapp: string;
    type: Sale["type"];
    status: "PENDIENTE" | "CERRADO";
    paymentMethod: "CASH" | "BANK_TRANSFER";
    items: { itemId: string; quantity: number }[];
  }) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState(""); 
  const [type, setType] = useState<Sale["type"]>("PRODUCTO");
  const [status, setStatus] = useState<"PENDIENTE" | "CERRADO">("PENDIENTE");
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("CASH");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [businessItems, setBusinessItems] = useState<BusinessItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [newItem, setNewItem] = useState<{itemId: string, qty: number}>({itemId: "", qty: 1});

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
    if (!open) return;
    setCustomerName("");
    setCountryCode("57");
    setPhoneNumber("");
    setType("PRODUCTO");
    setStatus("PENDIENTE");
    setPaymentMethod("CASH");
    setItems([]);
    setExpanded(false);
    setNewItem({ itemId: "", qty: 1 });
  }, [open]);

  const total = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  }, [items]);

  if (!open) return null;

  const updateItemQty = (idx: number, qty: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, qty: normalizeQty(type, qty) } : it))
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddItem = () => {
    const bi = businessItems.find(i => i.id === newItem.itemId);
    if (!bi) return;

    if (items.length === 0) {
      setType(bi.type === "SERVICE" ? "SERVICIO" : "PRODUCTO");
    }

    setItems((prev) => [
      ...prev,
      {
        itemId: bi.id,
        qty: newItem.qty,
        name: bi.name,
        price: bi.price,
        durationMin: bi.durationMinutes,
      },
    ]);
    setExpanded(false);
    setNewItem({itemId: "", qty: 1});
  };

  const handleSave = () => {
    const cleanedName = customerName.trim() || "Cliente Local";
    const cleanedWhatsapp = phoneNumber.trim().length > 0 ? `${countryCode}${phoneNumber}` : "0000000000";

    const cleanedItems = items
      .map((it) => ({
        itemId: it.itemId,
        quantity: normalizeQty(type, it.qty),
      }));

    if (cleanedItems.length === 0) return;

    onSave({
      customerName: cleanedName,
      customerWhatsapp: cleanedWhatsapp,
      type,
      status,
      paymentMethod: paymentMethod || "CASH",
      items: cleanedItems,
    });
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-end sm:p-0 backdrop-blur-sm">
      <div className="w-full sm:max-w-md flex flex-col bg-white rounded-t-[32px] shadow-2xl overflow-hidden h-[90vh] sm:h-[85vh] relative animate-in slide-in-from-bottom-full duration-300 pb-safe">
        {/* Drag handle hint */}
        <div className="w-full flex justify-center pt-3 pb-1 bg-white absolute top-0 z-30 pointer-events-none">
          <div className="w-12 h-1.5 rounded-full bg-neutral-200" />
        </div>

        <div className="px-5 pt-7 pb-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-20">
          <div className="flex flex-col">
             <h2 className="font-bold text-neutral-900 text-lg">Nueva Venta</h2>
             <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Creación Manual</span>
          </div>

          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-neutral-50/20">
          <div className="flex flex-col gap-3 p-4 rounded-xl border border-neutral-100 bg-white">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                Cliente (Opcional)
              </span>

              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] font-semibold text-neutral-800 outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-neutral-400 placeholder:font-medium"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                WhatsApp (Opcional)
              </span>

              <PhoneSelector
                countryCode={countryCode}
                onCountryCodeChange={setCountryCode}
                phoneNumber={phoneNumber}
                onPhoneNumberChange={setPhoneNumber}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                  Estado Inicial
                </span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "PENDIENTE" | "CERRADO")}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-[13px] font-bold text-neutral-700 outline-none bg-neutral-50 h-8"
                >
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </div>

              <div className="flex flex-col gap-0.5 text-right">
              </div>
            </div>
            <div className="col-span-2 flex flex-col gap-1 pt-2">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Medio de pago</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CASH")}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                    paymentMethod === "CASH"
                      ? "bg-emerald-500 text-white"
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("BANK_TRANSFER")}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                    paymentMethod === "BANK_TRANSFER"
                      ? "bg-emerald-500 text-white"
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Transferencia
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">Items de venta</span>

            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <ItemThumbnail />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-neutral-800 text-sm truncate">{it.name}</div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase">
                       {it.qty} unidades - ${formatMoney(it.price * it.qty)}
                    </div>
                  </div>

                  {type === "PRODUCTO" && (
                    <div className="flex items-center gap-2 bg-neutral-50 px-2 py-1 rounded-lg border border-neutral-100">
                      <button onClick={() => updateItemQty(idx, it.qty - 1)} className="text-neutral-500 hover:text-neutral-800 w-4 font-bold text-sm">-</button>
                      <span className="text-xs font-black text-neutral-700 w-3 text-center">{it.qty}</span>
                      <button onClick={() => updateItemQty(idx, it.qty + 1)} className="text-neutral-500 hover:text-neutral-800 w-4 font-bold text-sm">+</button>
                    </div>
                  )}

                  <button
                    onClick={() => removeItem(idx)}
                    className="p-2 text-neutral-300 hover:text-rose-500 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-neutral-200 bg-neutral-50 rounded-2xl">
                   <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Sin productos en la lista</p>
                </div>
              )}
            </div>
          </div>

          <div className="h-16" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 px-3 pb-4 pt-2">
           <div className="relative">
              {expanded && (
                <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 bg-white border border-neutral-200 rounded-[24px] shadow-2xl p-4 animate-in slide-in-from-bottom-4 duration-200 overflow-hidden ring-1 ring-black/5">
                   <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Item</span>
                        <div className="relative">
                           <ItemSelector
                             value={newItem.itemId}
                             onChange={(val) => setNewItem(prev => ({ ...prev, itemId: val }))}
                             options={businessItems.filter(bi => 
                               items.length === 0 ? true : bi.type === (type === "PRODUCTO" ? "PRODUCT" : "SERVICE")
                             )}
                             placeholder="Elegí un item..."
                           />
                        </div>
                      </div>

                      {(!newItem.itemId || businessItems.find(i => i.id === newItem.itemId)?.type === "PRODUCT") && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Cantidad</span>
                          <input
                            type="number"
                            min="1"
                            value={newItem.qty}
                            onChange={(e) => setNewItem(prev => ({ ...prev, qty: Number(e.target.value) }))}
                            className="w-full h-11 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-semibold outline-none focus:border-emerald-500 focus:bg-white transition"
                          />
                        </div>
                      )}

                      <button
                        onClick={handleAddItem}
                        disabled={!newItem.itemId}
                        className="w-full h-11 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-emerald-700 transition active:scale-[0.98] disabled:opacity-40"
                      >
                        Añadir a la lista
                      </button>
                   </div>
                </div>
              )}

              <div className="rounded-[28px] bg-white p-2 shadow-2xl ring-1 ring-black/10 border-t border-neutral-100/50">
                 <div className="flex items-end gap-2">
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95 border border-neutral-200/60"
                    >
                      {expanded ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                    </button>

                    <div className="min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-2.5 ring-1 ring-neutral-200/60 flex items-center justify-between">
                       <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Total venta</span>
                       <span className="text-lg font-black text-neutral-900">${formatMoney(total)}</span>
                    </div>

                    <button
                      onClick={handleSave}
                      disabled={items.length === 0}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl transition hover:bg-emerald-600 active:scale-90 disabled:opacity-40 disabled:hover:bg-emerald-500"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                 </div>
              </div>
           </div>

           <div className="text-[9px] text-neutral-400 font-bold text-center mt-3 uppercase tracking-widest opacity-60">
             Pulsa el icono de enviar para registrar la venta
           </div>
        </div>
      </div>
    </div>
  );
}
