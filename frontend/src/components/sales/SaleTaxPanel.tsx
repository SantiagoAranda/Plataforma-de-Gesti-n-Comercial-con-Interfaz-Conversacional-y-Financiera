"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  getTaxPreview,
  type BuyerFiscalContext,
  type TaxPreviewLine,
  type TaxPreviewResponse,
} from "@/src/lib/tax/api";
import type { Sale, SaleFiscalSummary } from "@/src/types/sales";
import { COLOMBIAN_MUNICIPALITIES } from "@/src/constants/colombianMunicipalities";

export type SaleFiscalFormState = {
  buyerType: "NATURAL" | "JURIDICA";
  buyerDocumentType: "CC" | "NIT" | "CE" | "PASAPORTE" | "TI";
  buyerDocumentNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerIsIvaResponsable: boolean;
  buyerIsRetenedor: boolean;
  buyerIsGranContribuyente: boolean;
  buyerIsAutorretenedor: boolean;
  buyerIsRegimenSimple: boolean;
  buyerRequiresElectronicInvoice: boolean;
  fiscalMunicipalityCode: string;
  saleConcept: BuyerFiscalContext["saleConcept"];
  reteIcaRateOverride?: number;
};

export const DEFAULT_SALE_FISCAL_FORM: SaleFiscalFormState = {
  buyerType: "NATURAL",
  buyerDocumentType: "CC",
  buyerDocumentNumber: "",
  buyerName: "",
  buyerEmail: "",
  buyerIsIvaResponsable: false,
  buyerIsRetenedor: false,
  buyerIsGranContribuyente: false,
  buyerIsAutorretenedor: false,
  buyerIsRegimenSimple: false,
  buyerRequiresElectronicInvoice: false,
  fiscalMunicipalityCode: "",
  saleConcept: "GOODS",
  reteIcaRateOverride: undefined,
};

export function buildBuyerFiscalContext(state: SaleFiscalFormState): BuyerFiscalContext {
  return {
    buyerType: state.buyerType,
    buyerName: state.buyerName.trim() || null,
    buyerDocumentType: state.buyerDocumentType,
    buyerDocumentNumber: state.buyerDocumentNumber.trim() || null,
    buyerEmail: state.buyerEmail.trim() || null,
    buyerIsIvaResponsable: state.buyerIsIvaResponsable,
    buyerIsRetenedor: state.buyerIsRetenedor,
    buyerIsGranContribuyente: state.buyerIsGranContribuyente,
    buyerIsAutorretenedor: state.buyerIsAutorretenedor,
    buyerIsRegimenSimple: state.buyerIsRegimenSimple,
    buyerRequiresElectronicInvoice: state.buyerRequiresElectronicInvoice,
    fiscalMunicipalityCode: state.fiscalMunicipalityCode || null,
    saleConcept: state.saleConcept,
    reteIcaRateOverride: state.reteIcaRateOverride,
  };
}

export function saleFiscalStateFromSale(sale: Sale | null): SaleFiscalFormState {
  const context = sale?.fiscalContext;
  if (context) {
    return {
      ...DEFAULT_SALE_FISCAL_FORM,
      buyerType: context.buyerType ?? DEFAULT_SALE_FISCAL_FORM.buyerType,
      buyerDocumentType:
        context.buyerDocumentType ?? DEFAULT_SALE_FISCAL_FORM.buyerDocumentType,
      buyerDocumentNumber: context.buyerDocumentNumber ?? "",
      buyerName: context.buyerName ?? sale?.customerName ?? "",
      buyerEmail: context.buyerEmail ?? "",
      buyerIsIvaResponsable: Boolean(context.buyerIsIvaResponsable),
      buyerIsRetenedor: Boolean(context.buyerIsRetenedor),
      buyerIsGranContribuyente: Boolean(context.buyerIsGranContribuyente),
      buyerIsAutorretenedor: Boolean(context.buyerIsAutorretenedor),
      buyerIsRegimenSimple: Boolean(context.buyerIsRegimenSimple),
      buyerRequiresElectronicInvoice: Boolean(context.buyerRequiresElectronicInvoice),
      fiscalMunicipalityCode: context.fiscalMunicipalityCode ?? "",
      saleConcept:
        context.saleConcept ??
        (sale?.type === "SERVICIO" ? "SERVICES" : "GOODS"),
      reteIcaRateOverride:
        context.reteIcaRateOverride ?? context.icaRateOverride ?? undefined,
    };
  }

  const isCompany = (sale?.customerName?.length ?? 0) > 20;
  return {
    ...DEFAULT_SALE_FISCAL_FORM,
    buyerType: isCompany ? "JURIDICA" : "NATURAL",
    buyerDocumentType: isCompany ? "NIT" : "CC",
    buyerName: sale?.customerName ?? "",
    saleConcept: sale?.type === "SERVICIO" ? "SERVICES" : "GOODS",
  };
}

