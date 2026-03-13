"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";

import {
  createMovement,
  deleteMovement,
  listMovements,
  updateMovement,
  type AccountingMovement,
  type CreateAccountingMovementDto,
} from "@/src/services/accounting";

import { AccountingChatComposer } from "@/src/components/accounting/AccountingChatComposer";
import { AccountingMovementList } from "@/src/components/accounting/AccountingMovementList";
import { AccountingEmptyState } from "@/src/components/accounting/AccountingEmptyState";
import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";

import type { AccountingFormState } from "@/src/types/accounting-form";

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm: AccountingFormState = {
  id: undefined,
  pucSubcuentaId: "",
  pucCode: "",
  pucName: "",
  amount: "",
  date: todayISO(),
  detail: "",
  nature: "DEBIT",
};

export default function ContabilidadPage() {
  const [movements, setMovements] = useState<AccountingMovement[]>([]);
  const [selectedMovement, setSelectedMovement] =
    useState<AccountingMovement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<AccountingFormState>(emptyForm);
  const [searchText, setSearchText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  const isEditing = Boolean(form.id);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listMovements({
        search: searchText.trim() || undefined,
      });

      setMovements(data ?? []);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar los movimientos");
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetForm = useCallback(() => {
    setForm({
      ...emptyForm,
      date: todayISO(),
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedMovement(null);
  }, []);

  const handleCancelComposer = useCallback(() => {
    setComposerOpen(false);
    resetForm();
    setError(null);
  }, [resetForm]);

  const handleSelectMovement = useCallback((movement: AccountingMovement) => {
    setSelectedMovement((prev) => (prev?.id === movement.id ? null : movement));
  }, []);

const startEdit = useCallback((movement: AccountingMovement) => {
  setForm({
    id: movement.id,
    pucSubcuentaId: movement.pucSubcuentaId,
    pucCode: movement.pucCode,
    pucName: movement.pucName,
    amount: String(movement.amount),
    date: movement.date.slice(0, 10),
    detail: movement.detail ?? "",
    nature: movement.nature,
  });

  setComposerOpen(true);
  setSelectedMovement(null);
  setError(null);
}, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteMovement(id);
        setSelectedMovement(null);
        await refresh();
      } catch (err) {
        console.error(err);
        setError("No se pudo eliminar el movimiento");
      }
    },
    [refresh]
  );

const handleComposerSubmit = useCallback(async () => {
  if (!composerOpen) {
    await refresh();
    return;
  }

  if (!form.pucSubcuentaId || !form.amount || !form.detail.trim()) {
    setError("Completá PUC, valor y descripción");
    return;
  }

  const parsedAmount = Number(form.amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    setError("Ingresá un valor válido");
    return;
  }

  const payload = {
    pucSubcuentaId: form.pucSubcuentaId,
    amount: parsedAmount,
    nature: form.nature,
    date: form.date,
    detail: form.detail.trim(),
    originType: "MANUAL" as const,
    originId: undefined,
  };

  try {
    console.log("payload movement", payload);

    setError(null);

    if (form.id) {
      await updateMovement(form.id, payload);
    } else {
      await createMovement(payload);
    }

    setComposerOpen(false);
    resetForm();
    await refresh();
  } catch (err: any) {
    console.error("Error guardando movimiento:", err);
    console.error("status:", err?.status);
    console.error("message:", err?.message);
    console.error("details:", err?.details);

    setError(
      Array.isArray(err?.message)
        ? err.message.join(", ")
        : err?.message || "No se pudo guardar el movimiento"
    );
  }
}, [composerOpen, form, refresh, resetForm]);

  useEffect(() => {
    if (composerOpen) return;

    const timer = setTimeout(() => {
      refresh();
    }, 250);

    return () => clearTimeout(timer);
  }, [searchText, composerOpen, refresh]);

  const isEmpty = useMemo(
    () => !loading && movements.length === 0,
    [loading, movements.length]
  );

  return (
    <div className="min-h-dvh bg-[#f6f8f6]">
      {selectedMovement ? (
        <SelectionActionBar
          visible
          title="Movimiento seleccionado"
          onClose={clearSelection}
          onEdit={() => startEdit(selectedMovement)}
          onDelete={() => handleDelete(selectedMovement.id)}
        />
      ) : (
        <AppHeader title="Contabilidad" />
      )}

      <main className="mx-auto w-full max-w-3xl px-3 pb-40 pt-4 sm:px-4">
        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-sm text-neutral-500">
            Cargando movimientos...
          </div>
        )}

        {isEmpty ? (
          <AccountingEmptyState
            onCreate={() => {
              setComposerOpen(true);
              resetForm();
              setError(null);
            }}
          />
        ) : (
          <AccountingMovementList
            movements={movements}
            selectedId={selectedMovement?.id ?? null}
            onSelect={handleSelectMovement}
          />
        )}
      </main>

      <AccountingChatComposer
        value={form}
        expanded={composerOpen}
        isEditing={isEditing}
        searchValue={searchText}
        onOpenComposer={() => {
          setComposerOpen(true);
          resetForm();
          setError(null);
        }}
        onChange={setForm}
        onSearchChange={setSearchText}
        onCancel={handleCancelComposer}
        onSubmit={handleComposerSubmit}
      />
    </div>
  );
}