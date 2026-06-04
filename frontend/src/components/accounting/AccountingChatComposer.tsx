"use client";

import { Search, X } from "lucide-react";
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import type { AccountingFormState } from "@/src/types/accounting-form";
import { AccountingExpandableForm } from "./AccountingExpandableForm";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

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
    <div className="fixed inset-x-0 bottom-0 z-30 bg-white px-4 pb-3 pt-2 lg:left-[408px] lg:right-0">
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

          <WhatsappComposer
            value={isComposeMode ? value.detail : localSearch}
            onChange={
              isComposeMode
                ? (next) => onChange((prev) => ({ ...prev, detail: next }))
                : setLocalSearch
            }
            onPlusClick={expanded ? onCancel : onOpenComposer}
            onSubmit={onSubmit}
            placeholder={
              isComposeMode
                ? isEditing
                  ? "Edita la descripcion del movimiento (opcional)..."
                  : "Describi el movimiento contable (opcional)..."
                : "Buscar por cuenta PUC o por precio (ej: $1000 o 1000-5000)..."
            }
            leftIconVariant={expanded ? "x" : "plus"}
            rightIconVariant={expanded ? "send" : "search"}
            hasError={isError}
            leadingIcon={
              !isComposeMode ? (
                <Search className={`h-4 w-4 shrink-0 transition-colors ${isError ? "text-red-400" : "text-neutral-400"}`} />
              ) : null
            }
            trailingContent={
              !isComposeMode && localSearch ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 transition hover:bg-neutral-300"
                  aria-label="Limpiar busqueda"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null
            }
            plusAriaLabel={
              expanded
                ? isEditing
                  ? "Cancelar edicion"
                  : "Cancelar creacion"
                : "Crear asiento contable"
            }
            submitAriaLabel={expanded ? "Confirmar movimiento" : "Buscar"}
          />
        </div>
      </div>
    </div>
  );
}
