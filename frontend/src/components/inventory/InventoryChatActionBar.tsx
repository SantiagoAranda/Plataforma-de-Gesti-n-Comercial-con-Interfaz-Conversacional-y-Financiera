"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ClipboardList, PackageSearch, Plus, RotateCcw, Search, Send, X } from "lucide-react";

import { cn } from "@/src/lib/utils";

export type InventoryChatMenuAction = "INGREDIENTES" | "KARDEX" | "RECETAS" | "PURCHASE_RETURN";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPickAction: (action: InventoryChatMenuAction) => void;
  placeholder?: string;
  helperText?: string | null;
};

const MENU: Array<{
  action: InventoryChatMenuAction;
  label: string;
  icon: typeof Plus;
  tone: string;
}> = [
  { action: "INGREDIENTES", label: "Ingredientes", icon: ClipboardList, tone: "bg-emerald-50 text-emerald-700" },
  { action: "KARDEX", label: "Kardex", icon: PackageSearch, tone: "bg-sky-50 text-sky-700" },
  { action: "RECETAS", label: "Recetas", icon: BookOpen, tone: "bg-amber-50 text-amber-800" },
  { action: "PURCHASE_RETURN", label: "Devolución de compras", icon: RotateCcw, tone: "bg-neutral-100 text-neutral-700" },
];

export function InventoryChatActionBar({
  value,
  onChange,
  onSubmit,
  onPickAction,
  placeholder,
  helperText,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const rightIcon = useMemo(() => {
    return value.trim() ? Send : Search;
  }, [value]);

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
          {menuOpen && (
            <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 overflow-hidden rounded-[24px] border border-neutral-200 bg-white p-3 shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom-4 duration-200">
              <div className="space-y-2">
                {MENU.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.action}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onPickAction(item.action);
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
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95 border border-neutral-200/60"
                aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </button>

              <div className="min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-2.5 ring-1 ring-neutral-200/60 flex items-center">
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSubmit();
                    }
                  }}
                  placeholder={placeholder ?? "Buscar o crear en inventario..."}
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-neutral-400"
                />
              </div>

              <button
                type="button"
                onClick={onSubmit}
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
