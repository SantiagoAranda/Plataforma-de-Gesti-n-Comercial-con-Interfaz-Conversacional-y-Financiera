"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { Building2, FileText, ShoppingBag, Trash2, Plus, User, X } from "lucide-react";
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
  saleFiscalStateFromSale,
  type SaleFiscalFormState,
} from "@/src/components/sales/SaleTaxPanel";
import { COLOMBIAN_MUNICIPALITIES } from "@/src/constants/colombianMunicipalities";
import { api } from "@/src/lib/api";
import { formatLocalDateTimeValue, parseLocalDateTimeParts } from "@/src/lib/datetime";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";


type EditableItem = {
  itemId: string;
  qty: number;
  name: string;
  price: number;
  saleConcept?: SaleFiscalFormState["saleConcept"] | null;
  durationMin?: number | null;
  optionSelections?: OptionSelection[];
  optionNames?: string[];
  key?: string;
  orderItemId?: string;
  excludedOptionalIngredientIds?: string[];
};

type BusinessItem = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE";
  inventoryMode?: "NONE" | "SIMPLE" | "RECIPE_BASED" | string | null;
  currentStock?: number | string | null;
  durationMinutes?: number | null;
  saleConcept?: SaleFiscalFormState["saleConcept"] | null;
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

function panelInputClass() {
  return "h-11 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500";
}

function segmentClass(active: boolean) {
  return active
    ? "border-white bg-white text-slate-950 shadow-sm"
    : "border-transparent text-slate-500 hover:text-slate-800";
}

function chipClass(active: boolean) {
  return active
    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
    : "border-emerald-200 bg-white text-slate-700 hover:border-emerald-400";
}

const SALE_CONCEPT_PRIORITY: NonNullable<SaleFiscalFormState["saleConcept"]>[] = [
  "SERVICES",
  "HONORARIOS",
  "ARRENDAMIENTOS",
  "FOOD_BEVERAGES",
  "GOODS",
  "OTHER",
];

function fallbackConceptForType(type: BusinessItem["type"]): SaleFiscalFormState["saleConcept"] {
  return type === "SERVICE" ? "SERVICES" : "GOODS";
}

function deriveSaleConceptFromItems(items: EditableItem[], saleType: Sale["type"]) {
  const concepts = items
    .map((item) => item.saleConcept)
    .filter(Boolean) as NonNullable<SaleFiscalFormState["saleConcept"]>[];
  if (concepts.length === 0) return saleType === "SERVICIO" ? "SERVICES" : "GOODS";
  return SALE_CONCEPT_PRIORITY.find((concept) => concepts.includes(concept)) ?? concepts[0];
}

