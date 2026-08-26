"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type CustomSelectOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type Props = {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  dropdownPosition?: "auto" | "top" | "bottom";
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  disabled = false,
  className,
  id,
  searchable = false,
  searchPlaceholder = "Buscar...",
  emptyText = "No hay opciones disponibles",
  dropdownPosition = "auto",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [openAbove, setOpenAbove] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const filteredOptions = useMemo(() => {
    const query = normalizeSearchValue(searchTerm.trim());
    if (!query) return options;
    return options.filter((option) =>
      normalizeSearchValue(`${option.label} ${option.sublabel ?? ""}`).includes(query),
    );
  }, [options, searchTerm]);

  const openDropdown = () => {
    if (disabled) return;
    if (!isOpen) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (dropdownPosition === "top") {
        setOpenAbove(true);
      } else if (dropdownPosition === "bottom") {
        setOpenAbove(false);
      } else if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setOpenAbove(spaceBelow < 300 && spaceAbove > spaceBelow);
      }
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      return;
    }
    if (searchable) window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [isOpen, searchable]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={openDropdown}
        className={cn(
          "flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm transition-all duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          isOpen
            ? "border-[#0B3F64] ring-2 ring-[#0B3F64]/15 shadow-md"
            : "hover:border-slate-300 hover:bg-slate-50/50",
          className
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-slate-400")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            isOpen && "rotate-180 text-[#0B3F64]"
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "absolute left-0 right-0 z-[100] overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-150",
            openAbove
              ? "bottom-[calc(100%+6px)] origin-bottom"
              : "top-[calc(100%+6px)] origin-top",
          )}
        >
          {searchable && (
            <div className="mb-1.5 flex h-10 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-100 focus-within:ring-[#0B3F64]/30">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-center text-xs font-medium text-slate-400">
              {emptyText}
            </div>
          ) : (
            <div role="listbox" className="max-h-56 overflow-y-auto overscroll-contain custom-scrollbar">
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      isSelected
                        ? "bg-[#0B3F64]/8 font-semibold text-[#0B3F64]"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    <span className="truncate">
                      {option.label}
                      {option.sublabel && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          ({option.sublabel})
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-[#0B3F64]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
