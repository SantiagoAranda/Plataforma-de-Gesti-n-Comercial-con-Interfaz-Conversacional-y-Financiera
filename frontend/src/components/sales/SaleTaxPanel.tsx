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
  withholdingSubjectIsDeclarante: boolean;
  fiscalMunicipalityCode: string;
  saleConcept: BuyerFiscalContext["saleConcept"];
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
  withholdingSubjectIsDeclarante: true,
  fiscalMunicipalityCode: "",
  saleConcept: "GOODS",
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
    withholdingSubjectIsDeclarante: state.withholdingSubjectIsDeclarante,
    fiscalMunicipalityCode: state.fiscalMunicipalityCode || null,
    saleConcept: state.saleConcept,
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
      withholdingSubjectIsDeclarante:
        context.withholdingSubjectIsDeclarante ?? true,
      fiscalMunicipalityCode: context.fiscalMunicipalityCode ?? "",
      saleConcept:
        context.saleConcept ??
        (sale?.type === "SERVICIO" ? "SERVICES" : "GOODS"),
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

function fiscalChipClass(active: boolean, readonly: boolean) {
  if (active) return "border-emerald-500 bg-emerald-50 text-emerald-800";
  return readonly
    ? "border-slate-100 bg-slate-50 text-slate-400"
    : "border-emerald-200 bg-white text-slate-700 hover:border-emerald-400";
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

function ConceptSelect({
  value,
  disabled,
  onChange,
}: {
  value: SaleFiscalFormState["saleConcept"];
  disabled: boolean;
  onChange: (value: SaleFiscalFormState["saleConcept"]) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as SaleFiscalFormState["saleConcept"])}
      className="h-10 w-full rounded-xl border border-slate-100 bg-white px-3 text-xs text-slate-700 outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
    >
      <option value="GOODS">Bienes / Productos</option>
      <option value="SERVICES">Servicios</option>
      <option value="HONORARIOS">Honorarios</option>
      <option value="ARRENDAMIENTOS">Arrendamientos</option>
    </select>
  );
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
    }
    if (patch.buyerType === "JURIDICA") {
      next.buyerDocumentType = "NIT";
      next.buyerIsIvaResponsable = true;
      next.buyerIsRetenedor = true;
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
          withholdingSubjectIsDeclarante:
            context.withholdingSubjectIsDeclarante,
          fiscalMunicipalityCode: context.fiscalMunicipalityCode || undefined,
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
              <div className="grid grid-cols-2 gap-2">
                <ConceptSelect
                  value={value.saleConcept}
                  disabled={readonly}
                  onChange={(saleConcept) => update({ saleConcept })}
                />
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
              <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={value.withholdingSubjectIsDeclarante}
                  disabled={readonly}
                  onChange={(event) => update({ withholdingSubjectIsDeclarante: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                Declarante de renta
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["buyerIsIvaResponsable", "Responsable IVA (48)"],
                ["buyerIsRetenedor", "Agente Retencion (07)"],
                ["buyerIsGranContribuyente", "Gran Contrib. (13)"],
                ["buyerIsAutorretenedor", "Autorretenedor (15)"],
                ["buyerIsRegimenSimple", "Regimen Simple (47)"],
              ].map(([key, label]) => {
                const active = Boolean(value[key as keyof SaleFiscalFormState]);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={readonly}
                    onClick={() => update({ [key]: !active } as Partial<SaleFiscalFormState>)}
                    className={`min-h-9 rounded-xl border px-2 text-[10px] font-bold transition ${fiscalChipClass(active, readonly)}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        </div>
      )}

      {!missingReadonlyFiscal && (
        <>
          <div className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-300 shadow-sm">
            {loading && !preview ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Calculando liquidacion...
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 text-rose-200">
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
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Liquidacion detallada en tiempo real
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
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3 font-semibold text-white">
                  <SummaryRow label="Total cobrado" value={Number(preview.subtotal) + chargedTotal} />
                  <SummaryRow label="Total retenido" value={withheldTotal} />
                </div>
                <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Neto recibido
                  </span>
                  <span className="text-2xl font-bold text-emerald-400 tabular-nums">
                    ${formatCop(Number(preview.netReceived))}
                  </span>
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
