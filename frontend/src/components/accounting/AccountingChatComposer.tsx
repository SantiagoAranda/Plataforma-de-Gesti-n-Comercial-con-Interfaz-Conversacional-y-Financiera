"use client";

import { Plus, Search, Send, X } from "lucide-react";
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import type { AccountingFormState } from "@/src/types/accounting-form";
import { AccountingExpandableForm } from "./AccountingExpandableForm";

type AccountingFormErrors = {
  puc?: string;
  date?: string;
  amount?: string;
  nature?: string;
};

export interface SearchFilters {
  mode: 'text' | 'price';
  query?: string;
  priceMin?: number;
  priceMax?: number;
}

type Props = {
  value: AccountingFormState;
  errors: AccountingFormErrors;
  expanded: boolean;
  isEditing: boolean;
  onOpenComposer: () => void;
  onChange: Dispatch<SetStateAction<AccountingFormState>>;
  onSearchChange: (filters: SearchFilters) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function AccountingChatComposer({
  value,
  errors,
  expanded,
  isEditing,
  onOpenComposer,
  onChange,
  onSearchChange,
  onCancel,
  onSubmit,
}: Props) {
  const isComposeMode = expanded;
  const lockFinancialFields = isEditing && value.originType !== "MANUAL";

  const [localSearch, setLocalSearch] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = localSearch.trim();
      if (!trimmed) {
        setIsError(false);
        onSearchChange({ mode: 'text', query: '' });
        return;
      }

      // Range Match (e.g., 1000 - 5000, $1000 - $5000)
      const rangeMatch = trimmed.match(/^\$?\s*(\d+(?:\.\d+)?)\s*-\s*\$?\s*(\d+(?:\.\d+)?)$/);
      if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        if (min > max) {
          setIsError(true);
        } else {
          setIsError(false);
        }
        onSearchChange({ mode: 'price', priceMin: min, priceMax: max });
        return;
      }

      // Single Price Match (e.g., $4000)
      const singlePriceMatch = trimmed.match(/^\$\s*(\d+(?:\.\d+)?)$/);
      if (singlePriceMatch) {
        setIsError(false);
        onSearchChange({ mode: 'price', priceMax: parseFloat(singlePriceMatch[1]) });
        return;
      }

      // Text / PUC Match
      setIsError(false);
      onSearchChange({ mode: 'text', query: trimmed });
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange]);

  const handleClear = () => {
    setLocalSearch("");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-4 pt-2 sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {expanded && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-10">
              <AccountingExpandableForm
                value={value}
                errors={errors}
                onChange={onChange}
                lockFinancialFields={lockFinancialFields}
              />
            </div>
          )}

          <div className="relative z-20 rounded-[28px] bg-white p-2 shadow-[0_-6px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={expanded ? onCancel : onOpenComposer}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200"
                aria-label={
                  expanded
                    ? isEditing
                      ? "Cancelar edicion"
                      : "Cancelar creacion"
                    : "Crear asiento contable"
                }
              >
                {expanded ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </button>

              <div 
                className={`min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-3 ring-1 transition-colors ${
                  isError ? "ring-red-300" : "ring-neutral-200"
                }`}
              >
                {isComposeMode ? (
                  <input
                    type="text"
                    value={value.detail}
                    onChange={(e) =>
                      onChange((prev) => ({ ...prev, detail: e.target.value }))
                    }
                    placeholder={
                      isEditing
                        ? "Edita la descripcion del movimiento (opcional)..."
                        : "Describi el movimiento contable (opcional)..."
                    }
                    className="w-full border-none bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Search className={`h-4 w-4 shrink-0 transition-colors ${isError ? "text-red-400" : "text-neutral-400"}`} />
                    <input
                      type="text"
                      value={localSearch}
                      onChange={(e) => setLocalSearch(e.target.value)}
                      placeholder="Buscar por cuenta PUC o por precio (ej: $1000 o 1000-5000)..."
                      className="w-full border-none bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                    />
                    {localSearch && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 transition hover:bg-neutral-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onSubmit}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600"
                aria-label={expanded ? "Confirmar movimiento" : "Buscar"}
              >
                {expanded ? (
                  <Send className="h-4 w-4" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
