"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { Trash2, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import type { Sale } from "@/src/types/sales";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import ItemSelector from "@/src/components/shared/ItemSelector";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";
import ReservationSlotPicker from "@/src/components/reservations/ReservationSlotPicker";
import ProductOptionSelector, { type OptionSelection } from "@/src/components/shared/ProductOptionSelector";
import type { PublicItemOptionGroup } from "@/src/types/item";
import type { BuyerFiscalContext } from "@/src/lib/tax/api";
import SaleTaxPanel, {
  buildBuyerFiscalContext,
  DEFAULT_SALE_FISCAL_FORM,
  type SaleFiscalFormState,
} from "@/src/components/sales/SaleTaxPanel";
import { COLOMBIAN_MUNICIPALITIES } from "@/src/constants/colombianMunicipalities";
import { api } from "@/src/lib/api";

type EditableItem = {
  itemId: string;
  qty: number;
  name: string;
  price: number;
  durationMin?: number | null;
  optionSelections?: OptionSelection[];
  optionNames?: string[];
};

type BusinessItem = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE";
  inventoryMode?: "NONE" | "SIMPLE" | "RECIPE_BASED" | string | null;
  currentStock?: number | string | null;
  durationMinutes?: number | null;
  optionGroups?: PublicItemOptionGroup[];
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
    buyerFiscalContext?: BuyerFiscalContext;
    items: Array<{
      itemId: string;
      quantity: number;
      optionSelections?: OptionSelection[];
    }>;
  }) => Promise<void> | void;
}) {
  const [fiscalForm, setFiscalForm] = useState<SaleFiscalFormState>(DEFAULT_SALE_FISCAL_FORM);
  const [taxPreview, setTaxPreview] = useState<any>(null);
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
  const [customizing, setCustomizing] = useState<{ item: BusinessItem; quantity: number } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchItems = async () => {
    try {
      const data = await api<ApiBusinessItem[]>("/items?context=sales");
      const mapped: BusinessItem[] = (data || []).map((item) => ({
        ...item,
        price: Number(item.price),
      }));
      setBusinessItems(mapped);
    } catch (error) {
      console.error("Error fetching items:", error);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (!expanded) {
      setFiscalForm(DEFAULT_SALE_FISCAL_FORM);
      setTaxPreview(null);
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

  useEffect(() => {
    if (!newItem.itemId) return;
    const selectedBi = businessItems.find(i => i.id === newItem.itemId);
    if (!selectedBi) return;
    
    setFiscalForm(prev => ({
      ...prev,
      saleConcept: selectedBi.type === "SERVICE" ? "SERVICES" : "GOODS"
    }));
  }, [newItem.itemId, businessItems]);

  const total = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  }, [items]);

  const totalToDisplay = useMemo(() => {
    if (taxPreview) {
      const chargedTotal = Number(taxPreview.vatTotal ?? 0) + Number(taxPreview.impoconsumoTotal ?? 0);
      return Number(taxPreview.subtotal ?? 0) + chargedTotal;
    }
    return total;
  }, [taxPreview, total]);

  const totalLabel = useMemo(() => {
    if (taxPreview && (Number(taxPreview.vatTotal ?? 0) > 0 || Number(taxPreview.impoconsumoTotal ?? 0) > 0)) {
      return "Total cobrado";
    }
    return "Subtotal";
  }, [taxPreview]);

  const responsibilities = [
    { key: "withholdingSubjectIsDeclarante", label: "Declarante de renta" },
    { key: "buyerIsIvaResponsable", label: "Responsable IVA (48)" },
    { key: "buyerIsRetenedor", label: "Agente Retención (07)" },
    { key: "buyerIsGranContribuyente", label: "Gran Contrib. (13)" },
    { key: "buyerIsAutorretenedor", label: "Autorretenedor (15)" },
    { key: "buyerIsRegimenSimple", label: "Régimen Simple (47)" },
  ] as const;

  const buyerFiscalContext = useMemo<BuyerFiscalContext>(
    () => buildBuyerFiscalContext(fiscalForm),
    [fiscalForm],
  );

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
    if ((bi.optionGroups?.length ?? 0) > 0) {
      setCustomizing({ item: bi, quantity: addedQty });
      return;
    }
    const existingQty = items
      .filter((it) => it.itemId === bi.id)
      .reduce((acc, it) => acc + it.qty, 0);
    if (bi.inventoryMode === "SIMPLE") {
      const available = Number(bi.currentStock ?? 0);
      const required = existingQty + addedQty;
      if (available <= 0) {
        toast.error(`${bi.name} no tiene stock disponible.`);
        return;
      }
      if (required > available) {
        toast.error(`Stock insuficiente para ${bi.name}. Disponible: ${available}, requerido: ${required}.`);
        return;
      }
    }

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
    const cleanedName = fiscalForm.buyerName.trim();
    const rawPhone = phoneNumber.replace(/\D/g, "");
    const cleanedWhatsapp = rawPhone.length > 0 ? `${countryCode}${rawPhone}` : undefined;

    const cleanedItems = items
      .map((it) => ({
        itemId: it.itemId,
        quantity: normalizeQty(type, it.qty),
        optionSelections: it.optionSelections,
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
        buyerFiscalContext,
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
    <div
      className="fixed inset-x-0 bottom-0 z-30 bg-white px-4 pt-2 lg:left-[408px] lg:right-0"
      style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 12px))" }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {expanded && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 mx-auto w-full max-w-[480px] z-10 flex flex-col bg-white rounded-[28px] border border-slate-100 shadow-2xl overflow-hidden max-h-[75vh]">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex flex-col">
                  <h2 className="font-semibold text-slate-900 text-base">Nueva Venta</h2>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">CREACIÓN MANUAL</span>
                </div>
                <button
                  type="button"
                  onClick={onCancelComposer}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
                <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFiscalForm(prev => ({
                        ...prev,
                        buyerType: "NATURAL" as const,
                        buyerDocumentType: "CC" as const,
                        buyerIsIvaResponsable: false,
                        buyerIsRetenedor: false,
                        buyerIsGranContribuyente: false,
                        buyerIsAutorretenedor: false,
                        buyerIsRegimenSimple: false,
                      }));
                    }}
                    className={`h-9 rounded-xl text-xs font-semibold transition ${
                      fiscalForm.buyerType === "NATURAL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Persona
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiscalForm(prev => ({
                        ...prev,
                        buyerType: "JURIDICA" as const,
                        buyerDocumentType: "NIT" as const,
                        buyerIsIvaResponsable: true,
                        buyerIsRetenedor: true,
                      }));
                    }}
                    className={`h-9 rounded-xl text-xs font-semibold transition ${
                      fiscalForm.buyerType === "JURIDICA" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Empresa
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Datos del cliente
                    </span>
                    <input
                      value={fiscalForm.buyerName}
                      onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerName: e.target.value }))}
                      placeholder={fiscalForm.buyerType === "JURIDICA" ? "Razón social" : "Nombre del cliente"}
                      className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 placeholder:text-slate-400 transition"
                    />
                  </div>

                  <div className="grid grid-cols-[110px_1fr] gap-2 w-full min-w-0">
                    <div className="min-w-0">
                      <select
                        value={fiscalForm.buyerDocumentType}
                        onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerDocumentType: e.target.value as any }))}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-emerald-500 transition text-slate-700"
                      >
                        {fiscalForm.buyerType === "JURIDICA" ? (
                          <option value="NIT">NIT / RUT</option>
                        ) : (
                          <>
                            <option value="CC">Cédula</option>
                            <option value="CE">Cédula Extr.</option>
                            <option value="PASAPORTE">Pasaporte</option>
                            <option value="TI">T. Identidad</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <input
                        value={fiscalForm.buyerDocumentNumber}
                        onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerDocumentNumber: e.target.value }))}
                        placeholder="Número documento"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 placeholder:text-slate-400 transition"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <PhoneSelector
                      countryCode={countryCode}
                      onCountryCodeChange={setCountryCode}
                      phoneNumber={phoneNumber}
                      onPhoneNumberChange={setPhoneNumber}
                      flat
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <input
                      type="email"
                      value={fiscalForm.buyerEmail}
                      onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerEmail: e.target.value }))}
                      placeholder="Correo (opcional)"
                      className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 placeholder:text-slate-400 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Datos fiscales de la venta
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={fiscalForm.saleConcept}
                      onChange={(e) => setFiscalForm(prev => ({ ...prev, saleConcept: e.target.value as any }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 transition"
                    >
                      <option value="GOODS">Bienes / Productos</option>
                      <option value="SERVICES">Servicios</option>
                      <option value="HONORARIOS">Honorarios</option>
                      <option value="ARRENDAMIENTOS">Arrendamientos</option>
                    </select>

                    <select
                      value={fiscalForm.fiscalMunicipalityCode}
                      onChange={(e) => setFiscalForm(prev => ({ ...prev, fiscalMunicipalityCode: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 transition"
                    >
                      <option value="">Municipio ICA</option>
                      {COLOMBIAN_MUNICIPALITIES.map((municipality) => (
                        <option key={municipality.code} value={municipality.code}>
                          {municipality.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Responsabilidades del comprador
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {responsibilities.map(({ key, label }) => {
                      const active = Boolean(fiscalForm[key]);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setFiscalForm(prev => ({
                              ...prev,
                              [key]: !active
                            }));
                          }}
                          className={`min-h-9 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition-all text-center flex items-center justify-center ${
                            active
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full min-w-0">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Estado de venta
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStatus("PENDIENTE")}
                        className={`min-h-9 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition-all text-center flex items-center justify-center ${
                          status === "PENDIENTE"
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Pendiente
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatus("CERRADO")}
                        className={`min-h-9 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition-all text-center flex items-center justify-center ${
                          status === "CERRADO"
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Confirmado
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Medio de pago
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("CASH")}
                        className={`min-h-9 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition-all text-center flex items-center justify-center ${
                          paymentMethod === "CASH"
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("BANK_TRANSFER")}
                        className={`min-h-9 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition-all text-center flex items-center justify-center ${
                          paymentMethod === "BANK_TRANSFER"
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Transf.
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Ítems de venta
                  </span>

                  <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 w-full min-w-0">
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <div className="flex-1 bg-white rounded-xl relative min-w-0">
                        <ItemSelector
                          value={newItem.itemId}
                          onChange={(val) => setNewItem(prev => ({ ...prev, itemId: val }))}
                          options={businessItems.filter(bi =>
                            items.length === 0 ? true : bi.type === (type === "PRODUCTO" ? "PRODUCT" : "SERVICE")
                          )}
                          placeholder={businessItems.length === 0 ? "Sin productos o servicios disponibles." : "Seleccionar producto / servicio..."}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        disabled={!newItem.itemId}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition active:scale-95 disabled:opacity-40 disabled:bg-neutral-200"
                        title="Agregar ítem"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>

                    {(!newItem.itemId || businessItems.find(i => i.id === newItem.itemId)?.type === "PRODUCT") && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium text-slate-500 px-1">Cantidad</span>
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
                          className="w-full h-11 bg-white border border-slate-200 rounded-xl px-4 text-sm font-semibold outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    )}
                  </div>

                  {formError && (
                    <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      {formError}
                    </div>
                  )}

                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <ItemThumbnail />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 text-sm truncate">{it.name}</div>
                          <div className="flex items-center gap-1.5 text-[10px] font-normal text-slate-400 mt-0.5">
                            {it.qty} unidades x ${formatMoney(it.price)} = ${formatMoney(it.price * it.qty)}
                          </div>
                          {it.optionNames?.map((name) => (
                            <div key={name} className="text-[10px] text-slate-500">{name}</div>
                          ))}
                        </div>

                        {type === "PRODUCTO" && (
                          <div className="flex items-center gap-1.5 bg-slate-50 px-1.5 py-1 rounded-md border border-slate-200">
                            <button onClick={() => updateItemQty(idx, it.qty - 1)} className="text-neutral-500 hover:text-neutral-800 w-4 flex justify-center font-medium text-[13px]">-</button>
                            <span className="text-[11px] font-semibold text-slate-700 w-3 text-center">{it.qty}</span>
                            <button onClick={() => updateItemQty(idx, it.qty + 1)} className="text-neutral-500 hover:text-neutral-800 w-4 flex justify-center font-medium text-[13px]">+</button>
                          </div>
                        )}

                        <button onClick={() => removeItem(idx)} className="p-1.5 text-neutral-300 hover:text-rose-500 transition">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="text-center py-6 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl">
                        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Sin productos en la lista</p>
                      </div>
                    )}
                  </div>
                </div>

                {type === "SERVICIO" && items.length > 0 && (
                  <div className="flex flex-col gap-3 p-4 rounded-2xl border border-emerald-50 bg-emerald-50/20">
                    <div className="rounded-xl bg-white p-3 border border-emerald-100 shadow-sm">
                      <span className="text-xs font-semibold text-emerald-700">
                        Servicio seleccionado
                      </span>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {items[0].name}
                        </span>
                        <span className="shrink-0 text-sm font-bold text-slate-800">
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
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium text-slate-500 px-1">Duración en minutos</span>
                        <input
                          type="number"
                          min="1"
                          value={manualDuration}
                          onChange={(e) => setManualDuration(e.target.value)}
                          className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-emerald-500 transition"
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
                  <SaleTaxPanel
                  mode="create"
                  value={fiscalForm}
                  onChange={setFiscalForm}
                  saleType={type}
                  items={items.map((item) => ({
                    itemId: item.itemId,
                    quantity: normalizeQty(type, item.qty),
                  }))}
                  previewOnly={true}
                  onPreviewChange={setTaxPreview}
                />

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
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{totalLabel}</span>
                  <span className="text-sm font-medium text-slate-800">${formatMoney(totalToDisplay)}</span>
                </div>
              ) : undefined
            }
            plusAriaLabel={expanded ? "Cancelar venta" : "Nueva venta"}
            submitAriaLabel={expanded ? "Guardar venta" : "Buscar ventas"}
          />
        </div>
      </div>
      {customizing && (
        <ProductOptionSelector
          item={customizing.item}
          quantity={customizing.quantity}
          onClose={() => setCustomizing(null)}
          onConfirm={({ optionSelections, optionNames, unitPrice }) => {
            setItems((current) => [
              ...current,
              {
                itemId: customizing.item.id,
                qty: customizing.quantity,
                name: customizing.item.name,
                price: unitPrice,
                durationMin: customizing.item.durationMinutes,
                optionSelections,
                optionNames,
              },
            ]);
            setNewItem({ itemId: "", qty: 1 });
            setCustomizing(null);
          }}
        />
      )}
    </div>
  );
}