function formatCop(n: number) {
  return (n ?? 0).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatTaxRate(taxType: TaxPreviewLine["taxType"], rate: number) {
  return taxType === "RETEICA"
    ? `${(rate * 1000).toFixed(2)}‰`
    : `${(rate * 100).toFixed(2)}%`;
}

function lineStatus(line: TaxPreviewLine) {
  if (!line.applied) return "No aplica";
  if (line.direction === "CHARGE") return "Cobrado";
  if (line.direction === "WITHHOLD") return "Retenido";
  return "Autorretencion";
}

function findTaxLine(lines: TaxPreviewLine[] | undefined, taxType: TaxPreviewLine["taxType"]) {
  return lines?.find((line) => line.taxType === taxType && line.applied) ??
    lines?.find((line) => line.taxType === taxType);
}

function taxValidationDescription(taxType: TaxPreviewLine["taxType"]) {
  if (taxType === "RETEFUENTE") {
    return "Depende del declarante del vendedor y del concepto fiscal de la venta.";
  }
  if (taxType === "RETEICA") {
    return "Depende del municipio, actividad económica y comprador retenedor.";
  }
  if (taxType === "RETEIVA") {
    return "Aplica según responsabilidad IVA y comprador retenedor.";
  }
  if (taxType === "AUTORRETENCION") {
    return "Aplica según perfil del vendedor/autorretenedor.";
  }
  return "Validación tributaria de la venta.";
}

function RetentionValidationCard({
  label,
  line,
}: {
  label: string;
  line?: TaxPreviewLine;
}) {
  const applied = Boolean(line?.applied);
  const rate = line ? formatTaxRate(line.taxType, Number(line.rate)) : "0%";
  const amount = line ? Number(line.taxAmount) : 0;

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900">{label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                applied
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {applied ? "Aplica" : "No aplica"}
            </span>
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500">
              {rate}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            {line ? taxValidationDescription(line.taxType) : "No calculado"}
          </p>
          {!applied && line?.reason ? (
            <p className="mt-1 text-[10px] text-slate-400">{line.reason}</p>
          ) : null}
        </div>
        <span className="shrink-0 font-bold tabular-nums text-slate-900">
          ${formatCop(amount)}
        </span>
      </div>
    </div>
  );
}

function fiscalChipClass(active: boolean, readonly: boolean) {
  if (active) return "border-emerald-500 bg-emerald-50 text-emerald-800";
  return readonly
    ? "border-slate-100 bg-slate-50 text-slate-400"
    : "border-emerald-200 bg-white text-slate-700 hover:border-emerald-400";
}

const SALE_CONCEPT_LABELS: Record<NonNullable<SaleFiscalFormState["saleConcept"]>, string> = {
  GOODS: "Bienes / Productos",
  SERVICES: "Servicios",
  HONORARIOS: "Honorarios",
  ARRENDAMIENTOS: "Arrendamientos",
  FOOD_BEVERAGES: "Comidas y bebidas",
  OTHER: "Otro",
};

function saleConceptLabel(value?: string | null) {
  return value
    ? SALE_CONCEPT_LABELS[value as NonNullable<SaleFiscalFormState["saleConcept"]>] ?? "No calculado"
    : "No calculado";
}

function summaryToPreview(summary: SaleFiscalSummary, taxLines?: TaxPreviewLine[] | null): TaxPreviewResponse {
  return {
    subtotal: Number(summary.subtotal ?? 0),
    vatTotal: Number(summary.iva ?? 0),
    impoconsumoTotal: Number(summary.impoconsumo ?? 0),
    reteFuenteTotal: Number(summary.reteFuente ?? 0),
    reteIvaTotal: Number(summary.reteIva ?? 0),
    reteIcaTotal: Number(summary.reteIca ?? 0),
    autoRetencionTotal: 0,
    netReceived: Number(summary.netReceived ?? 0),
    taxLines: taxLines ?? [],
    uvtValue: 0,
  };
}

