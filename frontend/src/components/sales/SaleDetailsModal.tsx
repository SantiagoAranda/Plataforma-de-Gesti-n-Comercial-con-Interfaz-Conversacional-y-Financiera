"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

import type { Sale } from "@/src/types/sales";
import { getStatusStyles } from "@/src/lib/statusStyles";
import { getSaleOriginLabel } from "@/src/lib/saleOrigin";

function formatMoney(n: number) {
  return (n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calcTotal(sale: Sale) {
  if (sale.total !== undefined) return sale.total;
  return sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentMethodLabel(paymentMethod?: Sale["paymentMethod"]) {
  return paymentMethod === "BANK_TRANSFER" ? "Transferencia" : "Efectivo";
}

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

function formatQuantity(value?: number) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric % 1 === 0
    ? String(numeric)
    : numeric.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatIngredientLineDisplay(line: NonNullable<Sale["items"][number]["recipe"]>[number]) {
  const ing = line.ingredient;
  const baseUnit = ing.consumptionUnit ?? "";
  const qty = line.quantityRequired;
  
  return `${formatQuantity(qty)} ${baseUnit}`;
}

function ItemThumbnail() {
  return (
    <div className="h-12 w-12 shrink-0 rounded-xl bg-neutral-100 flex items-center justify-center overflow-hidden">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
      </svg>
    </div>
  );
}

export default function SaleDetailsModal({
  open,
  sale,
  onClose,
  onEdit,
  onConfirm,
  onCancel,
  onSaveOptionalIngredients,
  confirming = false,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onEdit?: (sale: Sale) => void;
  onConfirm?: (sale: Sale) => void;
  onCancel?: (sale: Sale) => void;
  onSaveOptionalIngredients?: (
    sale: Sale,
    orderItemId: string,
    excludedOptionalIngredientIds: string[],
  ) => Promise<void>;
  confirming?: boolean;
}) {
  const [draftExclusions, setDraftExclusions] = useState<Record<string, string[]>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [optionalError, setOptionalError] = useState<string | null>(null);

  useEffect(() => {
    if (!sale) {
      setDraftExclusions({});
      setOptionalError(null);
      return;
    }

    const next: Record<string, string[]> = {};
    sale.items.forEach((item, index) => {
      const key = item.orderItemId ?? `${item.itemId ?? "item"}-${index}`;
      next[key] = item.excludedOptionalIngredientIds ?? [];
    });
    setDraftExclusions(next);
    setOptionalError(null);
  }, [sale]);

  const items = sale?.items ?? [];
  const canConfirm = sale?.status === "PENDIENTE" || sale?.status === "PENDIENTE DE CIERRE";
  const canEditOptionalIngredients =
    Boolean(sale) &&
    canConfirm &&
    sale?.sourceType === "ORDER" &&
    !sale?.inventoryPostedAt &&
    Boolean(onSaveOptionalIngredients);
  const hasUnsavedOptionalChanges = useMemo(
    () =>
      items.some((item, index) => {
        const key = item.orderItemId ?? `${item.itemId ?? "item"}-${index}`;
        const saved = item.excludedOptionalIngredientIds ?? [];
        const draft = draftExclusions[key] ?? saved;
        return !sameStringSet(saved, draft);
      }),
    [draftExclusions, items],
  );

  if (!open || !sale) return null;

  const total = calcTotal(sale);
  const styles = getStatusStyles(sale.status);

  const handleConfirmAction = () => {
    if (hasUnsavedOptionalChanges) {
      setOptionalError("Guardá los cambios de ingredientes antes de cerrar la venta.");
      return;
    }
    if (onConfirm) onConfirm(sale);
  };

  const handleCancelAction = () => {
    if (onCancel) onCancel(sale);
  };

  const toggleOptionalIngredient = (lineKey: string, ingredientId: string) => {
    setOptionalError(null);
    setDraftExclusions((current) => {
      const currentIds = current[lineKey] ?? [];
      const nextIds = currentIds.includes(ingredientId)
        ? currentIds.filter((id) => id !== ingredientId)
        : [...currentIds, ingredientId];
      return { ...current, [lineKey]: nextIds };
    });
  };

  const handleSaveOptionalIngredients = async (
    orderItemId: string,
    lineKey: string,
  ) => {
    if (!onSaveOptionalIngredients) return;
    try {
      setSavingItemId(orderItemId);
      setOptionalError(null);
      await onSaveOptionalIngredients(sale, orderItemId, draftExclusions[lineKey] ?? []);
    } catch (error) {
      console.error(error);
      setOptionalError("No se pudieron guardar los ingredientes opcionales.");
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-md flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] sm:h-auto animate-in slide-in-from-bottom-full duration-300">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-20">
          <div className="flex flex-col">
            <h2 className="font-medium text-neutral-900 text-lg">Detalle de Venta</h2>
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">#{sale.id?.slice(-6) || "N/A"}</span>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-neutral-50/30">
          <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Cliente</span>
                <span className="text-sm font-semibold text-neutral-800">{sale.customerName ?? "Sin nombre"}</span>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">WhatsApp</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {sale.customerWhatsapp || "-"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-50">
              <div className="space-y-1 text-right col-start-2">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Estado</span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${styles.dotColor || "bg-neutral-300"}`} />
                  <span className="text-sm font-semibold text-neutral-700">{styles.label}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-neutral-50">
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Medio de pago</span>
                <span className="text-sm font-semibold text-neutral-700">
                  {paymentMethodLabel(sale.paymentMethod)}
                </span>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Registrada</span>
                <span className="text-sm font-semibold text-neutral-700">{formatDateTime(sale.createdAt)}</span>
              </div>
            </div>

            {sale.type === "SERVICIO" && sale.scheduledAt && (
              <div className="pt-3 border-t border-neutral-50">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Horario reservado</span>
                <span className="text-sm font-semibold text-neutral-700">{formatDateTime(sale.scheduledAt)}</span>
              </div>
            )}

            {sale.origin && (
              <div className="pt-3 border-t border-neutral-50">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block mb-1">Origen</span>
                <span className="text-sm font-semibold text-neutral-700">
                  {getSaleOriginLabel(sale.origin)}
                </span>
                <p className="text-[10px] text-neutral-500 mt-1 italic font-medium">
                  {sale.origin === "PUBLIC_STORE" ? "Recibida desde el catálogo" : "Generada manualmente"}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest px-1">Items de la venta</span>

            <div className="space-y-3">
              {sale.items.map((it, idx) => {
                const lineKey = it.orderItemId ?? `${it.itemId ?? "item"}-${idx}`;
                const recipe = it.recipe ?? [];
                const requiredLines = recipe.filter((line) => !line.isOptional);
                const optionalLines = recipe.filter((line) => line.isOptional);
                const savedExcluded = it.excludedOptionalIngredientIds ?? [];
                const draftExcluded = draftExclusions[lineKey] ?? savedExcluded;
                const isDirty = !sameStringSet(savedExcluded, draftExcluded);
                const excludedNames = optionalLines
                  .filter((line) => draftExcluded.includes(line.ingredientId))
                  .map((line) => line.ingredient.name);
                const isEditableLine =
                  canEditOptionalIngredients &&
                  Boolean(it.orderItemId) &&
                  it.itemInventoryMode === "RECIPE_BASED" &&
                  optionalLines.length > 0;

                return (
                  <div key={lineKey} className="p-3 bg-white border border-neutral-100 rounded-2xl shadow-sm space-y-3">
                    <div className="flex items-center gap-3">
                      <ItemThumbnail />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-neutral-800 text-sm truncate">{it.name}</div>
                        <div className="text-[10px] font-medium text-neutral-400 uppercase">
                          {it.qty} unidades x ${formatMoney(it.unitPrice)} {it.durationMin ? `· ${it.durationMin} min` : ""}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-neutral-900">
                        ${formatMoney(it.price)}
                      </div>
                    </div>

                    {recipe.length > 0 && (
                      <div className="pt-3 border-t border-neutral-50 space-y-3">
                        {requiredLines.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Incluye</div>
                            <div className="flex flex-wrap gap-1.5">
                              {requiredLines.map((line) => (
                                <span
                                  key={line.ingredientId}
                                  className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-600"
                                >
                                  {line.ingredient.name}
                                  {line.quantityRequired > 0 ? ` · ${formatIngredientLineDisplay(line)}` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {optionalLines.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Opcionales</div>
                              {excludedNames.length > 0 && (
                                <span className="text-[10px] font-medium text-rose-500 truncate">
                                  Sin: {excludedNames.join(", ")}
                                </span>
                              )}
                            </div>

                            <div className="grid gap-2">
                              {optionalLines.map((line) => {
                                const checked = !draftExcluded.includes(line.ingredientId);
                                return (
                                  <label
                                    key={line.ingredientId}
                                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${checked
                                        ? "border-emerald-100 bg-emerald-50/50"
                                        : "border-neutral-100 bg-neutral-50"
                                      } ${isEditableLine ? "cursor-pointer" : "cursor-default opacity-80"}`}
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-medium text-neutral-700">
                                        {line.ingredient.name}
                                      </span>
                                      <span className="block text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                                        {formatIngredientLineDisplay(line)}
                                      </span>
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!isEditableLine || savingItemId === it.orderItemId}
                                      onChange={() => toggleOptionalIngredient(lineKey, line.ingredientId)}
                                      className="h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                  </label>
                                );
                              })}
                            </div>

                            {isDirty && isEditableLine && it.orderItemId && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleSaveOptionalIngredients(it.orderItemId!, lineKey)}
                                  disabled={savingItemId === it.orderItemId}
                                  className="h-8 rounded-full bg-emerald-600 px-3 text-[10px] font-semibold uppercase tracking-widest text-white shadow-sm shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {savingItemId === it.orderItemId ? "Guardando..." : "Guardar cambios"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {sale.items.length === 0 && (
              <div className="text-center py-8 opacity-40">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Sin items registrados</p>
              </div>
            )}
          </div>

          {optionalError && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{optionalError}</span>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 bg-white border-t border-neutral-100/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-medium text-neutral-400 uppercase tracking-widest leading-none mb-1">Total Venta</span>
              <span className="text-xl font-semibold text-neutral-900 leading-none truncate">${formatMoney(total)}</span>
            </div>

            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  onClick={handleCancelAction}
                  disabled={confirming}
                  className="h-10 px-4 rounded-full border border-rose-100 text-rose-500 font-medium text-[11px] uppercase tracking-widest hover:bg-rose-50 transition active:scale-95 whitespace-nowrap disabled:opacity-50"
                >
                  Eliminar
                </button>
              )}

              {canConfirm && onConfirm ? (
                <button
                  onClick={handleConfirmAction}
                  disabled={confirming}
                  className="h-10 px-6 rounded-full bg-emerald-600 text-white font-medium text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 flex items-center justify-center min-w-[100px] whitespace-nowrap"
                >
                  {confirming ? <Loader2 className="animate-spin" size={16} /> : "Confirmar"}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="h-10 px-6 rounded-full bg-neutral-900 text-white font-medium text-[11px] uppercase tracking-widest hover:brightness-110 transition active:scale-95 whitespace-nowrap"
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
