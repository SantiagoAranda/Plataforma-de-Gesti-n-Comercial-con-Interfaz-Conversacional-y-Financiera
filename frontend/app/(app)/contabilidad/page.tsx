"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import AppHeader from "@/src/components/layout/AppHeader";

import { AccountingCard } from "@/src/components/accounting/AccountingCard";
import { AccountingComposer } from "@/src/components/accounting/AccountingComposer";
import { AccountingFilterSheet } from "@/src/components/accounting/AccountingFilterSheet";

import type { AccountingType } from "@/src/services/accounting";
import type { UiAccountingEntry } from "@/src/types/accounting-ui";

import { getPucClases, getPucGrupos } from "@/src/services/puc";
import { deleteEntry, listMovements } from "@/src/services/accounting";

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

function toUi(m: any): UiAccountingEntry {
  const d = new Date(m.date);
  const dateISO = d.toISOString().slice(0, 10);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const kind =
    m.class === "ASSET" ||
    m.class === "LIABILITY" ||
    m.class === "EQUITY" ||
    m.class === "INCOME" ||
    m.class === "EXPENSE"
      ? m.class
      : "ASSET";

  return {
    id: m.id, // lineId
    entryId: m.entryId, // entryId
    dateISO,
    time,
    pucCode: m.pucCode,
    accountName: m.pucName ?? "(sin nombre)",
    description: m.description ?? m.memo ?? "",
    amount: Number(m.amountSigned ?? 0),
    pucLevel: (m.pucLevel ?? "CUENTA"),
    // si tu backend después expone source, reemplazalo acá
    source: "MANUAL",
    kind,
    status: m.status,
  };
}

export default function ContabilidadClient() {
  const [filter, setFilter] = useState<AccountingType>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);

  const [items, setItems] = useState<UiAccountingEntry[]>([]);
  const [search, setSearch] = useState("");
  const [editingEntry, setEditingEntry] = useState<UiAccountingEntry | null>(
    null,
  );

  // PUC: clases + grupos
  const [pucClases, setPucClases] = useState<{ code: string; name: string }[]>(
    [],
  );
  const [pucGrupos, setPucGrupos] = useState<
    { code: string; name: string; claseCode: string }[]
  >([]);
  const [selectedClase, setSelectedClase] = useState<string>("");

  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMovements({
        q: search.trim() || undefined,
        onlyPosted: "false",
      });
      setItems(data.map(toUi));
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load PUC clases
  useEffect(() => {
    (async () => {
      const clases = await getPucClases();
      setPucClases(clases);
    })();
  }, []);

  // Load grupos by clase
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
    const base =
      filter === "ALL"
        ? items
        : items.filter((e) => {
            if (filter === "INCOME") return e.kind === "INCOME";
            if (filter === "EXPENSE") return e.kind === "EXPENSE";
            if (filter === "ASSET") return e.kind === "ASSET";
            return true;
          });

    return base.slice().sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
  }, [filter, items]);

  const grouped = useMemo(() => {
    return entries.reduce<Record<string, UiAccountingEntry[]>>((acc, e) => {
      acc[e.dateISO] ??= [];
      acc[e.dateISO].push(e);
      return acc;
    }, {});
  }, [entries]);

  const dates = useMemo(
    () => Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1)),
    [grouped],
  );

  const isEmpty = !loading && items.length === 0 && search.trim() === "";

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

      <main className="pt-2 pb-24">
        {loading && (
          <div className="px-4 py-2 text-xs text-neutral-500">Cargando...</div>
        )}

        {/* ✅ Estado vacío: solo si no hay nada y no estás buscando */}
        {isEmpty && (
          <div className="px-4 mt-4">
            <div className="rounded-3xl bg-white border border-neutral-200 shadow-sm p-6">
              <div className="text-lg font-semibold text-neutral-900">
                Empezá a cargar tu contabilidad
              </div>
              <div className="mt-2 text-sm text-neutral-600">
                Podés registrar movimientos manuales desde el botón{" "}
                <span className="font-semibold">+</span> de abajo. Si entran
                ventas automáticas, esta pantalla se va a completar sola.
              </div>

              <button
                type="button"
                onClick={() => {
                  // enfoca el flujo del composer: lo más simple es scrollear y que toque "+"
                  window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: "smooth",
                  });
                }}
                className="mt-5 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition"
              >
                Cargar primer movimiento
              </button>
            </div>
          </div>
        )}

        {/* ✅ Lista normal */}
        {!isEmpty && (
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
                        entry={e as any}
                        onEdit={(entry: any) => setEditingEntry(entry)}
                        onDelete={async (entry: any) => {
                          try {
                            await deleteEntry(entry.entryId);
                            await refresh();
                          } catch (err: any) {
                            alert(
                              err?.details?.message ??
                                err?.message ??
                                "No se pudo eliminar",
                            );
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <AccountingComposer
        searchValue={search}
        onSearchChange={setSearch}
        editingEntry={editingEntry as any}
        onCancelEdit={() => setEditingEntry(null)}
        onCreate={async () => {
          await refresh();
        }}
        onUpdate={async () => {
          await refresh();
          setEditingEntry(null);
        }}
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
