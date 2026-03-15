import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, ChevronDown, Send } from "lucide-react";
import type { Sale } from "@/src/types/sales";
import { listReservationAvailability } from "@/src/services/sales";
import { formatLocalDateKey, formatLocalDateTimeValue, parseLocalDateTimeParts } from "@/src/lib/datetime";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";

type EditableItem = {
  itemId?: string;
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
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState(""); 
  const [type, setType] = useState<Sale["type"]>("PRODUCTO");
  const [status, setStatus] = useState<Sale["status"]>("PENDIENTE");
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("CASH");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [businessItems, setBusinessItems] = useState<BusinessItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [newItem, setNewItem] = useState<{itemId: string, qty: number}>({itemId: "", qty: 1});
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [reservationPickerOpen, setReservationPickerOpen] = useState(false);

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
    const rawPhone = (sale.customerWhatsapp ?? "").replace(/\D/g, "");

    if (rawPhone.length > 10) {
      setCountryCode(rawPhone.slice(0, rawPhone.length - 10));
      setPhoneNumber(rawPhone.slice(-10));
    } else {
      setCountryCode("57");
      setPhoneNumber(rawPhone);
    }
    setType(sale.type);
    setStatus(sale.status);
    setPaymentMethod(sale.paymentMethod ?? "CASH");
    setExpanded(false);
    setNewItem({itemId: "", qty: 1});
    setAvailabilityError(null);
    setAvailableDates([]);
    setAvailableSlots([]);

    setItems(
      sale.items.map((it) => ({
        itemId: it.itemId || (it as any).id,
        qty: sale.type === "SERVICIO" ? 1 : it.qty,
        name: it.name,
        price: it.price / (it.qty || 1),
        durationMin: it.durationMin,
      }))
    );

    const parts = parseLocalDateTimeParts(sale.scheduledAt);
    if (sale.type === "SERVICIO" && parts) {
      setScheduledDate(parts.date);
      setScheduledTime(parts.time);
    } else {
      setScheduledDate("");
      setScheduledTime("");
    }
  }, [open, sale]);

  const total = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  }, [items]);
  const isReservation = sale?.sourceType === "RESERVATION";

  const loadReservationDates = async (monthDate: Date) => {
    if (!isReservation) return;

    try {
      setLoadingAvailability(true);
      setAvailabilityError(null);
      const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      const data = await listReservationAvailability(sale.id, { month });
      setAvailableDates(data);
    } catch (error: any) {
      console.error(error);
      setAvailabilityError("No se pudo cargar la disponibilidad");
      setAvailableDates([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const loadReservationSlots = async (dateKey: string) => {
    if (!isReservation) return;

    try {
      setLoadingAvailability(true);
      setAvailabilityError(null);
      const data = await listReservationAvailability(sale.id, { date: dateKey });
      setAvailableSlots(data);
    } catch (error: any) {
      console.error(error);
      setAvailabilityError("No se pudo cargar los horarios disponibles");
      setAvailableSlots([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  useEffect(() => {
    if (!reservationPickerOpen || !isReservation || !scheduledDate) return;
    loadReservationSlots(scheduledDate);
  }, [isReservation, reservationPickerOpen, scheduledDate]);

  if (!open || !sale) return null;

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
    const cleanedName = customerName.trim();
    if (!cleanedName) return;

    let scheduledAt: string | undefined = undefined;
    if (type === "SERVICIO") {
      if (!scheduledDate || !scheduledTime) return;
      scheduledAt = formatLocalDateTimeValue(scheduledDate, scheduledTime);
    }

    const cleanedItems = items
      .map((it) => ({
        itemId: it.itemId,
        qty: normalizeQty(type, it.qty),
        name: it.name.trim(),
        price: (Number(it.price) || 0) * normalizeQty(type, it.qty),
        durationMin: it.durationMin,
      }))
      .filter((it) => it.name.length > 0);

    if (cleanedItems.length === 0) return;

    const updated: Sale = {
      ...sale,
      customerName: cleanedName,
      customerWhatsapp:
        phoneNumber.trim().length > 0
          ? `${countryCode}${phoneNumber}`
          : undefined,
      type,
      status,
      items: cleanedItems,
      scheduledAt,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-md flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden h-[90vh] sm:h-auto sm:max-h-[85vh] relative animate-in slide-in-from-bottom-full duration-300">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-20">
          <div className="flex flex-col">
             <h2 className="font-bold text-neutral-900 text-lg">Editar Pedido</h2>
             <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">#{sale.id?.slice(-6) || 'N/A'}</span>
          </div>

          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-neutral-50/20">
          <div className="flex flex-col gap-3 p-4 rounded-xl border border-neutral-100 bg-white">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                Cliente
              </span>

              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-[13px] font-semibold text-neutral-800 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                WhatsApp
              </span>

              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-[13px] font-bold text-neutral-700 outline-none"
                >
                  <option value="57">🇨🇴 +57</option>
                  <option value="54">🇦🇷 +54</option>
                  <option value="52">🇲🇽 +52</option>
                  <option value="34">🇪🇸 +34</option>
                  <option value="56">🇨🇱 +56</option>
                  <option value="51">🇵🇪 +51</option>
                </select>

                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="Número"
                  className="flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-[13px] font-bold text-emerald-600 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                  Tipo
                </span>
                <span className="text-[12px] font-semibold text-neutral-600">
                  {type === "PRODUCTO" ? "Directa" : "Servicio"}
                </span>
              </div>

              <div className="flex flex-col gap-0.5 text-right">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                  Estado
                </span>
                <span className="text-[12px] font-semibold text-neutral-600">
                  {status}
                </span>
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
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700"
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
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700"
                  }`}
                >
                  Transferencia
                </button>
              </div>
            </div>
          </div>

          {type === "SERVICIO" && (
            <div className="rounded-xl border border-neutral-100 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Turno</div>
                  <div className="text-sm font-semibold text-neutral-800">
                    {scheduledDate && scheduledTime ? `${scheduledDate} ${scheduledTime}` : "Sin turno"}
                  </div>
                </div>
                {isReservation && (
                  <button
                    onClick={() => setReservationPickerOpen(true)}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    Reprogramar
                  </button>
                )}
              </div>
              {loadingAvailability && (
                <div className="text-xs text-neutral-400">Cargando disponibilidad...</div>
              )}
              {availabilityError && (
                <div className="text-xs text-red-500">{availabilityError}</div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">Items cargados</span>

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

                  {type === "PRODUCTO" && !isReservation && (
                    <div className="flex items-center gap-2 bg-neutral-50 px-2 py-1 rounded-lg border border-neutral-100">
                      <button onClick={() => updateItemQty(idx, it.qty - 1)} className="text-neutral-500 hover:text-neutral-800 w-4 font-bold text-sm">-</button>
                      <span className="text-xs font-black text-neutral-700 w-3 text-center">{it.qty}</span>
                      <button onClick={() => updateItemQty(idx, it.qty + 1)} className="text-neutral-500 hover:text-neutral-800 w-4 font-bold text-sm">+</button>
                    </div>
                  )}

                  {!isReservation && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-2 text-neutral-300 hover:text-rose-500 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-neutral-100 rounded-2xl">
                   <p className="text-[11px] font-bold text-neutral-300 uppercase italic">Sin productos en la lista</p>
                </div>
              )}
            </div>
          </div>

          <div className="h-16" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 px-3 pb-4 pt-2">
           <div className="relative">
              {expanded && !isReservation && (
                <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 bg-white border border-neutral-200 rounded-[24px] shadow-2xl p-4 animate-in slide-in-from-bottom-4 duration-200 overflow-hidden ring-1 ring-black/5">
                   <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Producto / Servicio</span>
                        <div className="relative">
                           <select
                            value={newItem.itemId}
                            onChange={(e) => setNewItem(prev => ({ ...prev, itemId: e.target.value }))}
                            className="w-full h-11 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-semibold outline-none appearance-none cursor-pointer focus:border-emerald-500 transition"
                           >
                            <option value="">Seleccionar...</option>
                            {businessItems
                              .filter(bi => bi.type === (type === "PRODUCTO" ? "PRODUCT" : "SERVICE"))
                              .map(bi => (
                                <option key={bi.id} value={bi.id}>{bi.name}</option>
                              ))}
                           </select>
                           <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                        </div>
                      </div>

                      {type === "PRODUCTO" && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Cantidad</span>
                          <input
                            type="number"
                            min="1"
                            value={newItem.qty}
                            onChange={(e) => setNewItem(prev => ({ ...prev, qty: Number(e.target.value) }))}
                            className="w-full h-11 bg-neutral-50 border border-neutral-200 rounded-xl px-4 text-sm font-semibold outline-none focus:border-emerald-500 transition"
                          />
                        </div>
                      )}

                      <button
                        onClick={handleAddItem}
                        disabled={!newItem.itemId}
                        className="w-full h-11 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-emerald-700 transition active:scale-[0.98] disabled:opacity-40"
                      >
                        Anadir a la lista
                      </button>
                   </div>
                </div>
              )}

              <div className="rounded-[28px] bg-white p-2 shadow-2xl ring-1 ring-black/10 border-t border-neutral-100/50">
                 <div className="flex items-end gap-2">
                    {!isReservation && (
                      <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95"
                      >
                        {expanded ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                      </button>
                    )}

                    <div className="min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-2.5 ring-1 ring-neutral-200/60 flex items-center justify-between">
                       <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Total venta</span>
                       <span className="text-lg font-black text-neutral-900">${formatMoney(total)}</span>
                    </div>

                    <button
                      onClick={handleSave}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl transition hover:bg-emerald-600 active:scale-90"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                 </div>
              </div>
           </div>

           <div className="text-[9px] text-neutral-400 font-bold text-center mt-3 uppercase tracking-widest opacity-60">
             Pulsa el icono de enviar para guardar cambios
           </div>
        </div>
      </div>

      {isReservation && (
        <ReservationDrawer
          open={reservationPickerOpen}
          onClose={() => setReservationPickerOpen(false)}
          title={sale.items[0]?.name ?? "Reserva"}
          subtitle="Selecciona una nueva fecha y horario disponibles"
          timeSlots={availableSlots}
          availableDates={availableDates}
          selectedDateValue={scheduledDate || null}
          initialFullName={customerName}
          initialWhatsapp={
            phoneNumber ? `${countryCode}${phoneNumber}` : ""
          }
          onMonthChange={loadReservationDates}
          onDateChange={(date) => {
            const key = formatLocalDateKey(date);
            setScheduledDate(key);
            loadReservationSlots(key);
          }}
          onConfirm={(data) => {
            if (!data.date || !data.time) return;
            const dateKey = formatLocalDateKey(data.date);
            setScheduledDate(dateKey);
            setScheduledTime(data.time);
            setReservationPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
