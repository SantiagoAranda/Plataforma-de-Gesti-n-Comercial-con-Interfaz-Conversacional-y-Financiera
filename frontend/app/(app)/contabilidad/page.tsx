"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import AppHeader from "@/src/components/layout/AppHeader";

import { AccountingComposer } from "@/src/components/accounting/AccountingComposer";
import { AccountingFilterSheet } from "@/src/components/accounting/AccountingFilterSheet";

import { AccountingSelectionBar } from "@/src/components/accounting/AccountingSelectionBar";
import { ConfirmDeleteModal } from "@/src/components/accounting/ConfirmDeleteModal";

import {
  AccountingEntryCard,
  type UiAccountingEntryGroup,
  type UiAccountingLine,
} from "@/src/components/accounting/AccountingEntryCard";

import type { AccountingType } from "@/src/services/accounting";
import { deleteEntry, listMovements } from "@/src/services/accounting";

import { getPucClases, type PucClase } from "@/src/services/puc";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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

function normalizeDateISO(x: any) {
  const d = new Date(x);
  return d.toISOString().slice(0, 10);
}

function toEntryGroups(rows: any[]): UiAccountingEntryGroup[] {
  const map = new Map<string, UiAccountingEntryGroup>();

  for (const r of rows ?? []) {
    const entryId = String(r.entryId ?? "");
    if (!entryId) continue;

    const dateISO = normalizeDateISO(r.date);

    const line: UiAccountingLine = {
      pucCode: String(r.pucCode ?? ""),
      accountName: (r.pucName ?? "").toString(),
      debit: Number(r.debit ?? 0),
      credit: Number(r.credit ?? 0),
      description: r.description ?? null,
    };

    const curr = map.get(entryId);

    if (!curr) {
      map.set(entryId, {
        id: entryId,
        dateISO,
        memo: r.memo ?? "",
        status: r.status === "POSTED" ? "POSTED" : "DRAFT",
        totalDebit: Number(r.debit ?? 0),
        totalCredit: Number(r.credit ?? 0),
        lines: [line],
      });
    } else {
      curr.totalDebit += Number(r.debit ?? 0);
      curr.totalCredit += Number(r.credit ?? 0);
      curr.lines.push(line);
    }
  }

  return Array.from(map.values());
}

export default function ContabilidadClient() {

  const [filter, setFilter] = useState<AccountingType>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [activeEntry, setActiveEntry] = useState<any | null>(null);
  const [composerMode, setComposerMode] = useState<"create" | "edit" | "detail" | null>(null);

  const [pucClases, setPucClases] = useState<PucClase[]>([]);
  const [selectedClase, setSelectedClase] = useState("");

  const [loading, setLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const onLongPressEntry = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const data = await listMovements({
        q: search || undefined,
        onlyPosted: "false",
      });

      setRows(data ?? []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      try {
        const clases = await getPucClases();
        setPucClases(clases);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const entries = useMemo(() => {
    return toEntryGroups(rows);
  }, [rows]);

  /**
   * ------------------------------
   *  LÓGICA DE HABILITACIÓN UI
   * ------------------------------
   */

  const entryById = useMemo(() => {
    const map = new Map<string, UiAccountingEntryGroup>();
    entries.forEach((e) => map.set(e.id, e));
    return map;
  }, [entries]);

  const selectedEntries = useMemo(() => {
    return Array.from(selectedIds)
      .map((id) => entryById.get(id))
      .filter(Boolean) as UiAccountingEntryGroup[];
  }, [selectedIds, entryById]);

  const canDetails = selectedEntries.length === 1;

  const canEdit =
    selectedEntries.length === 1 &&
    selectedEntries[0].status === "DRAFT";

  const canDelete =
    selectedEntries.length > 0 &&
    selectedEntries.every((e) => e.status === "DRAFT");

  /**
   * ------------------------------
   *  ACTIONS
   * ------------------------------
   */

  const openDetails = useCallback(() => {
    if (!canDetails) return;

    setActiveEntry({ entryId: selectedEntries[0].id });
    setComposerMode("detail");

    clearSelection();
  }, [canDetails, selectedEntries, clearSelection]);

  const openEdit = useCallback(() => {
    if (!canEdit) return;

    setActiveEntry({ entryId: selectedEntries[0].id });
    setComposerMode("edit");

    clearSelection();
  }, [canEdit, selectedEntries, clearSelection]);

  const askDelete = useCallback(() => {
    if (!canDelete) return;

    setConfirmOpen(true);
  }, [canDelete]);

  const confirmDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);

    for (const id of ids) {
      await deleteEntry(id);
    }

    clearSelection();
    setConfirmOpen(false);

    await refresh();
  }, [selectedIds, clearSelection, refresh]);

  /**
   * ------------------------------
   *  GROUP BY DATE
   * ------------------------------
   */

  const groupedByDate = useMemo(() => {
    return entries.reduce<Record<string, UiAccountingEntryGroup[]>>(
      (acc, e) => {
        acc[e.dateISO] ??= [];
        acc[e.dateISO].push(e);
        return acc;
      },
      {},
    );
  }, [entries]);

  const dates = useMemo(
    () => Object.keys(groupedByDate).sort((a, b) => (a < b ? 1 : -1)),
    [groupedByDate],
  );

  const isEmpty = !loading && rows.length === 0;

  const listTopPad = selectionMode
    ? "pt-[calc(56px+env(safe-area-inset-top))]"
    : "pt-2";

  return (
    <div className="min-h-[100dvh] bg-white">

      <AppHeader
        title="Contabilidad"
        subtitle="Asientos contables"
        showBack
        onRightClick={() => setFilterOpen(true)}
      />

      {selectionMode && (
        <AccountingSelectionBar
          count={selectedIds.size}
          canDetails={canDetails}
          canEdit={canEdit}
          canDelete={canDelete}
          onCancel={clearSelection}
          onDetails={openDetails}
          onEdit={openEdit}
          onDelete={askDelete}
        />
      )}

      {selectionMode && (
        <button
          className="fixed inset-0 z-[900]"
          onClick={clearSelection}
        />
      )}

      <main className={cn("relative pb-24", listTopPad)}>

        {loading && (
          <div className="px-4 py-2 text-xs text-neutral-500">
            Cargando...
          </div>
        )}

        {!isEmpty && (
          <div className="mt-3 space-y-6">

            {dates.map((dateISO) => (
              <section key={dateISO}>

                <div className="px-4 text-xs font-semibold tracking-widest text-gray-400">
                  {groupLabel(dateISO)}
                </div>

                <div className="mt-2 space-y-4">

                  {groupedByDate[dateISO].map((entry) => (

                    <div key={entry.id} className="px-4">

                      <AccountingEntryCard
                        entry={entry}
                        selectionMode={selectionMode}
                        isSelected={selectedIds.has(entry.id)}
                        onLongPressEntry={onLongPressEntry}
                        onTapEntry={(id) => {
                          if (selectionMode) toggleSelected(id);
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
        composerMode={composerMode}
        editingEntry={activeEntry}
        onEnterCreate={() => {
          setActiveEntry(null);
          setComposerMode("create");
        }}
        onClose={() => {
          setComposerMode(null);
          setActiveEntry(null);
        }}
        onCreate={refresh}
        onUpdate={refresh}
        pucClases={pucClases}
        selectedClase={selectedClase}
        onSelectClase={setSelectedClase}
      />

      <AccountingFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filter}
        onChange={setFilter}
      />

      <ConfirmDeleteModal
        open={confirmOpen}
        count={selectedIds.size}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        confirmDisabled={!canDelete}
      />

    </div>
  );
}
