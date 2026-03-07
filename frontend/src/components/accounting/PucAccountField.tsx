"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectedPucOption } from "@/src/types/accounting-sales-templates";
import { searchPuc as searchPucService } from "@/src/services/accounting";

type Props = {
  label: string;
  helper?: string;
  placeholder?: string;
  value: SelectedPucOption | null;
  onChange: (v: SelectedPucOption | null) => void;
  disabled?: boolean;
  error?: string | null;
};

type SearchResult = {
  code: string;
  name: string;
  kind: "CUENTA" | "SUBCUENTA";
};

const inputBase =
  "w-full rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm outline-none focus:border-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed";

function formatOption(o: SelectedPucOption | null) {
  if (!o) return "";
  return `${o.code} — ${o.name}`;
}

export function PucAccountField({
  label,
  helper,
  placeholder = "Buscar por código o nombre...",
  value,
  onChange,
  disabled = false,
  error = null,
}: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(formatOption(value));
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q || disabled) {
      setResults([]);
      setLoading(false);
      return;
    }

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const found = await searchPucService(q);
        const mapped: SearchResult[] = (found ?? []).map((x) => ({
          code: x.code,
          name: x.name,
          kind: x.kind,
        }));
        setResults(mapped);
        setOpen(true);
      } catch (e) {
        console.error(e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(t);
  }, [query, disabled]);

  function handleSelect(option: SearchResult) {
    onChange(option);
    setQuery(formatOption(option));
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          placeholder={placeholder}
          className={inputBase}
          disabled={disabled}
        />

        {(query || value) && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
            aria-label="Limpiar"
          >
            ×
          </button>
        ) : null}

        {open && (
          <div className="absolute left-0 right-0 mt-2 z-20 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
            <div className="px-3 py-2 text-xs text-gray-500 flex items-center justify-between">
              <span>{loading ? "Buscando..." : "Resultados"}</span>
              {value ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-emerald-700 font-semibold"
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            {results.length === 0 ? (
              <div className="px-3 pb-3 text-sm text-gray-500">
                {query.trim() ? "Sin resultados" : "Escribí para buscar"}
              </div>
            ) : (
              <div className="max-h-56 overflow-auto">
                {results.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full text-left px-3 py-3 border-t border-gray-100 hover:bg-gray-50"
                  >
                    <div className="text-sm font-semibold text-gray-900">
                      {r.code} — {r.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.kind === "SUBCUENTA" ? "Subcuenta" : "Cuenta"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {helper && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}

export type { SelectedPucOption };
