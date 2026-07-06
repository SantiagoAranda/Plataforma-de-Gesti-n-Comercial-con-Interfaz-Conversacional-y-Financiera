"use client";

import { useEffect, useState, useMemo } from "react";
import { X, Calculator, Info, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  getTaxPreview,
  type BuyerFiscalContext,
  type TaxPreviewResponse,
} from "@/src/lib/tax/api";
import type { Sale } from "@/src/types/sales";
import { COLOMBIAN_MUNICIPALITIES } from "@/src/constants/colombianMunicipalities";

function formatMoney(amount: number) {
  return amount.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPercentage(rate: number) {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatTaxRate(
  taxType: TaxPreviewResponse["taxLines"][number]["taxType"],
  rate: number,
) {
  return taxType === "RETEICA"
    ? `${(rate * 1000).toFixed(2)}‰`
    : formatPercentage(rate);
}

export default function TaxPreviewModal({
  open,
  sale,
  onClose,
  onConfirm,
  confirming = false,
  initialContext,
  actionLabel = "Confirmar y contabilizar",
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (buyerFiscalContext: BuyerFiscalContext) => Promise<void>;
  confirming?: boolean;
  initialContext?: BuyerFiscalContext | null;
  actionLabel?: string;
}) {
  const [buyerType, setBuyerType] = useState<"NATURAL" | "JURIDICA">("NATURAL");
  const [buyerDocumentType, setBuyerDocumentType] = useState<"CC" | "NIT" | "CE" | "PASAPORTE" | "TI">("CC");
  const [buyerDocumentNumber, setBuyerDocumentNumber] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [reteIcaRateOverride, setReteIcaRateOverride] = useState<number | undefined>(undefined);
  
  // Fiscal responsibilities of the buyer
  const [buyerIsIvaResponsable, setBuyerIsIvaResponsable] = useState(false);
  const [buyerIsRetenedor, setBuyerIsRetenedor] = useState(false);
  const [buyerIsGranContribuyente, setBuyerIsGranContribuyente] = useState(false);
  const [buyerIsAutorretenedor, setBuyerIsAutorretenedor] = useState(false);
  const [buyerIsRegimenSimple, setBuyerIsRegimenSimple] = useState(false);
  const [buyerRequiresElectronicInvoice, setBuyerRequiresElectronicInvoice] = useState(false);

  const [fiscalMunicipalityCode, setFiscalMunicipalityCode] = useState("");
  const [saleConcept, setSaleConcept] = useState<"GOODS" | "SERVICES" | "HONORARIOS" | "ARRENDAMIENTOS" | "FOOD_BEVERAGES" | "OTHER">("GOODS");

  const [preview, setPreview] = useState<TaxPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize fields with sale details
  useEffect(() => {
    if (!sale) return;
    setBuyerName(initialContext?.buyerName || sale.customerName || "");
    setReteIcaRateOverride(
      initialContext?.reteIcaRateOverride ?? initialContext?.icaRateOverride ?? undefined,
    );
    setBuyerDocumentNumber(initialContext?.buyerDocumentNumber || "");
    setBuyerEmail(initialContext?.buyerEmail || "");
    
    // Automatically match CC vs NIT based on name length or defaults
    if (initialContext) {
      setBuyerType(initialContext.buyerType);
      setBuyerDocumentType(initialContext.buyerDocumentType);
    } else if (sale.customerName && sale.customerName.length > 20) {
      setBuyerType("JURIDICA");
      setBuyerDocumentType("NIT");
    } else {
      setBuyerType("NATURAL");
      setBuyerDocumentType("CC");
    }

    // Set default concept based on sale type
    if (initialContext?.saleConcept) {
      setSaleConcept(initialContext.saleConcept);
    } else if (sale.type === "SERVICIO") {
      setSaleConcept("SERVICES");
    } else {
      setSaleConcept("GOODS");
    }

    setBuyerIsIvaResponsable(initialContext?.buyerIsIvaResponsable ?? false);
    setBuyerIsRetenedor(initialContext?.buyerIsRetenedor ?? false);
    setBuyerIsGranContribuyente(initialContext?.buyerIsGranContribuyente ?? false);
    setBuyerIsAutorretenedor(initialContext?.buyerIsAutorretenedor ?? false);
    setBuyerIsRegimenSimple(initialContext?.buyerIsRegimenSimple ?? false);
    setBuyerRequiresElectronicInvoice(initialContext?.buyerRequiresElectronicInvoice ?? false);
    setFiscalMunicipalityCode(initialContext?.fiscalMunicipalityCode || "");
    setPreview(null);
  }, [sale, initialContext]);

  // Automatically update preview when fields change
  useEffect(() => {
    if (!open || !sale) return;

    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const cartItems = sale.items
          .filter(
            (it): it is typeof it & { itemId: string } =>
              typeof it.itemId === "string" && it.itemId.length > 0,
          )
          .map((it) => ({
            itemId: it.itemId,
            quantity: it.qty,
          }));

        const data = await getTaxPreview({
          buyerType,
          buyerName: buyerName.trim() || undefined,
          buyerDocumentType,
          buyerDocumentNumber: buyerDocumentNumber.trim() || undefined,
          buyerEmail: buyerEmail.trim() || undefined,
          buyerIsIvaResponsable,
          buyerIsRetenedor,
          buyerIsGranContribuyente,
          buyerIsAutorretenedor,
          buyerIsRegimenSimple,
          buyerRequiresElectronicInvoice,
          fiscalMunicipalityCode: fiscalMunicipalityCode || undefined,
          reteIcaRateOverride,
          saleConcept,
          cartItems,
        });

        setPreview(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Error al calcular el preview tributario");
      } finally {
        setLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchPreview();
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [
    open,
    sale,
    buyerType,
    buyerDocumentType,
    buyerDocumentNumber,
    buyerName,
    buyerEmail,
    buyerIsIvaResponsable,
    buyerIsRetenedor,
    buyerIsGranContribuyente,
    buyerIsAutorretenedor,
    buyerIsRegimenSimple,
    buyerRequiresElectronicInvoice,
    fiscalMunicipalityCode,
    reteIcaRateOverride,
    saleConcept,
  ]);

  if (!open || !sale) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const context: BuyerFiscalContext = {
      buyerType,
      buyerName: buyerName.trim() || null,
      buyerDocumentType,
      buyerDocumentNumber: buyerDocumentNumber.trim() || null,
      buyerEmail: buyerEmail.trim() || null,
      buyerIsIvaResponsable,
      buyerIsRetenedor,
      buyerIsGranContribuyente,
      buyerIsAutorretenedor,
      buyerIsRegimenSimple,
      buyerRequiresElectronicInvoice,
      fiscalMunicipalityCode: fiscalMunicipalityCode || null,
      reteIcaRateOverride,
      saleConcept,
    };
    onConfirm(context);
  };

  // Group tax lines
  const chargeLines = preview?.taxLines.filter((l) => l.direction === "CHARGE" && l.applied) || [];
  const withholdLines = preview?.taxLines.filter((l) => l.direction === "WITHHOLD" && l.applied) || [];
  const selfLines = preview?.taxLines.filter((l) => l.direction === "SELF" && l.applied) || [];
  const chargedTotal = preview
    ? Number(preview.vatTotal) + Number(preview.impoconsumoTotal)
    : 0;
  const withheldTotal = preview
    ? Number(preview.reteFuenteTotal) +
      Number(preview.reteIvaTotal) +
      Number(preview.reteIcaTotal)
    : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4 backdrop-blur-md">
      <div className="w-full sm:max-w-4xl flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] sm:h-[85vh] animate-in slide-in-from-bottom-8 duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 rounded-2xl text-emerald-600">
              <Calculator size={22} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-lg">Liquidación e Impuestos de Venta</h2>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Parámetros Tributarios de Colombia
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition text-slate-500 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body split in two columns */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row bg-slate-50/50 min-h-0">
          
          {/* Column 1: Buyer Fiscal Form */}
          <div className="flex-1 p-6 space-y-6 md:border-r border-slate-100 md:max-w-md overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Contexto Fiscal del Comprador
            </h3>

            {/* Persona y Documento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Tipo Persona</label>
                <select
                  value={buyerType}
                  onChange={(e) => {
                    const val = e.target.value as "NATURAL" | "JURIDICA";
                    setBuyerType(val);
                    if (val === "JURIDICA") {
                      setBuyerDocumentType("NIT");
                    } else {
                      setBuyerDocumentType("CC");
                    }
                  }}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                >
                  <option value="NATURAL">Natural</option>
                  <option value="JURIDICA">Jurídica</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Documento</label>
                <select
                  value={buyerDocumentType}
                  onChange={(e) => setBuyerDocumentType(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                >
                  {buyerType === "NATURAL" ? (
                    <>
                      <option value="CC">Cédula Ciudadanía (CC)</option>
                      <option value="CE">Cédula Extranjería (CE)</option>
                      <option value="PASAPORTE">Pasaporte</option>
                      <option value="TI">Tarjeta Identidad (TI)</option>
                    </>
                  ) : (
                    <option value="NIT">NIT / RUT</option>
                  )}
                </select>
              </div>
            </div>

            {/* Nombre y Documento Nro */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Número Documento</label>
                <input
                  type="text"
                  placeholder="Ej: 1098765432 o 900123456"
                  value={buyerDocumentNumber}
                  onChange={(e) => setBuyerDocumentNumber(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Nombre o Razón Social</label>
                <input
                  type="text"
                  placeholder="Ej: Juan Pérez o Distribuidora S.A.S."
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Correo (Opcional)</label>
                <input
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                />
              </div>
            </div>

            {/* Municipio */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Municipio Fiscal (ICA)</label>
                <select
                  value={fiscalMunicipalityCode}
                  onChange={(e) => setFiscalMunicipalityCode(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                >
                  <option value="">Seleccione Municipio...</option>
                  {COLOMBIAN_MUNICIPALITIES.map((mun) => (
                    <option key={mun.code} value={mun.code}>
                      {mun.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tarifa ReteICA y Régimen Simple */}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">ReteICA / ICA retenido (por mil)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Defecto (RUT)"
                  value={reteIcaRateOverride !== undefined ? reteIcaRateOverride : ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                    setReteIcaRateOverride(val);
                  }}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Régimen Simple (Vendedor)</label>
                <div className={`h-10 rounded-xl border flex items-center justify-center text-xs font-medium ${
                  preview?.sellerIsSimpleRegime 
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800" 
                    : "border-slate-200 bg-slate-100 text-slate-600"
                }`}>
                  {preview?.sellerIsSimpleRegime ? "RST (47)" : "Ordinario"}
                </div>
              </div>
            </div>

            {/* Checkboxes Tributarios */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2">
                Contexto fiscal del comprador
              </span>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={buyerType === "JURIDICA"}
                    onChange={(e) => {
                      const juridica = e.target.checked;
                      setBuyerType(juridica ? "JURIDICA" : "NATURAL");
                      setBuyerDocumentType(juridica ? "NIT" : "CC");
                      if (!juridica) {
                        setBuyerIsIvaResponsable(false);
                        setBuyerIsRetenedor(false);
                        setBuyerIsGranContribuyente(false);
                        setBuyerIsAutorretenedor(false);
                        setBuyerIsRegimenSimple(false);
                        setBuyerRequiresElectronicInvoice(false);
                      } else {
                        setBuyerIsIvaResponsable(true);
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span>Jurídica</span>
                </label>

                <label className="hidden items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={buyerIsRetenedor}
                    onChange={(e) => setBuyerIsRetenedor(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span>Agente de Retención (07)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={buyerIsGranContribuyente}
                    onChange={(e) => setBuyerIsGranContribuyente(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span>Gran Contribuyente (13)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={buyerIsAutorretenedor}
                    onChange={(e) => setBuyerIsAutorretenedor(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span>Autorretenedor (15)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={buyerIsRegimenSimple}
                    onChange={(e) => setBuyerIsRegimenSimple(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span>Régimen Simple (RST - 47)</span>
                </label>

                <label className="hidden items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800 transition">
                  <input
                    type="checkbox"
                    checked={buyerRequiresElectronicInvoice}
                    onChange={(e) => setBuyerRequiresElectronicInvoice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <span>Facturación Electrónica</span>
                </label>
              </div>
            </div>
          </div>

          {/* Column 2: Live calculation breakdown */}
          <div className="flex-1 p-6 flex flex-col overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Liquidación Detallada en Tiempo Real
            </h3>

            {loading && !preview && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                <Loader2 className="animate-spin mb-3 text-emerald-500" size={28} />
                <span className="text-xs font-medium">Calculando impuestos en el servidor...</span>
              </div>
            )}

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex gap-3 text-xs text-rose-700">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {preview && (
              <div className="space-y-6 flex-1 flex flex-col">
                {preview.profileMissing && (
                  <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      No hay RUT fiscal configurado. La venta se confirmará sin cálculo tributario.
                    </span>
                  </div>
                )}
                 
                {/* Financial Summary Box */}
                <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-inner space-y-4">
                  <div className="grid grid-cols-2 gap-y-2 text-xs opacity-80">
                    <span>Subtotal Neto:</span>
                    <span className="text-right font-medium tabular-nums">{formatMoney(preview.subtotal)}</span>

                    {chargeLines.map((l) => (
                      <span key={l.taxType} className="contents">
                        <span>{l.taxType} ({formatTaxRate(l.taxType, l.rate)}):</span>
                        <span className="text-right text-emerald-400 font-medium tabular-nums">+{formatMoney(l.taxAmount)}</span>
                      </span>
                    ))}

                    {withholdLines.map((l) => (
                      <span key={l.taxType} className="contents">
                        <span>Retención {l.taxType} ({formatTaxRate(l.taxType, l.rate)}):</span>
                        <span className="text-right text-amber-400 font-medium tabular-nums">-{formatMoney(l.taxAmount)}</span>
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 border-t border-white/10 pt-3 text-xs">
                    <span>IVA</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(Number(preview.vatTotal))}
                    </span>
                    <span>Impoconsumo</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(Number(preview.impoconsumoTotal))}
                    </span>
                    <span>ReteFuente</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(Number(preview.reteFuenteTotal))}
                    </span>
                    <span>ReteIVA</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(Number(preview.reteIvaTotal))}
                    </span>
                    <span>ReteICA</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(Number(preview.reteIcaTotal))}
                    </span>
                    <span>Total cobrado</span>
                    <span className="text-right font-semibold tabular-nums">
                      {formatMoney(Number(preview.subtotal) + chargedTotal)}
                    </span>
                    <span>Total retenido</span>
                    <span className="text-right font-semibold tabular-nums">
                      {formatMoney(withheldTotal)}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Neto a Recibir</span>
                      <p className="text-[9px] text-slate-400 leading-tight">Valor a cobrar al cliente final</p>
                    </div>
                    <span className="text-2xl font-semibold text-emerald-400 tabular-nums">
                      {formatMoney(preview.netReceived)}
                    </span>
                  </div>
                </div>

                {/* Warnings / Alerts */}
                {preview.mixedConceptsWarning && (
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-700">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>{preview.mixedConceptsWarning}</span>
                  </div>
                )}

                {buyerIsRetenedor &&
                  fiscalMunicipalityCode &&
                  !withholdLines.some(l => l.taxType === "RETEICA") && (
                  <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-700">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      No se liquidó ReteICA para {COLOMBIAN_MUNICIPALITIES.find(m => m.code === fiscalMunicipalityCode)?.name}. Asegúrese de registrar las tarifas municipales en Configuración Fiscal si aplica retención.
                    </span>
                  </div>
                )}

                {/* Tax Lines Explanations */}
                <div className="space-y-3">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block">
                    Detalle de Fórmulas y Reglas Aplicadas
                  </span>

                  <div className="space-y-2">
                    {preview.taxLines.map((line, index) => (
                      <div
                        key={`${line.taxType}-${line.direction}-${index}`}
                        className={`p-3 rounded-2xl border text-xs flex flex-col gap-1 transition ${
                          line.applied
                            ? "bg-white border-slate-100 shadow-sm"
                            : "bg-slate-50/30 border-slate-100 opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                            {line.taxType} 
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                              line.direction === "CHARGE"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : line.direction === "WITHHOLD"
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : "bg-blue-50 text-blue-700 border border-blue-100"
                            }`}>
                              {line.direction === "CHARGE" ? "Cobrado" : line.direction === "WITHHOLD" ? "Retenido" : "Autorretención"}
                            </span>
                          </span>
                          {line.applied ? (
                            <span className="font-medium text-slate-800 tabular-nums">
                              {formatMoney(line.taxAmount)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400">No aplica</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>Base: {formatMoney(line.baseAmount)} · Tarifa: {formatTaxRate(line.taxType, line.rate)}</span>
                          <span>Cuenta PUC: {line.accountCode}</span>
                        </div>

                        {line.reason && (
                          <div className="text-[10px] text-slate-500 bg-slate-50/80 px-2 py-1 rounded-lg mt-1 italic">
                            {line.reason}
                          </div>
                        )}

                        {line.direction === "SELF" && line.applied && (
                          <div className="text-[9px] font-medium text-blue-600 flex items-center gap-1 mt-0.5">
                            <Info size={11} />
                            <span>Las autorretenciones no afectan el neto; se contabilizan como créditos.</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none mb-1">
              Valor Final
            </span>
            <span className="text-lg font-semibold text-slate-800 tabular-nums leading-none">
              {preview ? formatMoney(preview.netReceived) : formatMoney(sale.total ?? 0)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="h-11 px-5 rounded-xl border border-slate-200 text-slate-500 font-medium text-xs uppercase tracking-wider hover:bg-slate-50 transition"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={confirming || loading}
              className="h-11 px-8 rounded-xl bg-emerald-600 text-white font-medium text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/10 hover:bg-emerald-700 transition flex items-center gap-2"
            >
              {confirming ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  <span>Confirmando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>{actionLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
