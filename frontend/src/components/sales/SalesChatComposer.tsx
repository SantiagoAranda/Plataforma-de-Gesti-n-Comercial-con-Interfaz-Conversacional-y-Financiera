"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { Sale } from "@/src/types/sales";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import ItemSelector from "@/src/components/shared/ItemSelector";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";
import ReservationSlotPicker from "@/src/components/reservations/ReservationSlotPicker";

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
  durationMinutes?: number | null;
};

type ApiBusinessItem = Omit<BusinessItem, "price"> & {
  price: number | string;
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

function formatTimeFromMinutes(value: number) {
  const hour = String(Math.floor(value / 60)).padStart(2, "0");
  const minute = String(value % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function ItemThumbnail() {
  return (
    <div className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-200">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
      </svg>
    </div>
  );
}

export default function SalesChatComposer({
  expanded,
  onOpenComposer,
  onCancelComposer,
  searchValue,
  onSearchChange,
  onSave,
}: {
  expanded: boolean;
  onOpenComposer: () => void;
  onCancelComposer: () => void;
  searchValue: string;
  onSearchChange: (val: string) => void;
  onSave: (data: {
    customerName?: string;
    customerWhatsapp?: string;
    type: Sale["type"];
    status: "PENDIENTE" | "CERRADO";
    paymentMethod: "CASH" | "BANK_TRANSFER";
    scheduledAt?: string;
    durationMinutes?: number;
    items: { itemId: string; quantity: number }[];
  }) => Promise<void> | void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [type, setType] = useState<Sale["type"]>("PRODUCTO");
  const [status, setStatus] = useState<"PENDIENTE" | "CERRADO">("PENDIENTE");
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("CASH");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [businessItems, setBusinessItems] = useState<BusinessItem[]>([]);
  const [newItem, setNewItem] = useState<{ itemId: string, qty: number | "" }>({ itemId: "", qty: 1 });
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [selectedStartMinute, setSelectedStartMinute] = useState<number | null>(null);
  const [manualDuration, setManualDuration] = useState("60");
  const [formError, setFormError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setIsStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchItems = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ApiBusinessItem[];
      setBusinessItems(data.map((i) => ({ ...i, price: Number(i.price) })));
    } catch (err) {
      console.error("Error fetching items", err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (!expanded) {
      setCustomerName("");
      setCountryCode("57");
      setPhoneNumber("");
      setType("PRODUCTO");
      setStatus("PENDIENTE");
      setPaymentMethod("CASH");
      setItems([]);
      setNewItem({ itemId: "", qty: 1 });
      setScheduledDate(null);
      setSelectedStartMinute(null);
      setManualDuration("60");
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [expanded]);

  const total = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  }, [items]);

  const updateItemQty = (idx: number, qty: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, qty: normalizeQty(type, qty) } : it))
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        setType("PRODUCTO");
        setScheduledDate(null);
        setSelectedStartMinute(null);
        setManualDuration("60");
        setFormError(null);
      }
      return next;
    });
  };

  const handleAddItem = () => {
    const bi = businessItems.find(i => i.id === newItem.itemId);
    if (!bi) return;
    setFormError(null);

    if (bi.type === "SERVICE" && items.length > 0) {
      setFormError("Para registrar servicios con turno, cargá la cita por separado.");
      return;
    }

    if (items.length === 0) {
      setType(bi.type === "SERVICE" ? "SERVICIO" : "PRODUCTO");
    } else if (type === "SERVICIO") {
      setFormError("Para registrar servicios con turno, cargá la cita por separado.");
      return;
    }


    const addedQty = newItem.qty === "" ? 1 : newItem.qty;

    setItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.itemId === bi.id);
      if (existingIdx > -1) {
        return prev.map((it, idx) =>
          idx === existingIdx ? { ...it, qty: it.qty + addedQty } : it
        );
      }
      return [
        ...prev,
        {
          itemId: bi.id,
          qty: addedQty,
          name: bi.name,
          price: bi.price,
          durationMin: bi.durationMinutes,
        },
      ];
    });
    setNewItem({ itemId: "", qty: 1 });
  };

  const handleSave = async () => {
    if (isSubmitting) return;

    setFormError(null);
    const cleanedName = customerName.trim();
    const rawPhone = phoneNumber.replace(/\D/g, "");
    const cleanedWhatsapp = rawPhone.length > 0 ? `${countryCode}${rawPhone}` : undefined;

    const cleanedItems = items
      .map((it) => ({
        itemId: it.itemId,
        quantity: normalizeQty(type, it.qty),
      }));

    if (cleanedItems.length === 0) return;

    const isService = type === "SERVICIO";
    const serviceItem = items[0];
    const serviceDuration = serviceItem?.durationMin ?? Number(manualDuration || 0);
    const scheduledAt = isService && scheduledDate && selectedStartMinute != null
      ? `${scheduledDate}T${formatTimeFromMinutes(selectedStartMinute)}:00`
      : undefined;

    if (isService && !scheduledAt) {
      setFormError("Elegí fecha y hora para registrar la cita.");
      return;
    }

    if (isService && (!Number.isFinite(serviceDuration) || serviceDuration <= 0)) {
      setFormError("Ingresá una duración válida para la cita.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        customerName: cleanedName || undefined,
        customerWhatsapp: cleanedWhatsapp,
        type,
        status,
        paymentMethod: paymentMethod || "CASH",
        scheduledAt,
        durationMinutes: isService ? serviceDuration : undefined,
        items: cleanedItems,
      });
    } catch (err) {
      console.error(err);
    } finally {
      if (isMounted.current && expanded) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-white px-4 pb-3 pt-2 lg:left-[408px] lg:right-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {expanded && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-10 flex flex-col bg-white rounded-[28px] border-t border-slate-100/80 overflow-hidden max-h-[75vh]">
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
                <div className="flex flex-col">
                  <h2 className="font-semibold text-slate-900 text-base">Nueva Venta</h2>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Creación Manual</span>
                </div>

                <div className="flex flex-col gap-4 p-2 bg-white">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-slate-500 mb-0.5 px-0">
                      Cliente
                    </span>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nombre del cliente"
                      className="bg-transparent border-0 border-b border-slate-100 rounded-none px-0 py-2 text-sm font-normal text-slate-800 placeholder:text-slate-400/70 focus:ring-0 focus:border-emerald-500 transition-colors outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-slate-500 mb-0.5 px-0">
                      WhatsApp
                    </span>
                    <div className="bg-transparent">
                      <PhoneSelector
                        countryCode={countryCode}
                        onCountryCodeChange={setCountryCode}
                        phoneNumber={phoneNumber}
                        onPhoneNumberChange={setPhoneNumber}
                        flat
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-slate-500 mb-0.5 px-0">
                        Estado Inicial
                      </span>
                      <div className="relative w-full" ref={statusRef}>
                        <button
                          type="button"
                          onClick={() => setIsStatusOpen(!isStatusOpen)}
                          className="flex h-10 w-full items-center justify-between bg-transparent border-0 border-b border-slate-100 rounded-none px-0 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 transition-colors"
                        >
                          <span>{status === "PENDIENTE" ? "Pendiente" : "Cerrado"}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down text-slate-400 shrink-0"><path d="m6 9 6 6 6-6" /></svg>
                        </button>

                        {isStatusOpen && (
                          <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-full flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-md animate-in fade-in slide-in-from-top-1">
                            <button
                              type="button"
                              onClick={() => {
                                setStatus("PENDIENTE");
                                setIsStatusOpen(false);
                              }}
                              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${status === "PENDIENTE" ? "bg-emerald-50/50 text-emerald-700 font-medium" : "text-slate-700"
                                }`}
                            >
                              <span>Pendiente</span>
                              {status === "PENDIENTE" && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStatus("CERRADO");
                                setIsStatusOpen(false);
                              }}
                              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${status === "CERRADO" ? "bg-emerald-50/50 text-emerald-700 font-medium" : "text-slate-700"
                                }`}
                            >
                              <span>Cerrado</span>
                              {status === "CERRADO" && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 pt-0.5">
                      <span className="text-xs font-medium text-slate-500 mb-0.5 px-0">Medio de pago</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("CASH")}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${paymentMethod === "CASH"
                              ? "bg-emerald-600 text-white rounded-xl"
                              : "border border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50 rounded-xl"
                            }`}
                        >
                          Efectívo
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("BANK_TRANSFER")}
                          className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${paymentMethod === "BANK_TRANSFER"
                              ? "bg-emerald-600 text-white rounded-xl"
                              : "border border-slate-100 bg-slate-50/50 text-slate-600 hover:bg-slate-50 rounded-xl"
                            }`}
                        >
                          Transfere.
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {type === "SERVICIO" && items.length > 0 && (
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-emerald-50 bg-emerald-50/20">
                    <div className="rounded-xl bg-white p-3 border border-emerald-100">
                      <span className="text-xs font-medium text-emerald-700">
                        Servicio seleccionado
                      </span>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-slate-800">
                          {items[0].name}
                        </span>
                        <span className="shrink-0 text-sm font-medium text-slate-800">
                          ${formatMoney(items[0].price)}
                        </span>
                      </div>
                    </div>

                    <ReservationSlotPicker
                      itemId={items[0].itemId}
                      mode="private"
                      selectedDate={scheduledDate}
                      selectedStartMinute={selectedStartMinute}
                      onChange={({ date, startMinute }) => {
                        setScheduledDate(date);
                        setSelectedStartMinute(startMinute);
                      }}
                    />

                    {!items[0]?.durationMin && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-slate-500 mb-1 px-1">Duración en minutos</span>
                        <input
                          type="number"
                          min="1"
                          value={manualDuration}
                          onChange={(e) => setManualDuration(e.target.value)}
                          className="h-10 rounded-xl border border-transparent bg-slate-50 px-3 text-sm font-normal text-slate-800 outline-none focus:bg-white focus:border-slate-200 focus:ring-0 transition"
                        />
                      </div>
                    )}
                    {items[0]?.durationMin && (
                      <p className="px-1 text-[11px] font-semibold text-emerald-700">
                        Duración: {items[0].durationMin} min
                      </p>
                    )}
                  </div>
                )}

                {type === "PRODUCTO" && (
                  <div className="space-y-3">
                    <span className="text-xs font-medium text-slate-500 mb-1 px-1">Items de venta</span>

                    {/* Add items composer */}
                    <div className="flex flex-col gap-3 p-3 bg-slate-50/30 rounded-xl">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 mb-1 px-1">Producto / Servicio</span>
                        <div className="relative bg-white rounded-xl">
                          <ItemSelector
                            value={newItem.itemId}
                            onChange={(val) => setNewItem(prev => ({ ...prev, itemId: val }))}
                            options={businessItems.filter(bi =>
                              items.length === 0 ? true : bi.type === (type === "PRODUCTO" ? "PRODUCT" : "SERVICE")
                            )}
                            placeholder="Buscar ítem..."
                          />
                        </div>
                      </div>
                      {(!newItem.itemId || businessItems.find(i => i.id === newItem.itemId)?.type === "PRODUCT") && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-slate-500 mb-1 px-1">Cantidad</span>
                          <input
                            type="number"
                            min="1"
                            value={newItem.qty}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setNewItem(prev => ({ ...prev, qty: "" }));
                                return;
                              }
                              const num = parseInt(val, 10);
                              if (!isNaN(num)) {
                                setNewItem(prev => ({ ...prev, qty: num }));
                              }
                            }}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => {
                              if (newItem.qty === "" || newItem.qty <= 0) {
                                setNewItem(prev => ({ ...prev, qty: 1 }));
                              }
                            }}
                            className="w-full h-10 bg-slate-50 border border-transparent rounded-xl px-3 text-sm font-normal text-slate-800 outline-none focus:bg-white focus:border-slate-200 focus:ring-0 transition"
                          />
                        </div>
                      )}
                      <button
                        onClick={handleAddItem}
                        disabled={!newItem.itemId}
                        className="w-full h-10 mt-2 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 transition active:scale-[0.98] disabled:opacity-40 disabled:bg-neutral-200"
                      >
                        Añadir a la venta
                      </button>
                    </div>

                    {formError && (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        {formError}
                      </div>
                    )}

                    {/* Items List */}
                    <div className="space-y-2">
                      {items.map((it, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2.5 bg-white border border-slate-100 rounded-xl">
                          <ItemThumbnail />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-800 text-xs truncate">{it.name}</div>
                            <div className="flex items-center gap-1 text-[10px] font-normal text-slate-400 mt-0.5">
                              {it.qty} unid. x ${formatMoney(it.price)} = ${formatMoney(it.price * it.qty)}
                            </div>
                          </div>

                          {type === "PRODUCTO" && (
                            <div className="flex items-center gap-1.5 bg-slate-50 px-1.5 py-1 rounded-md border border-transparent mr-1">
                              <button onClick={() => updateItemQty(idx, it.qty - 1)} className="text-neutral-500 hover:text-neutral-800 w-4 flex justify-center font-bold text-[13px]">-</button>
                              <span className="text-[11px] font-semibold text-slate-700 w-3 text-center">{it.qty}</span>
                              <button onClick={() => updateItemQty(idx, it.qty + 1)} className="text-neutral-500 hover:text-neutral-800 w-4 flex justify-center font-bold text-[13px]">+</button>
                            </div>
                          )}

                          <button onClick={() => removeItem(idx)} className="p-1.5 text-neutral-300 hover:text-rose-500 transition mr-1">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {type === "SERVICIO" && formError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {formError}
                  </div>
                )}

                <div className="h-4" />
              </div>
            </div>
          )}

          {/* Bottom Bar */}
          <WhatsappComposer
            value={searchValue}
            onChange={onSearchChange}
            leftAction={expanded ? onCancelComposer : onOpenComposer}
            rightAction={expanded ? handleSave : undefined}
            placeholder="Buscar por cliente o ID..."
            leftIconVariant={expanded ? "x" : "plus"}
            rightIconVariant={expanded ? "send" : "search"}
            submitDisabled={expanded && items.length === 0}
            isSubmitting={isSubmitting}
            centerContent={
              expanded ? (
                <div className="flex h-full w-full items-center justify-between pt-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Total venta</span>
                  <span className="text-sm font-medium text-slate-800">${formatMoney(total)}</span>
                </div>
              ) : undefined
            }
            plusAriaLabel={expanded ? "Cancelar venta" : "Nueva venta"}
            submitAriaLabel={expanded ? "Guardar venta" : "Buscar ventas"}
          />
        </div>
      </div>
    </div>
  );
}
