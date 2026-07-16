"use client";

import { Check, ChevronDown, Plus, Search, Save } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { AccountingFormState } from "@/src/types/accounting-form";
import { AccountingExpandableForm } from "./AccountingExpandableForm";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

type AccountingFormErrors = {
  puc?: string;
  date?: string;
  amount?: string;
  nature?: string;
};

export type SearchMode = "PUC" | "TEXT" | "AMOUNT";
export type NatureFilter = "ALL" | "DEBIT" | "CREDIT";

export interface SearchFilters {
  mode: SearchMode;
  nature: NatureFilter;
  query: string;
}

const SEARCH_MODES: Array<{
  value: SearchMode;
  label: string;
  shortLabel: string;
  placeholder: string;
}> = [
  { value: "PUC", label: "PUC", shortLabel: "PUC", placeholder: "Buscar por cuenta PUC..." },
  { value: "TEXT", label: "Textos", shortLabel: "Texto", placeholder: "Buscar por descripcion o cuenta..." },
  { value: "AMOUNT", label: "Montos", shortLabel: "Monto", placeholder: "Buscar por monto o rango..." },
];

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
  const lockFinancialFields = isEditing && value.originType !== "MANUAL";
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("PUC");
  const [natureFilter, setNatureFilter] = useState<NatureFilter>("ALL");
  const [isSearchModeOpen, setIsSearchModeOpen] = useState(false);

  const currentSearchMode =
    SEARCH_MODES.find((mode) => mode.value === searchMode) ?? SEARCH_MODES[0];
  const hasActiveFilters =
    query.trim() !== "" || searchMode !== "PUC" || natureFilter !== "ALL";

  useEffect(() => {
    onSearchChange({
      mode: searchMode,
      nature: natureFilter,
      query,
    });
  }, [natureFilter, onSearchChange, query, searchMode]);

  function toggleNatureFilter(next: Exclude<NatureFilter, "ALL">) {
    setNatureFilter((current) => (current === next ? "ALL" : next));
  }

  function clearFilters() {
    setQuery("");
    setSearchMode("PUC");
    setNatureFilter("ALL");
    setIsSearchModeOpen(false);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearchModeOpen(false);
    inputRef.current?.blur();
    onSubmit();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-3 py-3 shadow-[0_-8px_30px_rgb(0,0,0,0.02)] backdrop-blur lg:left-[408px] lg:right-0">
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

          {expanded ? (
            <WhatsappComposer
              value={value.detail}
              onChange={(next) => onChange((prev) => ({ ...prev, detail: next }))}
              onPlusClick={onCancel}
              onSubmit={onSubmit}
              placeholder={
                isEditing
                  ? "Edita la descripcion del movimiento (opcional)..."
                  : "Describi el movimiento contable (opcional)..."
              }
              leftIconVariant="x"
              rightIconVariant="send"
              className="rounded-[24px] border border-slate-200 bg-white p-1 shadow-sm"
              rightButtonClassName="h-12 w-12 shrink-0 flex items-center justify-center bg-[#0B3F64] text-white rounded-2xl shadow-sm hover:bg-[#0B3F64]/90 active:scale-95 transition"
              rightIcon={<Save className="h-5 w-5" />}
              plusAriaLabel={isEditing ? "Cancelar edicion" : "Cancelar creacion"}
              submitAriaLabel="Confirmar movimiento"
            />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
              <form className="flex min-w-0 items-center gap-2" onSubmit={handleSearchSubmit}>
                <button
                  type="button"
                  onClick={onOpenComposer}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100/80 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3F64]/30 active:scale-95"
                  aria-label="Crear asiento contable"
                >
                  <Plus className="h-5 w-5" />
                </button>

                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={currentSearchMode.placeholder}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSearchModeOpen((current) => !current)}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-3 sm:text-xs"
                    aria-label="Tipo de busqueda"
                  >
                    <span className="hidden sm:inline">{currentSearchMode.label}</span>
                    <span className="sm:hidden">{currentSearchMode.shortLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {isSearchModeOpen && (
                    <div className="absolute bottom-full right-0 z-30 mb-2 w-56 rounded-2xl border border-slate-200 bg-white p-1 shadow-lg">
                      {SEARCH_MODES.map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => {
                            setSearchMode(mode.value);
                            setIsSearchModeOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          <span>{mode.label}</span>
                          {searchMode === mode.value && (
                            <Check className="h-4 w-4 text-emerald-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0B3F64] text-white transition hover:bg-[#0B3F64]/90 focus:outline-none focus:ring-2 focus:ring-[#0B3F64]/35 active:scale-95"
                  aria-label="Buscar"
                >
                  <Search className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-2 flex flex-wrap items-center gap-2 px-1 sm:pl-12 sm:pr-2">
                <button
                  type="button"
                  onClick={() => toggleNatureFilter("DEBIT")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    natureFilter === "DEBIT"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Débito
                </button>
                <button
                  type="button"
                  onClick={() => toggleNatureFilter("CREDIT")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    natureFilter === "CREDIT"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Crédito
                </button>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-full px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
