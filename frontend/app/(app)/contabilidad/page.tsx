"use client";

import { useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";

import { AccountingCard } from "@/src/components/accounting/AccountingCard";
import { AccountingComposer } from "@/src/components/accounting/AccountingComposer";
import { AccountingFilterSheet } from "@/src/components/accounting/AccountingFilterSheet";

import type { AccountingEntry, AccountingType } from "@/src/types/accounting";

const MOCK: AccountingEntry[] = [
    {
        id: "1",
        dateISO: "2023-10-10",
        time: "10:45 AM",
        pucCode: "4135",
        accountName: "Ventas",
        description: "Venta de servicios Pro",
        amount: 1200,
        source: "AUTO_ORDER",
        kind: "INCOME",
    },
    {
        id: "2",
        dateISO: "2023-10-10",
        time: "09:15 AM",
        pucCode: "5105",
        accountName: "Gastos Personal",
        description: "Pago nómina mensual",
        amount: -850,
        source: "MANUAL",
        kind: "EXPENSE",
    },
    {
        id: "3",
        dateISO: "2023-10-09",
        time: "03:00 PM",
        pucCode: "1110",
        accountName: "Bancos",
        description: "Transferencia interna",
        amount: 5000,
        source: "SYSTEM",
        kind: "ASSET",
    },
    {
        id: "4",
        dateISO: "2023-10-09",
        time: "11:20 AM",
        pucCode: "2105",
        accountName: "Obligaciones",
        description: "Cuota préstamo local",
        amount: -320,
        source: "RECURRENT",
        kind: "LIABILITY",
    },
];

function groupLabel(dateISO: string) {
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

    // ✅ lista editable
    const [items, setItems] = useState<AccountingEntry[]>(MOCK);

    // ✅ buscador
    const [search, setSearch] = useState("");

    // ✅ item en edición
    const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);

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
                    <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M4 6h16" />
                        <path d="M7 12h10" />
                        <path d="M10 18h4" />
                    </svg>
                }
                onRightClick={() => setFilterOpen(true)}
            />

            <main className="pt-2 pb-6">
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
                                            onDelete={(entry) =>
                                                setItems((prev) => prev.filter((x) => x.id !== entry.id))
                                            }
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