"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { X, ExternalLink, ShieldAlert, BadgeDollarSign, HelpCircle, Eye } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import { getErrorMessage } from "@/src/lib/errors";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { KardexList } from "./KardexList";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";
import {
  listItemKardex,
  registerSimpleItemMovement,
  updateSimpleItemMinStock,
  type InventoryMovement,
  type SimpleItemInventorySummary,
} from "@/src/services/inventory";

type TabType = "compras" | "kardex" | "producto";

type Props = {
  product: SimpleItemInventorySummary | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

function normalizeDecimalInput(value: string) {
  return value.trim().replace(",", ".");
}

function isValidDecimalString(value: string) {
  return /^\d+(\.\d+)?$/.test(value);
}

export function SimpleProductDetailSheet({ product, open, onClose, onChanged }: Props) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>("compras");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [detail, setDetail] = useState("");
  const [minStock, setMinStock] = useState("");
  const [savingMinStock, setSavingMinStock] = useState(false);

  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setMovements(await listItemKardex(id).catch(() => []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && product?.id) {
      setActiveTab("compras");
      setMinStock(product.minStock?.toString?.() ?? "0");
      void loadData(product.id);
    } else {
      setMovements([]);
    }
  }, [open, product?.id, loadData]);

  const canCreateInitial = product ? (product.canCreateInitialInventory ?? !product.hasMovements) : false;
  const movementType = canCreateInitial ? "INVENTORY_INITIAL" : "PURCHASE";

  const normalizedQuantity = normalizeDecimalInput(quantity);
  const normalizedUnitCost = normalizeDecimalInput(unitCost);

  const canSubmit = useMemo(() => {
    return (
      isValidDecimalString(normalizedQuantity) &&
      isValidDecimalString(normalizedUnitCost) &&
      Number(normalizedQuantity) > 0 &&
      Number(normalizedUnitCost) >= 0
    );
  }, [normalizedQuantity, normalizedUnitCost]);

  const currentStock = product ? parseNumber(product.currentStock) : 0;
  const averageCost = product ? parseNumber(product.averageCost) : 0;
  const stockValue = product ? parseNumber(product.stockValue) : 0;

  const normalizedMinStock = normalizeDecimalInput(minStock || "0");
  const canSaveMinStock = useMemo(() => {
    return isValidDecimalString(normalizedMinStock) && Number(normalizedMinStock) >= 0;
  }, [normalizedMinStock]);

  // Real-time purchase calculation preview
  const purchasePreview = useMemo(() => {
    if (!canSubmit) return null;
    const qty = Number(normalizedQuantity);
    const cost = Number(normalizedUnitCost);
    const total = qty * cost;

    return {
      quantity: qty,
      unitCost: cost,
      totalValue: total,
      stockAfter: currentStock + qty,
    };
  }, [canSubmit, normalizedQuantity, normalizedUnitCost, currentStock]);

  if (!open || !product) return null;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    const toastId = toast.loading("Registrando movimiento...");
    setSubmitting(true);
    try {
      await registerSimpleItemMovement(product.id, {
        type: movementType,
        quantity: normalizedQuantity,
        unitCost: normalizedUnitCost,
        referenceId: referenceId.trim() || undefined,
        detail: detail.trim() || undefined,
      });
      toast.success("Movimiento registrado", { id: toastId });
      setQuantity("");
      setUnitCost("");
      setReferenceId("");
      setDetail("");
      await loadData(product.id);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo registrar el movimiento"), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const saveMinStock = async () => {
    if (!canSaveMinStock || savingMinStock) return;
    const toastId = toast.loading("Guardando mínimo...");
    setSavingMinStock(true);
    try {
      await updateSimpleItemMinStock(product.id, normalizedMinStock);
      toast.success("Stock mínimo guardado", { id: toastId });
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo guardar el stock mínimo"), { id: toastId });
    } finally {
      setSavingMinStock(false);
    }
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: "compras", label: "Compras" },
    { id: "kardex", label: "Kardex" },
    { id: "producto", label: "Producto" },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-3 py-3 lg:left-[408px] lg:right-0 pointer-events-none"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto w-full max-w-md relative pointer-events-auto">
        <div className="relative">
          {/* Overlay Backdrop - Dark without blur */}
          <div
            className="fixed inset-0 z-40 bg-black/40 transition-opacity"
            onClick={onClose}
            aria-hidden
          />

          {/* Floating Detail Panel (4-side rounded card floating 12px above chat bar) */}
          <div className="pointer-events-auto absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 flex max-h-[min(70vh,580px)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            {/* Header container */}
            <div className="shrink-0 border-b border-slate-100/60 bg-white px-5 pb-3 pt-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold text-slate-800">{product.name}</h2>
                  <div className="mt-1 text-xs font-normal text-slate-400 space-y-0.5 leading-tight">
                    <p>
                      Stock: <span className="font-medium text-slate-600">{formatMoney(currentStock)} unidades</span> · Costo prom.:{" "}
                      <span className="font-medium text-slate-600">${formatMoney(averageCost)}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Pill Tabs Selector (Identical to Inventory main tabs) */}
              <div className="flex gap-2 min-w-0 flex-1 items-center py-0.5">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
                      }}
                      className={cn(
                        "flex-1 rounded-full py-2 text-xs font-semibold transition-all active:scale-[0.98]",
                        isActive
                          ? "bg-[#E0E7FF] text-[#0B3F64] shadow-none"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 font-medium",
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div ref={contentRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-5 py-4 custom-scrollbar overscroll-contain">
              {activeTab === "compras" ? (
                <div className="space-y-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                    className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        {canCreateInitial ? "Inventario Inicial" : "Registro de Compra"}
                      </p>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-700 uppercase tracking-wider">
                        Directo
                      </span>
                    </div>

                    <p className="text-[11px] font-semibold text-slate-500 leading-normal">
                      Carga directa de stock para productos finales comercializables sin receta ni insumos base asociados.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Cantidad</label>
                        <div className="relative flex items-center">
                          <input
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ""))}
                            placeholder="Cantidad"
                            inputMode="decimal"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-[#0B3F64]"
                          />
                          <span className="absolute right-4 text-xs font-bold text-slate-400">unidades</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Costo Unitario</label>
                        <div className="relative flex items-center">
                          <span className="absolute left-4 text-xs font-bold text-slate-400">$</span>
                          <input
                            value={unitCost}
                            onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))}
                            placeholder="Costo"
                            inputMode="decimal"
                            className="w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-[#0B3F64]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Referencia / Factura</label>
                      <input
                        value={referenceId}
                        onChange={(e) => setReferenceId(e.target.value)}
                        placeholder="Ej: Factura Nro 123"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-[#0B3F64]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Detalle Adicional</label>
                      <textarea
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
                        placeholder="Notas o comentarios..."
                        className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-[#0B3F64]"
                      />
                    </div>
                  </form>

                  {/* Dynamic Preview Card */}
                  {purchasePreview && (
                    <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/40 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                        <BadgeDollarSign className="h-4 w-4" />
                        <span>Resumen del Registro</span>
                      </div>

                      <div className="grid grid-cols-2 gap-y-2 text-[11px] font-semibold text-emerald-800/80">
                        <div>Adición al Stock:</div>
                        <div className="text-right font-bold">+{formatMoney(purchasePreview.quantity)} unidades</div>
                        <div>Valor Total de Compra:</div>
                        <div className="text-right font-bold">${formatMoney(purchasePreview.totalValue)}</div>
                        <div className="border-t border-emerald-100/60 pt-2">Stock Resultante Estimado:</div>
                        <div className="text-right font-bold border-t border-emerald-100/60 pt-2">
                          {formatMoney(purchasePreview.stockAfter)} unidades
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : activeTab === "kardex" ? (
                loading ? (
                  <div className="py-12 text-center text-sm font-semibold text-slate-400">Cargando timeline...</div>
                ) : (
                  <KardexList movements={movements} stockUnitLabel="unidades" />
                )
              ) : (
                <div className="space-y-4">

                  {/* Product metrics summary card */}
                  <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Valorización de Stock</p>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 uppercase tracking-wider">
                        Activo
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100/60">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Stock Actual</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{formatMoney(currentStock)}</p>
                        <p className="text-[8px] font-bold text-slate-400">unidades</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100/60">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Costo Promedio</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">${formatMoney(averageCost)}</p>
                        <p className="text-[8px] font-bold text-slate-400">promedio ponderado</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100/60">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Valor Total Stock</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">${formatMoney(stockValue)}</p>
                        <p className="text-[8px] font-bold text-slate-400">valor de inventario</p>
                      </div>
                    </div>

                    {product.sellability?.message && (
                      <div className="rounded-xl bg-amber-50 border border-amber-100/60 p-3 text-[11px] font-bold text-amber-800 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>{product.sellability.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Min stock config card */}
                  <div className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Parámetros de Alerta</p>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stock Mínimo</span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nivel Crítico de Inventario</label>
                      <div className="relative flex items-center">
                        <input
                          value={minStock}
                          onChange={(e) => setMinStock(e.target.value.replace(/[^0-9.,]/g, ""))}
                          inputMode="decimal"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-20 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-[#0B3F64]"
                          placeholder="0"
                        />
                        <span className="pointer-events-none absolute right-4 text-xs font-bold text-slate-400">
                          unidades
                        </span>
                      </div>
                      <p className="text-[10px] font-semibold text-slate-400">
                        Se generará un aviso cuando el stock físico caiga por debajo de este límite.
                      </p>
                    </div>
                  </div>

                  {/* Edit in My Business direct link */}
                  <button
                    type="button"
                    onClick={() => router.push(`/mi-negocio?itemId=${encodeURIComponent(product.id)}`)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Editar en Mi Negocio</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Isolated Floating WhatsApp Chat Composer Footer */}
          {product && !loading && (
            <div className="relative z-50">
              <WhatsappComposer
                placeholder={activeTab === "compras" ? "Confirmar movimiento" : activeTab === "producto" ? "Guardar cambios" : "Kardex"}
                value=""
                onChange={() => { }}
                onSubmit={() => {
                  if (activeTab === "compras") {
                    void submit();
                  } else if (activeTab === "producto") {
                    void saveMinStock();
                  }
                }}
                disabled={activeTab === "kardex"}
                isSubmitting={activeTab === "compras" ? submitting : savingMinStock}
                submitDisabled={activeTab === "compras" ? !canSubmit : activeTab === "producto" ? !canSaveMinStock : true}
                rightIconVariant="send"
                leftIconVariant="x"
                onPlusClick={onClose}
                plusAriaLabel="Cerrar"
                submitAriaLabel={activeTab === "compras" ? "Confirmar movimiento" : activeTab === "producto" ? "Guardar cambios" : "Enviar"}
                className="rounded-[24px] border border-slate-200 bg-white p-1 shadow-md"
                centerContent={
                  <div className="flex h-full w-full items-center justify-center pt-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {activeTab === "compras" ? "Confirmar movimiento" : activeTab === "producto" ? "Guardar cambios" : "Historial Kardex"}
                    </span>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
