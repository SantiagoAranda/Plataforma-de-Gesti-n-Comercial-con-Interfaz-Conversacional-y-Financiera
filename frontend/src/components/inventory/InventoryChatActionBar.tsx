"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  PackageSearch,
  Plus,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/src/lib/utils";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

export type InventoryChatMenuAction =
  | "CREATE_INGREDIENT"
  | "REGISTER_PURCHASE"
  | "REGISTER_PURCHASE_RETURN"
  | "INGREDIENTES"
  | "KARDEX"
  | "RECETAS";

export type InventoryChatActionBarProps = {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  helperText?: string | null;
  onPickAction?: (action: InventoryChatMenuAction) => void;
  onCreateIngredient?: () => void;
  onRegisterPurchase?: () => void;
  onRegisterPurchaseReturn?: () => void;
  createIngredientActive?: boolean;

  // New props for custom form control
  isCreatingIngredient?: boolean;
  isFormValid?: boolean;
  isSubmittingIngredient?: boolean;
  onCancelCreate?: () => void;
  onSaveCreate?: () => void;
};

const MENU: Array<{
  action: InventoryChatMenuAction;
  label: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    action: "CREATE_INGREDIENT",
    label: "Nuevo ingrediente",
    icon: SlidersHorizontal,
    tone: "bg-emerald-50 text-emerald-700",
  },
  { action: "REGISTER_PURCHASE", label: "Cargar compra", icon: TrendingUp, tone: "bg-sky-50 text-sky-700" },
  {
    action: "REGISTER_PURCHASE_RETURN",
    label: "Devolver compra",
    icon: RotateCcw,
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
  placeholder,
  helperText,
  onPickAction,
  onCreateIngredient,
  onRegisterPurchase,
  onRegisterPurchaseReturn,
  createIngredientActive = false,
  isCreatingIngredient = false,
  isFormValid = false,
  isSubmittingIngredient = false,
  onCancelCreate,
  onSaveCreate,
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
      if (item.action === "INGREDIENTES") return !!onPickAction;
      if (item.action === "KARDEX") return !!onPickAction;
      if (item.action === "RECETAS") return !!onPickAction;
      return false;
    });
  }, [onCreateIngredient, onRegisterPurchase, onRegisterPurchaseReturn, onPickAction]);

  const hasMenu = availableMenu.length > 0;
  const onlyCreateIngredient =
    hasMenu && availableMenu.length === 1 && availableMenu[0]?.action === "CREATE_INGREDIENT";

  const runAction = (action: InventoryChatMenuAction) => {
    if (action === "CREATE_INGREDIENT") return onCreateIngredient?.();
    if (action === "REGISTER_PURCHASE") return onRegisterPurchase?.();
    if (action === "REGISTER_PURCHASE_RETURN") return onRegisterPurchaseReturn?.();
    return handlePick(action);
  };

  const RightIcon = useMemo(() => {
    return effectiveValue.trim() ? Send : Search;
  }, [effectiveValue]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isCreatingIngredient) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-3 py-3 shadow-[0_-8px_30px_rgb(0,0,0,0.02)] backdrop-blur lg:left-[408px] lg:right-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {menuOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <div className="mx-auto w-full max-w-md">
        <div className="relative">
          {menuOpen && hasMenu && !onlyCreateIngredient && (
            <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom-4 duration-200">
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
                        <span className="block truncate text-sm font-medium text-neutral-900">{item.label}</span>
                        <span className="mt-0.5 block text-[11px] font-medium text-neutral-400">Abrir</span>
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-300">&rarr;</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            <form
              className="flex min-w-0 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                aria-label={
                  onlyCreateIngredient && onCreateIngredient
                    ? "Nuevo ingrediente"
                    : menuOpen
                      ? "Cerrar menú"
                      : "Abrir menú"
                }
              >
                {onlyCreateIngredient && onCreateIngredient ? (
                  createIngredientActive ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />
                ) : menuOpen && hasMenu ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </button>

              <input
                ref={inputRef}
                value={effectiveValue}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={placeholder ?? "Buscar ingrediente o producto..."}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />

              <button
                type="submit"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0B3F64] text-white transition hover:bg-[#0B3F64]/90 focus:outline-none focus:ring-2 focus:ring-[#0B3F64]/35 active:scale-95"
                aria-label="Buscar"
              >
                <RightIcon className="h-4 w-4" />
              </button>
            </form>
          </div>

          {helperText ? (
            <div className="text-[10px] text-neutral-400 font-medium text-center mt-4 uppercase tracking-widest opacity-70">
              {helperText}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