export default function SalesChatComposer({
  mode = "create",
  sale = null,
  expanded,
  onOpenComposer,
  onCancelComposer,
  searchValue = "",
  onSearchChange = () => {},
  onSave,
  taxSettingsEnabled: propEnabled,
}: {
  mode?: "create" | "edit" | "readonly";
  sale?: Sale | null;
  expanded: boolean;
  onOpenComposer?: () => void;
  onCancelComposer: () => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  onSave: (data: any) => Promise<void> | void;
  taxSettingsEnabled?: boolean;
}) {
  const { taxSettingsEnabled: hookEnabled } = useTaxSettings();
  const taxSettingsEnabled = propEnabled ?? hookEnabled;
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
  const [customizing, setCustomizing] = useState<{
    item: BusinessItem;
    quantity: number;
    editIdx?: number;
    initialSelections?: OptionSelection[];
  } | null>(null);

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
    if ((mode === "edit" || mode === "readonly") && sale && expanded) {
      setFiscalForm(saleFiscalStateFromSale(sale));
      
      const rawPhone = (sale.customerWhatsapp ?? "").replace(/\D/g, "");
      if (rawPhone.length > 10) {
        setCountryCode(rawPhone.slice(0, rawPhone.length - 10));
        setPhoneNumber(rawPhone.slice(-10));
      } else {
        setCountryCode("57");
        setPhoneNumber(rawPhone);
      }
      
      setType(sale.type);
      setStatus(sale.status === "CERRADO" ? "CERRADO" : "PENDIENTE");
      setPaymentMethod(sale.paymentMethod ?? "CASH");
      
      setItems(
        sale.items.map((it, idx) => ({
          itemId: it.itemId || "",
          qty: it.qty,
          name: it.name,
          price: it.unitPrice ?? (it.price / it.qty),
          saleConcept: sale.fiscalContext?.saleConcept ?? null,
          durationMin: it.durationMin,
          optionSelections: (it.options ?? [])
            .filter((option) => option.groupId && option.optionId && option.action)
            .map((option) => ({
              groupId: option.groupId!,
              optionId: option.optionId!,
              action: option.action!,
            })),
          optionNames: (it.options ?? []).map(
            (option) => `${option.groupTitle}: ${option.optionName}`
          ),
          excludedOptionalIngredientIds: it.excludedOptionalIngredientIds ?? [],
        }))
      );
      
      const parts = parseLocalDateTimeParts(sale.scheduledAt);
      if (sale.type === "SERVICIO" && parts) {
        setScheduledDate(parts.date);
        const [h, m] = parts.time.split(":").map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          setSelectedStartMinute(h * 60 + m);
        }
      } else {
        setScheduledDate(null);
        setSelectedStartMinute(null);
      }
    } else if (mode === "create" && !expanded) {
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
  }, [expanded, sale?.id, mode]);

  useEffect(() => {
    if (!newItem.itemId) return;
    const selectedBi = businessItems.find(i => i.id === newItem.itemId);
    if (!selectedBi) return;
    
    setFiscalForm(prev => ({
      ...prev,
      saleConcept: selectedBi.saleConcept ?? fallbackConceptForType(selectedBi.type)
    }));
  }, [newItem.itemId, businessItems]);

  useEffect(() => {
    if (items.length === 0) return;
    const derivedConcept = deriveSaleConceptFromItems(items, type);
    setFiscalForm(prev =>
      prev.saleConcept === derivedConcept ? prev : { ...prev, saleConcept: derivedConcept }
    );
  }, [items, type]);

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
    { key: "buyerType", label: "Jurídica" },
    { key: "buyerIsRetenedor", label: "Agente Retención" },
    { key: "buyerIsGranContribuyente", label: "Gran Contrib." },
    { key: "buyerIsAutorretenedor", label: "Autorretenedor" },
    { key: "buyerIsRegimenSimple", label: "Régimen Simple" },
    { key: "buyerRequiresElectronicInvoice", label: "Facturación Electrónica" },
  ] as const;

  const visibleResponsibilities = responsibilities.filter(
    ({ key }) => key !== "buyerIsRetenedor" && key !== "buyerRequiresElectronicInvoice"
  );

  const buyerFiscalContext = useMemo<BuyerFiscalContext>(
    () => buildBuyerFiscalContext(fiscalForm),
    [fiscalForm],
  );

  const updateItemQty = (idx: number, qty: number) => {
    const current = items[idx];
    if (!current) return;
    const nextQty = normalizeQty(type, qty);
    const businessItem = businessItems.find((item) => item.id === current.itemId);
    if (type === "PRODUCTO" && businessItem?.inventoryMode === "SIMPLE") {
      const available = Number(businessItem.currentStock ?? 0);
      const otherQty = items.reduce(
        (acc, item, itemIdx) => acc + (itemIdx !== idx && item.itemId === current.itemId ? item.qty : 0),
        0
      );
      if (otherQty + nextQty > available) {
        toast.error(`Stock insuficiente para ${current.name}. Disponible: ${available}.`);
        return;
      }
    }
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, qty: nextQty } : it))
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
          saleConcept: bi.saleConcept ?? fallbackConceptForType(bi.type),
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
      if (mode === "edit") {
        const updated: Sale = {
          ...sale!,
          customerName: cleanedName || "Consumidor final",
          customerWhatsapp: cleanedWhatsapp ?? null,
          type,
          status: status as any,
          paymentMethod: paymentMethod || "CASH",
          fiscalContext: buyerFiscalContext,
          items: items.map(item => ({
            orderItemId: item.orderItemId,
            itemId: item.itemId,
            qty: item.qty,
            name: item.name,
            unitPrice: item.price,
            price: item.price * item.qty,
            durationMin: item.durationMin,
            optionSelections: item.optionSelections,
            excludedOptionalIngredientIds: item.excludedOptionalIngredientIds ?? [],
          })),
          scheduledAt,
        };
        await onSave(updated);
      } else {
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isMounted.current && expanded) {
        setIsSubmitting(false);
      }
    }
  };

  const renderFormBody = () => {
    const isReadonly = mode === "readonly";
    return (
      <>
        {/* 2. Switch Persona / Empresa */}
        {taxSettingsEnabled && (
          <div className="grid h-10 grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              disabled={isReadonly}
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
                  buyerRequiresElectronicInvoice: false,
                }));
              }}
              className={`flex h-8 items-center justify-center gap-2 rounded-lg border text-xs font-bold transition ${segmentClass(fiscalForm.buyerType === "NATURAL")}`}
            >
              <User className="h-3.5 w-3.5" />
              Persona
            </button>
            <button
              type="button"
              disabled={isReadonly}
              onClick={() => {
                setFiscalForm(prev => ({
                  ...prev,
                  buyerType: "JURIDICA" as const,
                  buyerDocumentType: "NIT" as const,
                  buyerIsIvaResponsable: true,
                  buyerIsRetenedor: false,
                  buyerRequiresElectronicInvoice: false,
                }));
              }}
              className={`flex h-8 items-center justify-center gap-2 rounded-lg border text-xs font-bold transition ${segmentClass(fiscalForm.buyerType === "JURIDICA")}`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Empresa
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <input
              value={fiscalForm.buyerName}
              disabled={isReadonly}
              onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerName: e.target.value }))}
              placeholder={fiscalForm.buyerType === "JURIDICA" ? "Razón social" : "Nombre del cliente"}
              className={panelInputClass()}
            />
          </div>

          <PhoneSelector
            countryCode={countryCode}
            onCountryCodeChange={setCountryCode}
            phoneNumber={phoneNumber}
            onPhoneNumberChange={setPhoneNumber}
            disabled={isReadonly}
          />

          {taxSettingsEnabled && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                <FileText className="h-4 w-4" />
                {fiscalForm.buyerType === "JURIDICA" ? "Datos del comprador" : "Facturación Electrónica"}
              </div>
              <div className="grid grid-cols-2 gap-2 w-full min-w-0">
                <div className="hidden min-w-0">
                <select
                  value={fiscalForm.buyerDocumentType}
                  disabled={isReadonly}
                  onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerDocumentType: e.target.value as any }))}
                  className="h-11 w-full rounded-xl border border-emerald-200 bg-white px-2.5 text-xs outline-none focus:border-emerald-500 transition text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
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
                  disabled={isReadonly}
                  onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerDocumentNumber: e.target.value }))}
                  placeholder={fiscalForm.buyerType === "JURIDICA" ? "NIT" : "Cédula"}
                  className="h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-slate-400 transition disabled:bg-slate-50 disabled:text-slate-500"
                />
                </div>
              <div className="min-w-0">
              <input
                type="email"
                value={fiscalForm.buyerEmail}
                disabled={isReadonly}
                onChange={(e) => setFiscalForm(prev => ({ ...prev, buyerEmail: e.target.value }))}
                placeholder="Correo"
                className="h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-slate-400 transition disabled:bg-slate-50 disabled:text-slate-500"
              />
              </div>
              </div>
              {fiscalForm.buyerType === "JURIDICA" && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {visibleResponsibilities.map(({ key, label }) => {
                    const active =
                      key === "buyerType"
                        ? fiscalForm.buyerType === "JURIDICA"
                        : Boolean(fiscalForm[key]);
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={isReadonly}
                        onClick={() => {
                          if (key === "buyerType") {
                            setFiscalForm(prev => ({
                              ...prev,
                              buyerType: active ? "NATURAL" : "JURIDICA",
                              buyerDocumentType: active ? "CC" : "NIT",
                              buyerIsIvaResponsable: active ? false : true,
                              buyerIsRetenedor: active ? false : prev.buyerIsRetenedor,
                              buyerIsGranContribuyente: active ? false : prev.buyerIsGranContribuyente,
                              buyerIsAutorretenedor: active ? false : prev.buyerIsAutorretenedor,
                              buyerIsRegimenSimple: active ? false : prev.buyerIsRegimenSimple,
                              buyerRequiresElectronicInvoice: active ? false : prev.buyerRequiresElectronicInvoice,
                            }));
                            return;
                          }
                          setFiscalForm(prev => ({
                            ...prev,
                            [key]: !active
                          }));
                        }}
                        className={`flex h-8 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition ${
                          active
                            ? "border-emerald-600 bg-white text-emerald-800 shadow-sm"
                            : "border-emerald-300 bg-white/70 text-emerald-900 hover:border-emerald-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {taxSettingsEnabled && fiscalForm.buyerType === "JURIDICA" && (
        <>
        <div className="space-y-1.5 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <span className="sr-only">
            Datos fiscales de la venta
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={fiscalForm.fiscalMunicipalityCode}
              disabled={isReadonly}
              onChange={(e) => setFiscalForm(prev => ({ ...prev, fiscalMunicipalityCode: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 transition disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Municipio ICA</option>
              {COLOMBIAN_MUNICIPALITIES.map((municipality) => (
                <option key={municipality.code} value={municipality.code}>
                  {municipality.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ReteICA / ICA retenido (por mil)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Defecto (RUT)"
                value={fiscalForm.reteIcaRateOverride !== undefined ? fiscalForm.reteIcaRateOverride : ""}
                disabled={isReadonly}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                  setFiscalForm(prev => ({ ...prev, reteIcaRateOverride: val }));
                }}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 placeholder:text-slate-400 transition disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            {taxPreview && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Régimen Simple</span>
                <div className={`h-11 rounded-xl border flex items-center justify-center text-xs font-medium ${
                  taxPreview.sellerIsSimpleRegime 
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800" 
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}>
                  {taxPreview.sellerIsSimpleRegime ? "RST (47)" : "Ordinario"}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="hidden">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Contexto fiscal del comprador
          </span>
          <div className="grid grid-cols-2 gap-2">
            {visibleResponsibilities.map(({ key, label }) => {
              const active =
                key === "buyerType"
                  ? fiscalForm.buyerType === "JURIDICA"
                  : Boolean(fiscalForm[key]);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isReadonly}
                  onClick={() => {
                    if (key === "buyerType") {
                      setFiscalForm(prev => ({
                        ...prev,
                        buyerType: active ? "NATURAL" : "JURIDICA",
                        buyerDocumentType: active ? "CC" : "NIT",
                        buyerIsIvaResponsable: active ? false : true,
                        buyerIsRetenedor: active ? false : prev.buyerIsRetenedor,
                        buyerIsGranContribuyente: active ? false : prev.buyerIsGranContribuyente,
                        buyerIsAutorretenedor: active ? false : prev.buyerIsAutorretenedor,
                        buyerIsRegimenSimple: active ? false : prev.buyerIsRegimenSimple,
                        buyerRequiresElectronicInvoice: active ? false : prev.buyerRequiresElectronicInvoice,
                      }));
                      return;
                    }
                    setFiscalForm(prev => ({
                      ...prev,
                      [key]: !active
                    }));
                  }}
                  className={`min-h-9 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold transition-all text-center flex items-center justify-center ${chipClass(active)}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        </>
        )}

        <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] gap-2 w-full min-w-0">
          <div>
            <span className="sr-only">
              Estado de venta
            </span>
            <div className="grid h-11 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                disabled={isReadonly}
                onClick={() => setStatus("PENDIENTE")}
                className={`flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-all text-center ${
                  status === "PENDIENTE"
                    ? "border-transparent bg-white text-slate-950 shadow-sm disabled:opacity-90"
                    : "border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-60"
                }`}
              >
                Pendiente
              </button>
              <button
                type="button"
                disabled={isReadonly}
                onClick={() => setStatus("CERRADO")}
                className={`flex h-9 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition-all text-center ${
                  status === "CERRADO"
                    ? "border-transparent bg-white text-slate-950 shadow-sm disabled:opacity-90"
                    : "border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-60"
                }`}
              >
                Confirmado
              </button>
            </div>
          </div>

          <div>
            <span className="sr-only">
              Medio de pago
            </span>
            <div className="grid h-11 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                disabled={isReadonly}
                onClick={() => setPaymentMethod("CASH")}
                className={`flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-all text-center ${
                  paymentMethod === "CASH"
                    ? "border-transparent bg-emerald-500 text-white shadow-sm disabled:opacity-90"
                    : "border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-60"
                }`}
              >
                Efectivo
              </button>
              <button
                type="button"
                disabled={isReadonly}
                onClick={() => setPaymentMethod("BANK_TRANSFER")}
                className={`flex h-9 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition-all text-center ${
                  paymentMethod === "BANK_TRANSFER"
                    ? "border-transparent bg-emerald-500 text-white shadow-sm disabled:opacity-90"
                    : "border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-60"
                }`}
              >
                Transf.
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Ítems de venta
          </span>

          {!isReadonly && (
            <div className="space-y-2 w-full min-w-0">
              <div className="flex items-center gap-2 w-full min-w-0">
                <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50 relative min-w-0">
                  <ItemSelector
                    value={newItem.itemId}
                    onChange={(val) => setNewItem(prev => ({ ...prev, itemId: val }))}
                    options={businessItems.filter(bi =>
                      items.length === 0 ? true : bi.type === (type === "PRODUCTO" ? "PRODUCT" : "SERVICE")
                    )}
                    placeholder={businessItems.length === 0 ? "Sin ítems disponibles." : "Buscar ítem..."}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!newItem.itemId}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition active:scale-95 disabled:opacity-40 disabled:bg-neutral-200"
                  title="Agregar ítem"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

            </div>
          )}

          {formError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {formError}
            </div>
          )}

          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm truncate">{it.name}</div>
                  <div className="flex items-center gap-1.5 text-[10px] font-normal text-slate-500 mt-0.5">
                    {it.qty} unidades x ${formatMoney(it.price)} = ${formatMoney(it.price * it.qty)}
                  </div>
                  {it.optionNames?.map((name) => (
                    <div key={name} className="text-[10px] text-slate-500">{name}</div>
                  ))}
                </div>

                {((businessItems.find((item) => item.id === it.itemId)?.optionGroups?.length ?? 0) > 0) && !isReadonly && (
                  <button
                    type="button"
                    onClick={() => {
                      const businessItem = businessItems.find((item) => item.id === it.itemId);
                      if (businessItem) setCustomizing({
                        item: businessItem,
                        quantity: it.qty,
                        editIdx: idx,
                        initialSelections: it.optionSelections,
                      });
                    }}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition mr-2"
                  >
                    Editar
                  </button>
                )}

                {!isReadonly ? (
                  <div className="flex items-center gap-2 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => updateItemQty(idx, it.qty - 1)}
                      className="flex w-4 justify-center text-sm font-medium text-slate-400 transition hover:text-slate-700"
                      aria-label={`Restar ${it.name}`}
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-sm font-medium tabular-nums text-slate-800">{it.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateItemQty(idx, it.qty + 1)}
                      className="flex w-4 justify-center text-sm font-medium text-slate-400 transition hover:text-slate-700"
                      aria-label={`Sumar ${it.name}`}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="text-right text-xs text-slate-500">
                    <div>Cant. {it.qty}</div>
                    <div className="mt-0.5 text-slate-700">${formatMoney(it.price * it.qty)}</div>
                  </div>
                )}

                {!isReadonly && (
                  <button onClick={() => removeItem(idx)} className="p-1.5 text-rose-300 hover:text-rose-500 transition">
                    <Trash2 size={14} />
                  </button>
                )}
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
              disabled={isReadonly}
              availabilitySaleId={mode === "edit" ? sale?.id : undefined}
              durationMin={items[0].durationMin || Number(manualDuration) || undefined}
              onChange={({ date, startMinute }) => {
                setScheduledDate(date);
                setSelectedStartMinute(startMinute);
              }}
            />

            {!isReadonly && !items[0]?.durationMin && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-slate-500 px-1">Duración en minutos</span>
                <input
                  type="number"
                  min="1"
                  disabled={isReadonly}
                  value={manualDuration}
                  onChange={(e) => setManualDuration(e.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-emerald-500 transition disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            )}
            {!isReadonly && items[0]?.durationMin && (
              <p className="px-1 text-[11px] font-semibold text-emerald-700">
                Duración: {items[0].durationMin} min
              </p>
            )}
          </div>
        )}

        {(taxSettingsEnabled || Boolean(sale?.fiscalSummary)) && (
          <SaleTaxPanel
            mode={isReadonly ? "readonly" : "create"}
            value={fiscalForm}
            onChange={setFiscalForm}
            saleType={type}
            items={items.map((item) => ({
              itemId: item.itemId,
              quantity: normalizeQty(type, item.qty),
            }))}
            previewOnly={true}
            onPreviewChange={setTaxPreview}
            fiscalSummary={sale?.fiscalSummary}
            taxLines={sale?.taxLines}
          />
        )}

        <div className="h-4" />
      </>
    );
  };

  if (mode === "readonly") {
    return (
      <div className="space-y-4 rounded-[28px] bg-slate-50 p-4">
        {renderFormBody()}
      </div>
    );
  }

  if (mode === "edit") {
    if (!expanded) return null;
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-50 px-4 py-6">
        <div className="w-full max-w-[344px] flex max-h-[92vh] flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl relative animate-in slide-in-from-bottom-full duration-300">
          <div className="px-6 pb-5 pt-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex flex-col">
              <h2 className="font-semibold text-slate-950 text-xl">Editar Venta</h2>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">EDICIÓN MANUAL</span>
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

          <div className="flex-1 overflow-y-auto bg-white px-5 py-5 space-y-4">
            {renderFormBody()}
          </div>

          {/* Bottom Bar for Modal */}
          <div className="flex h-[76px] shrink-0 items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-5">
              <button
                type="button"
                onClick={onCancelComposer}
                className="flex h-9 w-7 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600"
                aria-label="Cancelar"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">TOTAL VENTA</span>
                <span className="text-lg font-semibold text-slate-950">${formatMoney(totalToDisplay)}</span>
              </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={items.length === 0 || isSubmitting}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                  aria-label="Guardar cambios"
                >
                  <ShoppingBag className="h-5 w-5" />
                </button>
          </div>
        </div>

        {customizing && (
          <ProductOptionSelector
            item={customizing.item}
            quantity={customizing.quantity}
            initialSelections={customizing.initialSelections}
            onClose={() => setCustomizing(null)}
            onConfirm={({ optionSelections, optionNames, unitPrice }) => {
              if (customizing.editIdx !== undefined) {
                setItems((current) =>
                  current.map((line, idx) =>
                    idx === customizing.editIdx
                      ? { ...line, optionSelections, optionNames, price: unitPrice }
                      : line
                  )
                );
              } else {
                setItems((current) => [
                  ...current,
                  {
                    itemId: customizing.item.id,
                    qty: customizing.quantity,
                    name: customizing.item.name,
                    price: unitPrice,
                    saleConcept: customizing.item.saleConcept ?? fallbackConceptForType(customizing.item.type),
                    durationMin: customizing.item.durationMinutes,
                    optionSelections,
                    optionNames,
                  },
                ]);
              }
              setNewItem({ itemId: "", qty: 1 });
              setCustomizing(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={expanded ? "fixed inset-0 z-30 flex items-center justify-center bg-slate-50 px-4 py-6" : "fixed inset-x-0 bottom-0 z-30 bg-white px-4 pt-2 lg:left-[408px] lg:right-0"}
      style={expanded ? undefined : { paddingBottom: "calc(8px + env(safe-area-inset-bottom, 12px))" }}
    >
      <div className={expanded ? "mx-auto w-full max-w-[344px]" : "mx-auto w-full max-w-3xl"}>
        <div className="relative">
          {expanded && (
            <div className="pointer-events-auto mx-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl">
              <div className="px-6 pb-5 pt-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex flex-col">
                  <h2 className="font-semibold text-slate-950 text-xl">Nueva Venta</h2>
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

              <div className="flex-1 overflow-y-auto bg-white px-5 py-5 space-y-4">
                {renderFormBody()}
              </div>
              <div className="flex h-[76px] shrink-0 items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-5">
                <button
                  type="button"
                  onClick={onCancelComposer}
                  className="flex h-9 w-7 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600"
                  aria-label="Cancelar venta"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">TOTAL VENTA</span>
                  <div className="text-lg font-semibold leading-tight text-slate-950">${formatMoney(totalToDisplay)}</div>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={items.length === 0 || isSubmitting}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                  aria-label="Guardar venta"
                >
                  <ShoppingBag className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Bottom Bar */}
          {!expanded && (
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
          )}
        </div>
      </div>
      {customizing && (
        <ProductOptionSelector
          item={customizing.item}
          quantity={customizing.quantity}
          initialSelections={customizing.initialSelections}
          onClose={() => setCustomizing(null)}
          onConfirm={({ optionSelections, optionNames, unitPrice }) => {
            if (customizing.editIdx !== undefined) {
              setItems((current) =>
                current.map((line, idx) =>
                  idx === customizing.editIdx
                    ? { ...line, optionSelections, optionNames, price: unitPrice }
                    : line
                )
              );
            } else {
              setItems((current) => [
                ...current,
                {
                  itemId: customizing.item.id,
                  qty: customizing.quantity,
                  name: customizing.item.name,
                  price: unitPrice,
                  saleConcept: customizing.item.saleConcept ?? fallbackConceptForType(customizing.item.type),
                  durationMin: customizing.item.durationMinutes,
                  optionSelections,
                  optionNames,
                },
              ]);
            }
            setNewItem({ itemId: "", qty: 1 });
            setCustomizing(null);
          }}
        />
      )}
    </div>
  );
}
