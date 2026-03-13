"use client";

import { Plus, Search, Send, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AccountingFormState } from "@/src/types/accounting-form";
import { AccountingExpandableForm } from "./AccountingExpandableForm";

type Props = {
  value: AccountingFormState;
  expanded: boolean;
  isEditing: boolean;
  searchValue: string;
  onOpenComposer: () => void;
  onChange: Dispatch<SetStateAction<AccountingFormState>>;
  onSearchChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function AccountingChatComposer({
  value,
  expanded,
  isEditing,
  searchValue,
  onOpenComposer,
  onChange,
  onSearchChange,
  onCancel,
  onSubmit,
}: Props) {
  const isComposeMode = expanded;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-4 pt-2 sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {expanded && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-10">
              <AccountingExpandableForm value={value} onChange={onChange} />
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
                      ? "Cancelar edición"
                      : "Cancelar creación"
                    : "Crear asiento contable"
                }
              >
                {expanded ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </button>

              <div className="min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-3 ring-1 ring-neutral-200">
                {isComposeMode ? (
                  <input
                    type="text"
                    value={value.detail}
                    onChange={(e) =>
                      onChange((prev) => ({ ...prev, detail: e.target.value }))
                    }
                    placeholder={
                      isEditing
                        ? "Editá la descripción del movimiento..."
                        : "Describí el movimiento contable..."
                    }
                    className="w-full border-none bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder="Buscar asientos contables..."
                      className="w-full border-none bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                    />
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