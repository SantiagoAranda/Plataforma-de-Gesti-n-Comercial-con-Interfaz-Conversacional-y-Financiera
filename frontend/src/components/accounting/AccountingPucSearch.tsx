"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { searchPuc, type PucSearchResult } from "@/src/services/puc";
import type { AccountingFormState } from "@/src/types/accounting-form";

type Props = {
  value: AccountingFormState;
  onChange: React.Dispatch<React.SetStateAction<AccountingFormState>>;
};

export function AccountingPucSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value.pucCode || "");
  const [results, setResults] = useState<PucSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(value.pucCode || "");
  }, [value.pucCode]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      const res = await searchPuc(query);
      setResults(res.filter((r) => r.kind === "SUBCUENTA"));
    } catch (error) {
      console.error("Error buscando PUC", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (r: PucSearchResult) => {
    onChange((prev) => ({
      ...prev,
      pucSubcuentaId: r.code,
      pucCode: r.code,
      pucName: r.name,
    }));
    setQuery(r.code);
    setResults([]);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-neutral-600">Código PUC</span>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej. 110505"
            className="min-w-0 flex-1 border-none bg-transparent px-2 py-2 text-sm focus:outline-none"
          />

          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {loading ? "Buscando" : "Buscar"}
            </span>
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-2 max-h-40 overflow-auto rounded-2xl border border-neutral-200 bg-white">
            {results.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-emerald-50"
              >
                <span className="shrink-0 text-sm font-semibold text-neutral-800">
                  {r.code}
                </span>

                <span className="min-w-0 break-words text-sm leading-5 text-neutral-600">
                  {r.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {value.pucCode && (
          <div className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <div className="font-semibold">{value.pucCode}</div>
            <div className="break-words leading-5">{value.pucName}</div>
          </div>
        )}
      </div>
    </div>
  );
}