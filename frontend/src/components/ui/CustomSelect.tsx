"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
};

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  disabled = false,
  className,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
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
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[100] max-h-60 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-150 custom-scrollbar">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-center text-xs font-medium text-slate-400">
              No hay opciones disponibles
            </div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer select-none",
                    isSelected
                      ? "bg-[#0B3F64]/8 text-[#0B3F64] font-semibold"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <span className="truncate">
                    {option.label}
                    {option.sublabel && (
                      <span className="ml-1.5 text-xs text-slate-400 font-normal">
                        ({option.sublabel})
                      </span>
                    )}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-[#0B3F64]" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
