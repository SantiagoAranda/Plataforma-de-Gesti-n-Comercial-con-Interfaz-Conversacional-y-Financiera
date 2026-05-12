"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  PackageSearch,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { cn } from "@/src/lib/utils";

export type InventoryChatMenuAction =
  | "INGREDIENTES"
  | "KARDEX"
  | "RECETAS"
  | "CREATE_INGREDIENT"
  | "REGISTER_PURCHASE"
  | "REGISTER_PURCHASE_RETURN"
  | "REGISTER_ADJUSTMENT_POSITIVE"
  | "REGISTER_ADJUSTMENT_NEGATIVE"
  | "REGISTER_INITIAL";

export type InventoryChatActionBarProps = {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onPickAction?: (action: InventoryChatMenuAction) => void;
  placeholder?: string;
  helperText?: string | null;
  onCreateIngredient?: () => void;
  onRegisterPurchase?: () => void;
  onRegisterPurchaseReturn?: () => void;
  onRegisterPositiveAdjustment?: () => void;
  onRegisterNegativeAdjustment?: () => void;
  onRegisterInitial?: () => void;
};

const MENU: Array<{
  action: InventoryChatMenuAction;
  label: string;
  icon: typeof Plus;
  tone: string;
}> = [
  { action: "CREATE_INGREDIENT", label: "Crear insumo", icon: Plus, tone: "bg-emerald-50 text-emerald-700" },
  { action: "REGISTER_PURCHASE", label: "Registrar compra", icon: TrendingUp, tone: "bg-sky-50 text-sky-700" },
  {
    action: "REGISTER_PURCHASE_RETURN",
    label: "Devolución de compra",
    icon: RotateCcw,
    tone: "bg-neutral-100 text-neutral-700",
  },
  {
    action: "REGISTER_ADJUSTMENT_POSITIVE",
    label: "Ajuste positivo",
    icon: TrendingUp,
    tone: "bg-emerald-50 text-emerald-800",
  },
  {
    action: "REGISTER_ADJUSTMENT_NEGATIVE",
    label: "Ajuste negativo",
    icon: TrendingDown,
    tone: "bg-rose-50 text-rose-700",
  },
  {
    action: "REGISTER_INITIAL",
    label: "Inventario inicial",
    icon: RefreshCcw,
    tone: "bg-amber-50 text-amber-800",
  },
  { action: "INGREDIENTES", label: "Ingredientes", icon: ClipboardList, tone: "bg-emerald-50 text-emerald-700" },
  { action: "KARDEX", label: "Kardex", icon: PackageSearch, tone: "bg-sky-50 text-sky-700" },
  { action: "RECETAS", label: "Recetas", icon: BookOpen, tone: "bg-amber-50 text-amber-800" },
];

export function InventoryChatActionBar({
  value,
  onChange,
  onSubmit,
  onPickAction,
  placeholder,
  helperText,
  onCreateIngredient,
  onRegisterPurchase,
  onRegisterPurchaseReturn,
  onRegisterPositiveAdjustment,
  onRegisterNegativeAdjustment,
  onRegisterInitial,
}: InventoryChatActionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [internalValue, setInternalValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const effectiveValue = value ?? internalValue;
  const handleChange = onChange ?? setInternalValue;
  const handleSubmit = onSubmit ?? (() => {});
  const handlePick = onPickAction ?? (() => {});

  const availableMenu = useMemo(() => {
    return MENU.filter((item) => {
      if (item.action === "CREATE_INGREDIENT") return !!onCreateIngredient;
      if (item.action === "REGISTER_PURCHASE") return !!onRegisterPurchase;
      if (item.action === "REGISTER_PURCHASE_RETURN") return !!onRegisterPurchaseReturn;
      if (item.action === "REGISTER_ADJUSTMENT_POSITIVE") return !!onRegisterPositiveAdjustment;
      if (item.action === "REGISTER_ADJUSTMENT_NEGATIVE") return !!onRegisterNegativeAdjustment;
      if (item.action === "REGISTER_INITIAL") return !!onRegisterInitial;
      // Navigation actions depend on the host consuming onPickAction.
      if (item.action === "INGREDIENTES") return !!onPickAction;
      if (item.action === "KARDEX") return !!onPickAction;
      if (item.action === "RECETAS") return !!onPickAction;
      return !!onPickAction;
    });
  }, [
    onCreateIngredient,
    onRegisterPurchase,
    onRegisterPurchaseReturn,
    onRegisterPositiveAdjustment,
    onRegisterNegativeAdjustment,
    onRegisterInitial,
    onPickAction,
  ]);

  const hasMenu = availableMenu.length > 0;
  const onlyCreateIngredient =
    hasMenu && availableMenu.length === 1 && availableMenu[0]?.action === "CREATE_INGREDIENT";

  const runAction = (action: InventoryChatMenuAction) => {
    if (action === "CREATE_INGREDIENT") return onCreateIngredient?.();
    if (action === "REGISTER_PURCHASE") return onRegisterPurchase?.();
    if (action === "REGISTER_PURCHASE_RETURN") return onRegisterPurchaseReturn?.();
    if (action === "REGISTER_ADJUSTMENT_POSITIVE") return onRegisterPositiveAdjustment?.();
    if (action === "REGISTER_ADJUSTMENT_NEGATIVE") return onRegisterNegativeAdjustment?.();
    if (action === "REGISTER_INITIAL") return onRegisterInitial?.();

    return handlePick(action);
  };

  const rightIcon = useMemo(() => {
    return effectiveValue.trim() ? Send : Search;
  }, [effectiveValue]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const RightIcon = rightIcon;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 pointer-events-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {menuOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <div className="pointer-events-auto mx-auto w-full max-w-md px-3 pb-3 pt-2">
        <div className="relative">
          {menuOpen && hasMenu && !onlyCreateIngredient && (
            <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 overflow-hidden rounded-[24px] border border-neutral-200 bg-white p-3 shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom-4 duration-200">
              <div className="space-y-2">
                {availableMenu.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.action}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        runAction(item.action);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] hover:bg-neutral-50"
                    >
                      <span className={cn("grid h-10 w-10 place-items-center rounded-full", item.tone)}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-neutral-900">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-neutral-400">
                          Abrir
                        </span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                        &rarr;
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-[28px] bg-white p-2 shadow-2xl ring-1 ring-black/10 border-t border-neutral-100/50">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onlyCreateIngredient && onCreateIngredient) {
                    onCreateIngredient();
                    return;
                  }
                  if (!hasMenu) return;
                  setMenuOpen((v) => !v);
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95 border border-neutral-200/60"
                aria-label={
                  onlyCreateIngredient && onCreateIngredient
                    ? "Crear ingrediente"
                    : menuOpen
                      ? "Cerrar menú"
                      : "Abrir menú"
                }
              >
                {menuOpen && hasMenu ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </button>

              <div className="min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-2.5 ring-1 ring-neutral-200/60 flex items-center">
                <input
                  ref={inputRef}
                  value={effectiveValue}
                  onChange={(e) => handleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={placeholder ?? "Buscar o crear en inventario..."}
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-neutral-400"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl transition hover:bg-emerald-600 active:scale-90"
                aria-label="Buscar o crear"
              >
                <RightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {helperText !== null && (
            <div className="text-[9px] text-neutral-400 font-bold text-center mt-3 uppercase tracking-widest opacity-60">
              {helperText ?? "Us\u00E1 el + para acciones r\u00E1pidas o escrib\u00ED para crear un ingrediente"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