export default function SaleTaxPanel({
  mode,
  value,
  onChange,
  saleType,
  items,
  fiscalSummary,
  taxLines,
  onEditSale,
  className = "",
  previewOnly = false,
  onPreviewChange,
}: {
  mode: "create" | "edit" | "readonly";
  value: SaleFiscalFormState;
  onChange?: (next: SaleFiscalFormState) => void;
  saleType: Sale["type"];
  items: Array<{ itemId?: string; quantity: number }>;
  fiscalSummary?: SaleFiscalSummary | null;
  taxLines?: TaxPreviewLine[] | null;
  onEditSale?: () => void;
  className?: string;
  previewOnly?: boolean;
  onPreviewChange?: (preview: TaxPreviewResponse | null) => void;
}) {
  const readonly = mode === "readonly";
  const [livePreview, setLivePreview] = useState<TaxPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (readonly) {
      return fiscalSummary ? summaryToPreview(fiscalSummary, taxLines) : null;
    }
    return livePreview;
  }, [readonly, fiscalSummary, taxLines, livePreview]);

  useEffect(() => {
    if (readonly) return;
    onPreviewChange?.(preview);
  }, [preview, onPreviewChange, readonly]);

  const update = (patch: Partial<SaleFiscalFormState>) => {
    if (readonly || !onChange) return;
    const next = { ...value, ...patch };
    if (patch.buyerType === "NATURAL") {
      next.buyerDocumentType = "CC";
      next.buyerIsIvaResponsable = false;
      next.buyerIsRetenedor = false;
      next.buyerIsGranContribuyente = false;
      next.buyerIsAutorretenedor = false;
      next.buyerIsRegimenSimple = false;
      next.buyerRequiresElectronicInvoice = false;
    }
    if (patch.buyerType === "JURIDICA") {
      next.buyerDocumentType = "NIT";
      next.buyerIsIvaResponsable = true;
      next.buyerIsRetenedor = false;
      next.buyerRequiresElectronicInvoice = false;
    }
    onChange(next);
  };

  const context = useMemo(() => buildBuyerFiscalContext(value), [value]);

  useEffect(() => {
    if (readonly) {
      setError(null);
      setLoading(false);
      return;
    }

    if (items.length === 0) {
      setLivePreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getTaxPreview({
          buyerType: context.buyerType,
          buyerName: context.buyerName || undefined,
          buyerDocumentType: context.buyerDocumentType,
          buyerDocumentNumber: context.buyerDocumentNumber || undefined,
          buyerEmail: context.buyerEmail || undefined,
          buyerIsIvaResponsable: context.buyerIsIvaResponsable,
          buyerIsRetenedor: context.buyerIsRetenedor,
          buyerIsGranContribuyente: context.buyerIsGranContribuyente,
          buyerIsAutorretenedor: context.buyerIsAutorretenedor,
          buyerIsRegimenSimple: context.buyerIsRegimenSimple,
          buyerRequiresElectronicInvoice: context.buyerRequiresElectronicInvoice,
          fiscalMunicipalityCode: context.fiscalMunicipalityCode || undefined,
          reteIcaRateOverride: context.reteIcaRateOverride,
          saleConcept: context.saleConcept,
          cartItems: items
            .filter((item): item is { itemId: string; quantity: number } => Boolean(item.itemId))
            .map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
        });
        setLivePreview(data);
      } catch (err: any) {
        setError(err.message || "No se pudo calcular la liquidacion tributaria.");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [context, items, readonly]);

  const chargedTotal = preview
    ? Number(preview.vatTotal) + Number(preview.impoconsumoTotal)
    : 0;
  const withheldTotal = preview
    ? Number(preview.reteFuenteTotal) +
      Number(preview.reteIvaTotal) +
      Number(preview.reteIcaTotal)
    : 0;

  const missingReadonlyFiscal = readonly && !fiscalSummary;
  const effectiveSaleConcept = preview?.saleConceptUsed ?? value.saleConcept;
  const mixedConcepts = Boolean(preview?.hasMixedConcepts || preview?.mixedConceptsWarning);

  return (
    <section className={`space-y-3 ${className}`}>
      {!previewOnly && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Liquidacion e impuestos
            </h3>
            <p className="mt-1 text-[11px] text-slate-400">
              {readonly
                ? "Datos fiscales y resultado de la venta."
                : "Completa los datos fiscales y revisa el calculo en vivo."}
            </p>
          </div>
        </div>

        {missingReadonlyFiscal ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">Faltan datos fiscales para liquidar esta venta.</p>
            {onEditSale && (
              <button
                type="button"
                onClick={onEditSale}
                className="mt-3 rounded-full bg-amber-600 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white"
              >
                Editar venta
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                disabled={readonly}
                onClick={() => update({ buyerType: "NATURAL" })}
                className={`h-9 rounded-xl text-xs font-semibold transition ${
                  value.buyerType === "NATURAL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                } disabled:cursor-default`}
              >
                Persona
              </button>
              <button
                type="button"
                disabled={readonly}
                onClick={() => update({ buyerType: "JURIDICA" })}
                className={`h-9 rounded-xl text-xs font-semibold transition ${
                  value.buyerType === "JURIDICA" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                } disabled:cursor-default`}
              >
                Empresa
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              <input
                value={value.buyerName}
                disabled={readonly}
                onChange={(event) => update({ buyerName: event.target.value })}
                placeholder={value.buyerType === "JURIDICA" ? "Razon social" : "Nombre del cliente"}
                className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={value.buyerDocumentType}
                  disabled={readonly}
                  onChange={(event) =>
                    update({ buyerDocumentType: event.target.value as SaleFiscalFormState["buyerDocumentType"] })
                  }
                  className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-50"
                >
                  {value.buyerType === "JURIDICA" ? (
                    <option value="NIT">NIT</option>
                  ) : (
                    <>
                      <option value="CC">Cedula</option>
                      <option value="CE">Cedula extranjeria</option>
                      <option value="PASAPORTE">Pasaporte</option>
                      <option value="TI">Tarjeta identidad</option>
                    </>
                  )}
                </select>
                <input
                  value={value.buyerDocumentNumber}
                  disabled={readonly}
                  onChange={(event) => update({ buyerDocumentNumber: event.target.value })}
                  placeholder="Numero documento"
                  className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-50"
                />
              </div>
              <input
                type="email"
                value={value.buyerEmail}
                disabled={readonly}
                onChange={(event) => update({ buyerEmail: event.target.value })}
                placeholder="Correo"
                className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-50"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Concepto fiscal
                      </span>
                      <div className="mt-1 text-xs font-bold text-slate-900">
                        {saleConceptLabel(effectiveSaleConcept)}
                      </div>
                      <p className="mt-1 text-[10px] leading-snug text-slate-500">
                        Calculado automaticamente segun los items agregados.
                      </p>
                    </div>
                    {mixedConcepts && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                        Conceptos mixtos
                      </span>
                    )}
                  </div>
                  {mixedConcepts && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
                      La venta contiene items con distinto tratamiento fiscal. Se usara el criterio calculado por el sistema.
                    </p>
                  )}
                </div>
                <select
                  value={value.fiscalMunicipalityCode}
                  disabled={readonly}
                  onChange={(event) => update({ fiscalMunicipalityCode: event.target.value })}
                  className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs text-slate-700 outline-none focus:border-emerald-500 disabled:bg-slate-50"
                >
                  <option value="">Municipio ICA</option>
                  {COLOMBIAN_MUNICIPALITIES.map((municipality) => (
                    <option key={municipality.code} value={municipality.code}>
                      {municipality.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ReteICA / ICA retenido (por mil)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Defecto (RUT)"
                    value={value.reteIcaRateOverride !== undefined ? value.reteIcaRateOverride : ""}
                    disabled={readonly}
                    onChange={(event) => {
                      const val = event.target.value === "" ? undefined : parseFloat(event.target.value);
                      update({ reteIcaRateOverride: val });
                    }}
                    className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                {preview && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Régimen Simple</span>
                    <div className={`h-10 rounded-xl border flex items-center justify-center text-xs font-bold ${
                      preview.sellerIsSimpleRegime 
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800" 
                        : "border-slate-100 bg-slate-50 text-slate-600"
                    }`}>
                      {preview.sellerIsSimpleRegime ? "RST (47)" : "Ordinario"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {value.buyerType === "JURIDICA" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["buyerIsRegimenSimple", "Regimen Simple"],
                ["buyerType", "Juridica"],
                ["buyerIsAutorretenedor", "Autorretenedor"],
                ["buyerIsGranContribuyente", "Gran Contrib."],
              ].map(([key, label]) => {
                const active =
                  key === "buyerType"
                    ? value.buyerType === "JURIDICA"
                    : Boolean(value[key as keyof SaleFiscalFormState]);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={readonly}
                    onClick={() => {
                      if (key === "buyerType") {
                        update({ buyerType: active ? "NATURAL" : "JURIDICA" });
                        return;
                      }
                      update({ [key]: !active } as Partial<SaleFiscalFormState>);
                    }}
                    className={`min-h-9 rounded-xl border px-2 text-[10px] font-bold transition ${fiscalChipClass(active, readonly)}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            )}
          </>
        )}
        </div>
      )}

      {!missingReadonlyFiscal && (
        <>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 text-xs text-slate-600 shadow-sm">
            {loading && !preview ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Calculando liquidacion...
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 text-rose-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : preview ? (
              <>
                {preview.profileMissing && (
                  <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                    No hay RUT fiscal configurado. La venta se confirmara sin calculo tributario.
                  </div>
                )}
                {preview.mixedConceptsWarning && (
                  <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <span>{preview.mixedConceptsWarning}</span>
                  </div>
                )}
                <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Liquidación detallada en tiempo real
                </div>
                <div className="space-y-2">
                  <SummaryRow label="Subtotal" value={Number(preview.subtotal)} />
                  <SummaryRow label="IVA" value={Number(preview.vatTotal)} />
                  <SummaryRow label="Impoconsumo" value={Number(preview.impoconsumoTotal)} />
                  <SummaryRow label="ReteFuente" value={Number(preview.reteFuenteTotal)} />
                  <SummaryRow label="ReteICA" value={Number(preview.reteIcaTotal)} />
                  <SummaryRow label="ReteIVA" value={Number(preview.reteIvaTotal)} />
                  <SummaryRow label="Autorretencion" value={Number(preview.autoRetencionTotal)} />
                </div>
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 font-semibold text-slate-900">
                  <SummaryRow label="Total cobrado" value={Number(preview.subtotal) + chargedTotal} />
                  <SummaryRow label="Total retenido" value={withheldTotal} />
                </div>
                <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-100 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Neto recibido
                  </span>
                  <span className="text-2xl font-black text-emerald-600 tabular-nums">
                    ${formatCop(Number(preview.netReceived))}
                  </span>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Validación de retenciones
                  </div>
                  <div className="space-y-2">
                    <RetentionValidationCard
                      label="ReteFuente"
                      line={findTaxLine(preview.taxLines, "RETEFUENTE")}
                    />
                    <RetentionValidationCard
                      label="ReteICA"
                      line={findTaxLine(preview.taxLines, "RETEICA")}
                    />
                    <RetentionValidationCard
                      label="ReteIVA"
                      line={findTaxLine(preview.taxLines, "RETEIVA")}
                    />
                    <RetentionValidationCard
                      label="Autorretención"
                      line={findTaxLine(preview.taxLines, "AUTORRETENCION")}
                    />
                  </div>
                </div>
              </>
            ) : (
              <span>Agrega items para ver la liquidacion tributaria.</span>
            )}
          </div>

          {preview?.taxLines?.length ? (
            <details className="rounded-2xl border border-slate-100 bg-white p-4 w-full min-w-0">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-500 select-none">
                Detalle de formulas y reglas aplicadas
              </summary>
              <div className="mt-3 space-y-2 w-full min-w-0">
                {preview.taxLines.map((line, index) => (
                  <div
                    key={`${line.taxType}-${line.direction}-${index}`}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-800">{line.taxType}</span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">
                            {lineStatus(line)}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Base: ${formatCop(Number(line.baseAmount))} · Tarifa:{" "}
                          {formatTaxRate(line.taxType, Number(line.rate))}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-slate-800">
                          {line.applied ? `$${formatCop(Number(line.taxAmount))}` : "No aplica"}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">PUC: {line.accountCode}</p>
                      </div>
                    </div>
                    {line.reason && (
                      <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[10px] italic text-slate-500">
                        {line.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">${formatCop(value)}</span>
    </div>
  );
}
