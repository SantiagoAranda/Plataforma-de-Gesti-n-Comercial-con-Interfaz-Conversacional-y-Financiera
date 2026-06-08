"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type SearchSelectOption = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

type Props<T extends SearchSelectOption> = {
  label: ReactNode;
  value?: T | null;
  error?: string;
  placeholder: string;
  emptyText: string;
  buttonLabel?: string;
  selectedLabel?: ReactNode;
  search: (query: string) => Promise<T[]> | T[];
  onSelect: (option: T) => void;
  renderOption?: (option: T, active: boolean) => ReactNode;
  renderSelected?: (option: T) => ReactNode;
  dark?: boolean;
  labelClassName?: string;
  variant?: "default" | "encapsulated";
};

export function SearchSelect<T extends SearchSelectOption>({
  label,
  value,
  error,
  placeholder,
  emptyText,
  buttonLabel = "Elegir",
  selectedLabel,
  search,
  onSelect,
  renderOption,
  renderSelected,
  dark = false,
  labelClassName,
  variant = "default",
}: Props<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<T[]>([]);
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
  }, [value?.id]);

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
        const nextResults = await search(trimmedQuery);
        if (requestIdRef.current !== currentRequestId) return;
        setResults(nextResults);
        setActiveIndex(0);
        setHasSearched(true);
      } catch (err) {
        if (requestIdRef.current !== currentRequestId) return;
        console.error("SearchSelect search failed", err);
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
  }, [isInteracting, search, searchTerm]);

  const handleSelect = (option: T) => {
    onSelect(option);
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
      <span className={labelClassName || "text-xs font-semibold text-neutral-600"}>{label}</span>

      <div className={cn(
        "rounded-2xl transition-colors",
        variant === "encapsulated"
          ? error
            ? "border border-red-300 bg-red-50/50 p-1 pl-3"
            : "border border-transparent bg-slate-50/80 focus-within:bg-white focus-within:border-slate-100 p-1 pl-3"
          : cn(
              "border p-2",
              dark
                ? error
                  ? "border-red-500/50 bg-red-950/20"
                  : "border-slate-800 bg-slate-900/50 focus-within:border-slate-700"
                : error
                  ? "border-red-300 bg-red-50"
                  : "border-neutral-200 bg-neutral-50"
            )
      )}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onFocus={() => setIsInteracting(true)}
            onChange={(event) => {
              setIsInteracting(true);
              setSearchTerm(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "min-w-0 flex-1 border-none bg-transparent py-2 text-sm focus:outline-none focus:ring-0",
              variant === "encapsulated"
                ? "px-2 text-slate-800 placeholder:text-slate-400"
                : cn(
                    "px-2",
                    dark
                      ? "text-white placeholder-slate-500"
                      : "text-neutral-900 placeholder-neutral-400"
                  )
            )}
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
            <span className="hidden sm:inline">{loading ? "Buscando" : buttonLabel}</span>
          </button>
        </div>

        {value && (
          <div className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {selectedLabel && <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-600">{selectedLabel}</div>}
            {renderSelected ? (
              renderSelected(value)
            ) : (
              <>
                <div className="font-semibold">{value.title}</div>
                {value.subtitle && <div className="break-words leading-5">{value.subtitle}</div>}
                {value.meta && <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600">{value.meta}</div>}
              </>
            )}
          </div>
        )}

        {showResults && (
          <div className="mt-2 max-h-48 overflow-auto rounded-2xl border border-neutral-200 bg-white">
            {results.map((result, index) => {
              const active = index === activeIndex;

              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-start gap-3 px-3 py-2 text-left ${active ? "bg-emerald-50" : "hover:bg-emerald-50"}`}
                >
                  {renderOption ? (
                    renderOption(result, active)
                  ) : (
                    <>
                      <span className="shrink-0 text-sm font-semibold text-neutral-800">{result.title}</span>
                      <div className="min-w-0 flex-1">
                        {result.subtitle && <div className="break-words text-sm leading-5 text-neutral-600">{result.subtitle}</div>}
                        {result.meta && <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{result.meta}</div>}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {showEmptyState && (
          <div className="mt-2 rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-500">
            {emptyText}
          </div>
        )}
      </div>

      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </div>
  );
}
