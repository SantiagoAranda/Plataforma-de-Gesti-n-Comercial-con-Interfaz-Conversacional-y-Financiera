"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";

import {
  createMovement,
  deleteMovement,
  listMovements,
  updateMovement,
  type AccountingMovement,
  type UpdateAccountingMovementDto,
} from "@/src/services/accounting";

import { AccountingChatComposer } from "@/src/components/accounting/AccountingChatComposer";
import { AccountingMovementList } from "@/src/components/accounting/AccountingMovementList";
import { AccountingEmptyState } from "@/src/components/accounting/AccountingEmptyState";
import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";

import type { AccountingFormState } from "@/src/types/accounting-form";

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm: AccountingFormState = {
  id: undefined,
  originType: "MANUAL",
  originId: undefined,
  selectedPuc: null,
  pucCuentaCode: "",
  pucSubcuentaId: "",
  pucKind: "SUBCUENTA",
  pucCode: "",
  pucName: "",
  amount: "",
  date: todayISO(),
  detail: "",
  nature: "DEBIT",
};

function buildPucPayload(form: AccountingFormState) {
  if (form.selectedPuc?.level === "account") {
    return {
      pucCuentaCode: form.selectedPuc.id,
      pucSubcuentaId: null,
    };
  }

  if (form.selectedPuc?.level === "subaccount") {
    return {
      pucCuentaCode: null,
      pucSubcuentaId: form.selectedPuc.id,
    };
  }

  return {
    pucCuentaCode: null,
    pucSubcuentaId: null,
  };
}

function buildSelectedPucFromMovement(movement: AccountingMovement) {
  if (movement.pucCuentaCode) {
    return {
      level: "account" as const,
      id: movement.pucCuentaCode,
      code: movement.pucCode,
      name: movement.pucName,
    };
  }

  if (movement.pucSubcuentaId) {
    return {
      level: "subaccount" as const,
      id: movement.pucSubcuentaId,
      code: movement.pucCode,
      name: movement.pucName,
    };
  }

  if (movement.pucKind === "CUENTA" && movement.pucCode) {
    return {
      level: "account" as const,
      id: movement.pucCode,
      code: movement.pucCode,
      name: movement.pucName,
    };
  }

  if (movement.pucKind === "SUBCUENTA" && movement.pucCode) {
    return {
      level: "subaccount" as const,
      id: movement.pucCode,
      code: movement.pucCode,
      name: movement.pucName,
    };
  }

  return null;
}

export default function ContabilidadPage() {
  const [movements, setMovements] = useState<AccountingMovement[]>([]);
  const [selectedMovement, setSelectedMovement] =
    useState<AccountingMovement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<AccountingFormState>(emptyForm);
  const [searchText, setSearchText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [pendingSmoothScroll, setPendingSmoothScroll] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isEditing = Boolean(form.id);
  const isSalesOriginEditing = isEditing && form.originType !== "MANUAL";

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({
      block: "end",
      behavior,
    });
  }, []);

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
    const selectedPuc = buildSelectedPucFromMovement(movement);

    setForm({
      id: movement.id,
      originType: movement.originType,
      originId: movement.originId ?? undefined,
      selectedPuc,
      pucCuentaCode: movement.pucCuentaCode ?? "",
      pucSubcuentaId: movement.pucSubcuentaId ?? "",
      pucKind: movement.pucKind,
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
      } catch (err: any) {
        console.error(err);
        setError(
          Array.isArray(err?.message)
            ? err.message.join(", ")
            : err?.message || "No se pudo eliminar el movimiento"
        );
      }
    },
    [refresh]
  );

  const handleComposerSubmit = useCallback(async () => {
    if (!composerOpen) {
      await refresh();
      return;
    }

    const selectedPuc = form.selectedPuc;
    const pucPayload = buildPucPayload(form);
    const hasPuc = Boolean(
      pucPayload.pucCuentaCode || pucPayload.pucSubcuentaId
    );

    console.log("selectedPuc", selectedPuc);

    if (!hasPuc) {
      setError("Completa el PUC");
      return;
    }

    const detail = form.detail.trim() || null;

    try {
      setError(null);

      if (form.id) {
        const payload: UpdateAccountingMovementDto =
          form.originType === "MANUAL"
            ? {
                ...pucPayload,
                amount: Number(form.amount),
                nature: form.nature,
                date: form.date,
                detail,
                originType: "MANUAL",
                originId: form.originId ?? undefined,
              }
            : {
                ...pucPayload,
                detail,
              };

        console.log("payload", payload);
        console.log("payload json", JSON.stringify(payload));

        if (form.originType === "MANUAL") {
          const parsedAmount = Number(form.amount);
          if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            setError("Ingresa un valor valido");
            return;
          }
          payload.amount = parsedAmount;
        }

        await updateMovement(form.id, payload);
      } else {
        const parsedAmount = Number(form.amount);

        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          setError("Ingresa un valor valido");
          return;
        }

        const payload = {
          ...pucPayload,
          amount: parsedAmount,
          nature: form.nature,
          date: form.date,
          detail,
          originType: "MANUAL" as const,
        };

        console.log("payload", payload);
        console.log("payload json", JSON.stringify(payload));
        await createMovement(payload);
        setPendingSmoothScroll(true);
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

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom, movements.length]);

  useEffect(() => {
    if (!pendingSmoothScroll) return;

    const frame = requestAnimationFrame(() => {
      scrollToBottom("smooth");
      setPendingSmoothScroll(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [movements.length, pendingSmoothScroll, scrollToBottom]);

  return (
    <div className="flex min-h-dvh min-h-0 flex-col bg-[#f6f8f6]">
      {selectedMovement ? (
        <SelectionActionBar
          visible
          title="Movimiento seleccionado"
          onClose={clearSelection}
          onEdit={() => startEdit(selectedMovement)}
          onDelete={
            selectedMovement.originType === "MANUAL"
              ? () => handleDelete(selectedMovement.id)
              : undefined
          }
          deleteLabel="Eliminar"
        />
      ) : (
        <AppHeader
          title="Contabilidad"
          subtitle="Movimientos y registros"
          showBack
        />
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-4">
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

          {isEditing && isSalesOriginEditing && (
            <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Este movimiento proviene de una venta. Solo podes editar PUC y descripcion.
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
          <div ref={bottomRef} className="h-px" />
        </div>
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
