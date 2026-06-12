"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { X } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import { getErrorMessage } from "@/src/lib/errors";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { KardexList } from "./KardexList";
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

  if (!open || !product) return null;

  const canCreateInitial = product.canCreateInitialInventory ?? !product.hasMovements;
  const movementType = canCreateInitial ? "INVENTORY_INITIAL" : "PURCHASE";
  const normalizedQuantity = normalizeDecimalInput(quantity);
  const normalizedUnitCost = normalizeDecimalInput(unitCost);
  const canSubmit =
    isValidDecimalString(normalizedQuantity) &&
    isValidDecimalString(normalizedUnitCost) &&
    Number(normalizedQuantity) > 0 &&
    Number(normalizedUnitCost) >= 0;

  const currentStock = parseNumber(product.currentStock);
  const averageCost = parseNumber(product.averageCost);
  const stockValue = parseNumber(product.stockValue);
  const normalizedMinStock = normalizeDecimalInput(minStock || "0");
  const canSaveMinStock = isValidDecimalString(normalizedMinStock) && Number(normalizedMinStock) >= 0;

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

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex h-[88dvh] max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-[720px] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]">
        <div className="shrink-0 border-b border-neutral-100 bg-white px-5 pb-4 pt-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-slate-800">{product.name}</h2>
              <p className="mt-1 text-xs font-normal text-slate-500">
                Stock: <span className="font-medium">{formatMoney(currentStock)} unidades</span> · Costo prom.: <span className="font-medium">${formatMoney(averageCost)}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
                }}
                className={cn("flex-1 rounded-lg py-2 text-xs font-medium transition-colors", activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div ref={contentRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50/30 px-5 py-4">
          {activeTab === "compras" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{canCreateInitial ? "Inventario inicial" : "Compra"}</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">Carga stock directo del producto. No usa insumos ni receta.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Cantidad comprada" className="rounded-2xl border border-neutral-100 px-4 py-3 text-sm outline-none" />
                <input value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Costo unitario" className="rounded-2xl border border-neutral-100 px-4 py-3 text-sm outline-none" />
              </div>
              <input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="Factura / referencia opcional" className="w-full rounded-2xl border border-neutral-100 px-4 py-3 text-sm outline-none" />
              <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Detalle opcional" className="min-h-24 w-full rounded-2xl border border-neutral-100 px-4 py-3 text-sm outline-none" />
              <button disabled={!canSubmit || submitting} className="h-11 w-full rounded-2xl bg-neutral-900 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">
                Registrar
              </button>
            </form>
          ) : activeTab === "kardex" ? (
            loading ? <div className="text-center text-sm text-neutral-400">Cargando kardex...</div> : <KardexList movements={movements} />
          ) : (
            <div className="space-y-4 rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
              <div className="space-y-3">
                <p>Stock actual: <span className="font-semibold">{formatMoney(currentStock)} unidades</span></p>
                <p>Costo promedio: <span className="font-semibold">${formatMoney(averageCost)}</span></p>
                <p>Valor total: <span className="font-semibold">${formatMoney(stockValue)}</span></p>
                {product.sellability?.message ? <p className="text-amber-700">{product.sellability.message}</p> : null}
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Stock mínimo
                </label>
                <div className="mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value.replace(/[^0-9.,]/g, ""))}
                      inputMode="decimal"
                      className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 pr-20 text-sm outline-none"
                      placeholder="0"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">
                      unidades
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveMinStock()}
                    disabled={!canSaveMinStock || savingMinStock}
                    className="rounded-2xl bg-neutral-900 px-4 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                  >
                    Guardar
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/mi-negocio?itemId=${encodeURIComponent(product.id)}`)}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white text-xs font-black uppercase tracking-widest text-neutral-800"
              >
                Editar en Mi Negocio
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
