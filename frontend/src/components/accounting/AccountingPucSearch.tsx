"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchPuc, type PucSearchResult } from "@/src/services/puc";
import type { AccountingFormState } from "@/src/types/accounting-form";

type Props = {
  value: AccountingFormState;
  onChange: React.Dispatch<React.SetStateAction<AccountingFormState>>;
};

export function AccountingPucSearch({ value, onChange }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<PucSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setSearchTerm("");
    setResults([]);
    setActiveIndex(0);
    setHasSearched(false);
    setIsInteracting(false);
  }, [value.id, value.pucCode]);

  useEffect(() => {
    const trimmedQuery = searchTerm.trim();

    if (!trimmedQuery || !isInteracting) {
      setResults([]);
      setActiveIndex(0);
      setHasSearched(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await searchPuc(trimmedQuery);

        if (requestIdRef.current !== currentRequestId) return;

        setResults(res);
        setActiveIndex(0);
        setHasSearched(true);
      } catch (error) {
        if (requestIdRef.current !== currentRequestId) return;
        console.error("Error buscando PUC", error);
        setResults([]);
        setActiveIndex(0);
        setHasSearched(true);
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isInteracting, searchTerm]);

  const handleSelect = (result: PucSearchResult) => {
    onChange((prev) => ({
      ...prev,
      selectedPuc:
        result.kind === "CUENTA"
          ? {
              level: "account",
              id: result.code,
              code: result.code,
              name: result.name,
            }
          : {
              level: "subaccount",
              id: result.code,
              code: result.code,
              name: result.name,
            },
      pucCuentaCode: result.kind === "CUENTA" ? result.code : "",
      pucSubcuentaId: result.kind === "SUBCUENTA" ? result.code : "",
      pucKind: result.kind,
      pucCode: result.code,
      pucName: result.name,
    }));

    setSearchTerm("");
    setResults([]);
    setActiveIndex(0);
    setHasSearched(false);
    setIsInteracting(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      handleSelect(results[activeIndex]);
    }
  };

  const showResults = isInteracting && results.length > 0;
  const showEmptyState =
    isInteracting &&
    hasSearched &&
    !loading &&
    searchTerm.trim() &&
    results.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-neutral-600">Codigo PUC</span>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onFocus={() => setIsInteracting(true)}
            onChange={(e) => {
              setIsInteracting(true);
              setSearchTerm(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={value.pucCode ? "Buscar otro PUC..." : "Ej. 4235, 423595 o Servicios"}
            className="min-w-0 flex-1 border-none bg-transparent px-2 py-2 text-sm focus:outline-none"
          />

          <button
            type="button"
            onClick={() => {
              if (results[activeIndex]) {
                handleSelect(results[activeIndex]);
              } else {
                setIsInteracting(true);
              }
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {loading ? "Buscando" : "Elegir"}
            </span>
          </button>
        </div>

        {value.pucCode && (
          <div className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <div className="font-semibold">
              {value.pucCode} <span className="ml-1 text-[10px]">{value.pucKind}</span>
            </div>
            <div className="break-words leading-5">{value.pucName}</div>
          </div>
        )}

        {showResults && (
          <div className="mt-2 max-h-48 overflow-auto rounded-2xl border border-neutral-200 bg-white">
            {results.map((result, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={`${result.kind}-${result.code}`}
                  type="button"
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-start gap-3 px-3 py-2 text-left ${
                    isActive ? "bg-emerald-50" : "hover:bg-emerald-50"
                  }`}
                >
                  <span className="shrink-0 text-sm font-semibold text-neutral-800">
                    {result.code}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm leading-5 text-neutral-600">
                      {result.name}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      {result.kind}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showEmptyState && (
          <div className="mt-2 rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-500">
            No se encontraron cuentas o subcuentas para esa busqueda.
          </div>
        )}
      </div>
    </div>
  );
}
