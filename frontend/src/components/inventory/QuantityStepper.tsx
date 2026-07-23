"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/src/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unitLabel?: string;
  precision?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function getStepAndPrecisionForUnit(unitSymbolOrName?: string | null): { step: number; precision: number } {
  if (!unitSymbolOrName) return { step: 1, precision: 6 };
  const normalized = unitSymbolOrName.trim().toLowerCase();
  if (
    normalized === "kg" ||
    normalized === "kilo" ||
    normalized === "kilogramo" ||
    normalized === "l" ||
    normalized === "lt" ||
    normalized === "litro"
  ) {
    return { step: 0.01, precision: 6 };
  }
  return { step: 1, precision: 6 };
}

function roundToPrecision(val: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
}

function formatDisplayValue(val: number, precision: number): string {
  if (!Number.isFinite(val)) return "0";
  const rounded = roundToPrecision(val, precision);
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  }).format(rounded);
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unitLabel,
  precision = 6,
  disabled = false,
  ariaLabel = "Control numérico",
  className,
}: QuantityStepperProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(roundToPrecision(value, precision)));
    }
  }, [value, precision, isEditing]);

  const handleStartEdit = () => {
    if (disabled) return;
    setInputValue(String(roundToPrecision(value, precision)).replace(".", ","));
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleCommitEdit = () => {
    setIsEditing(false);
    const normalizedStr = inputValue.trim().replace(",", ".");

    if (normalizedStr === "") {
      // Revert to current value
      setInputValue(String(roundToPrecision(value, precision)));
      return;
    }

    const num = Number(normalizedStr);
    if (!Number.isFinite(num)) {
      // Revert
      setInputValue(String(roundToPrecision(value, precision)));
      return;
    }

    let clamped = roundToPrecision(num, precision);
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;

    onChange(clamped);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
      setInputValue(String(roundToPrecision(value, precision)));
    }
  };

  const handleDecrement = () => {
    if (disabled) return;
    const current = Number.isFinite(value) ? value : min;
    let next = roundToPrecision(current - step, precision);
    if (min !== undefined && next < min) next = min;
    onChange(next);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const current = Number.isFinite(value) ? value : min;
    let next = roundToPrecision(current + step, precision);
    if (max !== undefined && next > max) next = max;
    onChange(next);
  };

  const isAtMin = min !== undefined && value <= min;
  const isAtMax = max !== undefined && value >= max;

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <div className="flex items-center rounded-lg border border-slate-200 bg-white h-7.5 overflow-hidden">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || isAtMin}
          aria-label={`Disminuir cantidad para ${ariaLabel}`}
          className="flex h-full w-7 items-center justify-center text-sm font-normal text-[#c80237] transition hover:bg-slate-50 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
        >
          −
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleCommitEdit}
            onKeyDown={handleKeyDown}
            aria-label={`Editar cantidad para ${ariaLabel}`}
            className="h-full w-14 bg-transparent text-center text-xs font-medium text-black outline-none ring-1 ring-[#0b3f64] px-1"
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            disabled={disabled}
            aria-label={`Editar cantidad para ${ariaLabel}`}
            className="flex h-full min-w-[2.5rem] px-2 items-center justify-center text-xs font-medium text-black transition hover:bg-slate-50 active:scale-95"
          >
            {formatDisplayValue(value, precision)}
          </button>
        )}

        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || isAtMax}
          aria-label={`Aumentar cantidad para ${ariaLabel}`}
          className="flex h-full w-7 items-center justify-center text-sm font-normal text-[#00963d] transition hover:bg-slate-50 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
        >
          +
        </button>
      </div>

      {unitLabel && (
        <span className="text-xs font-normal text-black select-none">
          {unitLabel}
        </span>
      )}
    </div>
  );
}
