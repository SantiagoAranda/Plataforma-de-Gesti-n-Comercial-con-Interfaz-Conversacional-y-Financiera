"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
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
import { getBusinessDayKey } from "@/src/lib/businessDate";

const todayISO = () => getBusinessDayKey(new Date());

type AccountingFormErrors = {
  puc?: string;
  date?: string;
  amount?: string;
  nature?: string;
};

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

function formatCurrency(value: number) {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function movementTimestamp(movement: AccountingMovement) {
  return new Date(movement.createdAt ?? movement.date).getTime();
}

export default function ContabilidadPage() {
  const [movements, setMovements] = useState<AccountingMovement[]>([]);
  const [selectedMovement, setSelectedMovement] =
    useState<AccountingMovement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<AccountingFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<AccountingFormErrors>({});
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  const refresh = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await listMovements({ search: searchQuery || undefined });
      setMovements(data ?? []);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar los movimientos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    refresh(debouncedSearch);
  }, [debouncedSearch, refresh]);

  const resetForm = useCallback(() => {
    setForm({
      ...emptyForm,
      date: todayISO(),
    });
    setFormErrors({});
  }, []);

  const validateForm = useCallback((value: AccountingFormState) => {
    const nextErrors: AccountingFormErrors = {};
    const pucPayload = buildPucPayload(value);
    const parsedAmount = Number(value.amount);

    if (!pucPayload.pucCuentaCode && !pucPayload.pucSubcuentaId) {
      nextErrors.puc = "Selecciona una cuenta o subcuenta PUC.";
    }

    if (!value.date?.trim()) {
      nextErrors.date = "La fecha es obligatoria.";
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      nextErrors.amount = "Ingresa un valor valido.";
    }

    if (!value.nature) {
      nextErrors.nature = "Selecciona una naturaleza.";
    }

    setFormErrors(nextErrors);

    return {
      isValid: Object.keys(nextErrors).length === 0,
      parsedAmount,
      pucPayload,
    };
  }, []);

  const handleFormChange = useCallback((updater: SetStateAction<AccountingFormState>) => {
    setForm((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;

      setFormErrors((current) => ({
        puc:
          next.selectedPuc || next.pucCuentaCode || next.pucSubcuentaId
            ? undefined
            : current.puc,
        date: next.date?.trim() ? undefined : current.date,
        amount:
          Number.isFinite(Number(next.amount)) && Number(next.amount) > 0
            ? undefined
            : current.amount,
        nature: next.nature ? undefined : current.nature,
      }));

      return next;
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
    setFormErrors({});

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
      date: getBusinessDayKey(movement.date),
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
        await refresh(debouncedSearch);
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
      await refresh(debouncedSearch);
      return;
    }

    const { isValid, parsedAmount, pucPayload } = validateForm(form);

    if (!isValid) {
      setError("Revisa los campos obligatorios.");
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
                amount: parsedAmount,
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

        await updateMovement(form.id, payload);

      } else {
        const payload = {
          ...pucPayload,
          amount: parsedAmount,
          nature: form.nature,
          date: form.date,
          detail,
          originType: "MANUAL" as const,
        };

        await createMovement(payload);
        setPendingSmoothScroll(true);
      }

      setComposerOpen(false);
      resetForm();
      await refresh(debouncedSearch);
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
  }, [composerOpen, form, refresh, resetForm, validateForm]);


  const displayMovements = movements;

  const isEmpty = useMemo(
    () => !loading && displayMovements.length === 0,
    [loading, displayMovements.length]
  );

  const balanceSummary = useMemo(() => {
    const totalDebit = movements.reduce((acc, movement) => {
      return movement.nature === "DEBIT" ? acc + Number(movement.amount || 0) : acc;
    }, 0);

    const totalCredit = movements.reduce((acc, movement) => {
      return movement.nature === "CREDIT" ? acc + Number(movement.amount || 0) : acc;
    }, 0);

    const difference = totalDebit - totalCredit;
    const isBalanced = difference === 0;

    return {
      totalDebit,
      totalCredit,
      difference,
      isBalanced,
    };
  }, [movements]);

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
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#f6f8f6]">
      <div className="shrink-0">
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

        <div className="mx-auto w-full max-w-3xl px-3 pb-3 pt-3 sm:px-4">
          <section className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Resumen del balance
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              <div>Debito</div>
              <div>Credito</div>
              <div>Diferencia</div>
            </div>

            <div className="mt-1 grid grid-cols-3 gap-3 text-sm font-bold">
              <div className="text-neutral-900">
                {formatCurrency(balanceSummary.totalDebit)}
              </div>
              <div className="text-neutral-900">
                {formatCurrency(balanceSummary.totalCredit)}
              </div>
              <div
                className={
                  balanceSummary.isBalanced
                    ? "text-emerald-700"
                    : "text-amber-700"
                }
              >
                {balanceSummary.isBalanced
                  ? "Balanceado"
                  : formatCurrency(Math.abs(balanceSummary.difference))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-3 pb-24 pt-1 sm:px-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
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
              movements={displayMovements}
              selectedId={selectedMovement?.id ?? null}
              onSelect={handleSelectMovement}
            />
          )}
          <div ref={bottomRef} className="h-px" />
          </div>
        </div>
      </main>

      <AccountingChatComposer
        value={form}
        errors={formErrors}
        expanded={composerOpen}
        isEditing={isEditing}
        searchValue={searchText}
        onOpenComposer={() => {
          setComposerOpen(true);
          resetForm();
          setError(null);
        }}
        onChange={handleFormChange}
        onSearchChange={setSearchText}
        onCancel={handleCancelComposer}
        onSubmit={handleComposerSubmit}
      />
    </div>
  );
}
