"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";

import { AccountingCard } from "@/src/components/accounting/AccountingCard";
import { AccountingComposer } from "@/src/components/accounting/AccountingComposer";
import { AccountingFilterSheet } from "@/src/components/accounting/AccountingFilterSheet";

import type { AccountingEntry, AccountingType } from "@/src/types/accounting";
import { getPucClases, getPucGrupos } from "@/src/services/puc";

const MOCK: AccountingEntry[] = [/* ... igual que lo tuyo ... */];

function groupLabel(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dd.getTime() === today.getTime()) return "HOY";
  if (dd.getTime() === yesterday.getTime()) return "AYER";
  return dateISO;
}

export default function ContabilidadClient() {
    const [filter, setFilter] = useState<AccountingType>("ALL");
    const [filterOpen, setFilterOpen] = useState(false);

    const [items, setItems] = useState<AccountingEntry[]>(MOCK);
    const [search, setSearch] = useState("");
    const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);

    // ✅ PUC: clases + grupos
    const [pucClases, setPucClases] = useState<{ code: string; name: string }[]>([]);
    const [pucGrupos, setPucGrupos] = useState<{ code: string; name: string; claseCode: string }[]>([]);
    const [selectedClase, setSelectedClase] = useState<string>("");

    useEffect(() => {
        (async () => {
            const clases = await getPucClases();
            setPucClases(clases);
        })();
    }, []);

    useEffect(() => {
        if (!selectedClase) {
            setPucGrupos([]);
            return;
        }
        (async () => {
            const grupos = await getPucGrupos(selectedClase);
            setPucGrupos(grupos);
        })();
    }, [selectedClase]);

    const entries = useMemo(() => {
        const q = search.trim().toLowerCase();

        const base =
            filter === "ALL"
                ? items
                : items.filter((e) => {
                    if (filter === "INCOME") return e.amount > 0;
                    if (filter === "EXPENSE") return e.amount < 0;
                    if (filter === "ASSET") return e.kind === "ASSET";
                    return true;
                });

        const searched = !q
            ? base
            : base.filter((e) => {
                return (
                    e.description.toLowerCase().includes(q) ||
                    e.accountName.toLowerCase().includes(q) ||
                    e.pucCode.toLowerCase().includes(q)
                );
            });

        return searched.slice().sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
    }, [filter, items, search]);

    const grouped = useMemo(() => {
        return entries.reduce<Record<string, AccountingEntry[]>>((acc, e) => {
            acc[e.dateISO] ??= [];
            acc[e.dateISO].push(e);
            return acc;
        }, {});
    }, [entries]);

    const dates = useMemo(() => {
        return Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));
    }, [grouped]);

    return (
        <div className="min-h-[100dvh] bg-white">
            <AppHeader
                title="Contabilidad"
                subtitle="Historial de transacciones"
                showBack
                rightAriaLabel="Filtros"
                rightIcon={
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 6h16" />
                        <path d="M7 12h10" />
                        <path d="M10 18h4" />
                    </svg>
                }
                onRightClick={() => setFilterOpen(true)}
            />

            <main className="pt-2 pb-24">
                <div className="px-4">
                    <div className="text-sm text-gray-500">Octubre 2023</div>
                </div>

                <div className="mt-3 space-y-6">
                    {dates.map((dateISO) => (
                        <section key={dateISO}>
                            <div className="px-4 text-xs font-semibold tracking-widest text-gray-400">
                                {groupLabel(dateISO)}
                            </div>

                            <div className="mt-2 space-y-4">
                                {grouped[dateISO].map((e) => (
                                    <div key={e.id} className="px-4">
                                        <AccountingCard
                                            entry={e}
                                            onEdit={(entry) => setEditingEntry(entry)}
                                            onDelete={(entry) => setItems((prev) => prev.filter((x) => x.id !== entry.id))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </main>

            <AccountingComposer
                searchValue={search}
                onSearchChange={setSearch}
                editingEntry={editingEntry}
                onCancelEdit={() => setEditingEntry(null)}
                onCreate={(newEntry) => setItems((prev) => [newEntry, ...prev])}
                onUpdate={(updated) => {
                    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                    setEditingEntry(null);
                }}

                // ✅ NUEVO: PUC
                pucClases={pucClases}
                pucGrupos={pucGrupos}
                selectedClase={selectedClase}
                onSelectClase={setSelectedClase}
            />

            <AccountingFilterSheet
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                value={filter}
                onChange={setFilter}
            />
        </div>
    );
}
