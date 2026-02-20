"use client";

import * as React from "react";
import type { PucNode, PucKind } from "@/src/types/puc";

type Props = {
    label?: string;
    showLabel?: boolean;
    placeholder?: string;

    // el tipo elegido arriba (Activo/Pasivo/...) se convierte a kind y filtra
    kindFilter?: PucKind;

    // valor seleccionado (controlado)
    value: PucNode | null;
    onChange: (v: PucNode | null) => void;

    // datasource: en MVP podés pasar un array; luego lo cambiás a API
    items: PucNode[];

    // opcional: si querés permitir “limpiar” rápido
    allowClear?: boolean;
};

function kindChip(kind: PucKind) {
    switch (kind) {
        case "ASSET":
            return { label: "Activo", cls: "bg-blue-50 text-blue-700 border-blue-200" };
        case "LIABILITY":
            return { label: "Pasivo", cls: "bg-amber-50 text-amber-700 border-amber-200" };
        case "EQUITY":
            return { label: "Patrimonio", cls: "bg-purple-50 text-purple-700 border-purple-200" };
        case "INCOME":
            return { label: "Ingreso", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
        case "EXPENSE":
            return { label: "Gasto", cls: "bg-red-50 text-red-700 border-red-200" };
    }
}

function scoreMatch(q: string, it: PucNode) {
    // ranking simple: code exact > code prefix > name contains > breadcrumbs contains
    const qq = q.toLowerCase();
    const code = it.code.toLowerCase();
    const name = it.name.toLowerCase();
    const crumbs = it.breadcrumbs.join(" ").toLowerCase();

    if (code === qq) return 1000;
    if (code.startsWith(qq)) return 700;
    if (name.includes(qq)) return 400;
    if (crumbs.includes(qq)) return 200;
    return 0;
}

export function PucTypeahead({
    label = "CÓDIGO PUC",
    showLabel = true,
    placeholder = "Ej. 1105 o “caja”, “clientes”…",
    kindFilter,
    value,
    onChange,
    items,
    allowClear = true,
}: Props) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const boxRef = React.useRef<HTMLDivElement | null>(null);

    // Cerrar al click afuera
    React.useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!boxRef.current) return;
            if (!boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // Cuando hay value seleccionado, reflejarlo en el input
    React.useEffect(() => {
        if (!value) return;
        setQuery(`${value.code} ${value.name}`);
    }, [value]);

    const filtered = React.useMemo(() => {
        const q = query.trim();
        let base = items;

        if (kindFilter) base = base.filter((x) => x.kind === kindFilter);

        if (!q) return base.slice(0, 12);

        const scored = base
            .map((it) => ({ it, s: scoreMatch(q, it) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 12)
            .map((x) => x.it);

        return scored;
    }, [items, kindFilter, query]);

    function handlePick(it: PucNode) {
        onChange(it);
        setOpen(false);
        // deja el texto consistente
        setQuery(`${it.code} ${it.name}`);
        // opcional: blur para mobile
        requestAnimationFrame(() => inputRef.current?.blur());
    }

    function handleClear() {
        onChange(null);
        setQuery("");
        setOpen(false);
        requestAnimationFrame(() => inputRef.current?.focus());
    }

    return (
        <div ref={boxRef}>
            {showLabel && (
                <div className="text-xs font-semibold tracking-widest text-gray-500">
                    {label}
                </div>
            )}

            <div className="relative mt-2">
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        // si el usuario edita, consideramos que “des-selecciona”
                        if (value) onChange(null);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    className="
            w-full rounded-2xl border border-gray-200
            bg-gray-50/70 px-4 py-3 text-sm outline-none
            focus:border-emerald-300 transition
          "
                />

                {allowClear && (query || value) && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700"
                        aria-label="Limpiar"
                    >
                        ×
                    </button>
                )}

                {open && filtered.length > 0 && (
                    <div
                        className="
              absolute left-0 right-0 mt-2 z-50
              rounded-2xl border border-gray-200 bg-white
              shadow-lg overflow-hidden
            "
                        role="listbox"
                    >
                        {filtered.map((it) => {
                            const chip = kindChip(it.kind);
                            return (
                                <button
                                    key={it.code}
                                    type="button"
                                    onClick={() => handlePick(it)}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50"
                                    role="option"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm text-gray-900 truncate">
                                                {it.code} — {it.name}
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500 truncate">
                                                {it.breadcrumbs.join(" > ")}
                                            </div>
                                        </div>

                                        <span
                                            className={`shrink-0 text-[11px] px-2 py-1 rounded-full border ${chip.cls}`}
                                        >
                                            {chip.label}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {open && filtered.length === 0 && (
                    <div className="absolute left-0 right-0 mt-2 z-50 rounded-2xl border border-gray-200 bg-white shadow-lg px-4 py-3 text-sm text-gray-500">
                        Sin resultados.
                    </div>
                )}
            </div>
        </div>
    );
}