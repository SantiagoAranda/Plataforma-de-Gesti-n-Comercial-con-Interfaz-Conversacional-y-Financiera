"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

type ItemOption = {
  id: string;
  name: string;
};

type Props = {
  value: string;
  onChange: (val: string) => void;
  options: ItemOption[];
  placeholder?: string;
  disabled?: boolean;
};

export default function ItemSelector({ value, onChange, options, placeholder = "Seleccionar...", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex w-full min-h-[44px] items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-semibold text-neutral-800 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
      >
        <span className="truncate">{selected ? selected.name : <span className="text-neutral-400">{placeholder}</span>}</span>
        <ChevronDown size={16} className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 flex max-h-60 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex shrink-0 items-center gap-2 border-b border-neutral-100 px-3 py-2">
            <Search size={16} className="text-neutral-400" />
            <input
              type="text"
              autoFocus
              className="flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400 font-medium"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs font-semibold text-neutral-400">
                No se encontraron resultados
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-emerald-50 ${
                    value === opt.id ? "text-emerald-700 bg-emerald-50/50" : "text-neutral-700"
                  }`}
                >
                  <span className="truncate">{opt.name}</span>
                  {value === opt.id && <Check size={16} className="shrink-0 text-emerald-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
