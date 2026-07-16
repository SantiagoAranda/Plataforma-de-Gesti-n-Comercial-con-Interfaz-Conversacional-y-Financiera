"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Truck,
  Users,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  createManualPaidOutflow,
  listExpenseGroupAccounts,
  listExpenseGroups,
  type ExpenseGroup,
  type ManualPaidOutflowCategory,
  type ManualPaidOutflowPaymentMethod,
} from "@/src/services/accounting";
import { cn } from "@/src/lib/utils";

type FormState = {
  counterpartyName: string;
  amount: string;
  description: string;
  paymentMethod: ManualPaidOutflowPaymentMethod | "";
  categoryId: string;
};

const initialForm: FormState = {
  counterpartyName: "",
  amount: "",
  description: "",
  paymentMethod: "",
  categoryId: "",
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  BriefcaseBusiness,
  Building2,
  Landmark,
  Megaphone,
  MoreHorizontal,
  Truck,
  Users,
  Wrench,
  Zap,
};

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function parseAmount(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatAmount(value: string) {
  const amount = parseAmount(value);
  return amount > 0 ? copFormatter.format(amount) : "";
}

export default function ManualPaidOutflowSheet() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ExpenseGroup | null>(null);
  const [accounts, setAccounts] = useState<ManualPaidOutflowCategory[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  const amount = useMemo(() => parseAmount(form.amount), [form.amount]);
  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLocaleLowerCase("es-CO");
    if (!query) return accounts;

    return accounts.filter((account) => {
      const searchable = [
        account.code,
        account.name,
        account.pucCode,
        account.pucName,
        account.parentName,
        account.group?.name,
        selectedGroup?.label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-CO");

      return searchable.includes(query);
    });
  }, [accounts, accountSearch, selectedGroup]);

  const canSubmit =
    form.counterpartyName.trim() &&
    amount > 0 &&
    form.description.trim() &&
    form.paymentMethod &&
    form.categoryId &&
    !saving;

  useEffect(() => {
    if (!open) {
      setGroups([]);
      return;
    }

    let cancelled = false;
    setLoadingGroups(true);
    setError("");

    listExpenseGroups()
      .then((items) => {
        if (!cancelled) setGroups(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las categorias",
          );
          setGroups([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectGroup = async (group: ExpenseGroup) => {
    setSelectedGroup(group);
    setAccounts([]);
    setAccountSearch("");
    setForm((prev) => ({ ...prev, categoryId: "" }));
    setLoadingAccounts(true);
    setError("");

    try {
      const items = await listExpenseGroupAccounts(group.id);
      setAccounts(items);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las cuentas de la categoria",
      );
    } finally {
      setLoadingAccounts(false);
    }
  };

  const backToGroups = () => {
    setSelectedGroup(null);
    setAccounts([]);
    setAccountSearch("");
    setForm((prev) => ({ ...prev, categoryId: "" }));
  };

  const closeSheet = () => {
    if (saving) return;
    setOpen(false);
    setForm(initialForm);
    setGroups([]);
    setSelectedGroup(null);
    setAccounts([]);
    setAccountSearch("");
    setError("");
    setSuccess("");
  };

  const submit = async () => {
    if (!canSubmit || !form.paymentMethod) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await createManualPaidOutflow({
        counterpartyName: form.counterpartyName.trim(),
        amount,
        description: form.description.trim(),
        paymentMethod: form.paymentMethod,
        type: "EXPENSE",
        categoryId: form.categoryId,
      });
      setSuccess("Gasto registrado correctamente.");
      setForm(initialForm);
      setSelectedGroup(null);
      setAccounts([]);
      setAccountSearch("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar el movimiento",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Registrar gasto"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B3F64] text-white shadow-[0_12px_30px_rgba(11,63,100,0.25)] transition active:scale-95 lg:hidden"
      >
        <FileText className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Cerrar formulario"
            className="absolute inset-0 bg-black/30"
            onClick={closeSheet}
          />

          <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_40px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between border-b border-neutral-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-950">
                  Registrar gasto
                </h2>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Carga manual de gasto pagado
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-142px)] space-y-5 overflow-y-auto px-5 py-5">
              {success && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {success}
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Dirigido a / Beneficiario
                </span>
                <input
                  value={form.counterpartyName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      counterpartyName: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                  placeholder="Persona, proveedor o empresa"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Monto
                </span>
                <input
                  inputMode="numeric"
                  value={formatAmount(form.amount)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                  placeholder="$ 0"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Descripcion
                </span>
                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                  placeholder="Ej. Pago de transporte"
                />
              </label>

              <SegmentedControl
                label="Medio de pago"
                value={form.paymentMethod}
                options={[
                  { value: "CASH", label: "Efectivo" },
                  { value: "TRANSFER", label: "Transferencia" },
                ]}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentMethod: value as ManualPaidOutflowPaymentMethod,
                  }))
                }
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">
                    Categoría de gasto
                  </span>
                  {(loadingGroups || loadingAccounts) && (
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  )}
                </div>

                {!selectedGroup && (
                  <>
                    {loadingGroups && (
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                        Cargando categorías...
                      </div>
                    )}

                    {!loadingGroups && groups.length === 0 && (
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                        No hay categorías disponibles.
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      {groups.map((group) => {
                        const Icon = GROUP_ICONS[group.icon] ?? MoreHorizontal;

                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => selectGroup(group)}
                            className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left transition active:bg-neutral-50"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-neutral-900">
                                {group.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {group.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {selectedGroup && (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={backToGroups}
                        className="text-sm font-medium text-emerald-700"
                      >
                        ← Volver a categorías
                      </button>
                      <span className="truncate text-xs text-neutral-500">
                        {selectedGroup.label}
                      </span>
                    </div>

                    <input
                      value={accountSearch}
                      onChange={(event) => {
                        setAccountSearch(event.target.value);
                        setForm((prev) => ({ ...prev, categoryId: "" }));
                      }}
                      className="mb-3 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                      placeholder={`Buscar en ${selectedGroup.label}...`}
                    />

                    {loadingAccounts && (
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                        Cargando cuentas...
                      </div>
                    )}

                    {!loadingAccounts && accounts.length === 0 && (
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                        No hay cuentas disponibles para esta categoría.
                      </div>
                    )}

                    {!loadingAccounts &&
                      accounts.length > 0 &&
                      filteredAccounts.length === 0 && (
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                          No se encontraron categorías.
                        </div>
                      )}

                    <div className="grid grid-cols-1 gap-2">
                      {filteredAccounts.map((account) => {
                        const selected = form.categoryId === account.id;

                        return (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                categoryId: account.id,
                              }))
                            }
                            className={cn(
                              "rounded-2xl border px-4 py-3 text-left transition",
                              selected
                                ? "border-emerald-400 bg-emerald-50 shadow-[0_6px_18px_rgba(5,150,105,0.12)]"
                                : "border-neutral-200 bg-white active:bg-neutral-50",
                            )}
                          >
                            <span className="block text-sm font-medium text-neutral-900">
                              {account.name ?? account.pucName}
                            </span>
                            <span className="mt-1 block text-xs text-neutral-500">
                              PUC {account.code ?? account.pucCode}
                              {(account.parentName ?? account.group?.name) &&
                                ` - ${account.parentName ?? account.group.name}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div
              className="flex gap-3 border-t border-neutral-100 bg-white px-5 pt-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
            >
              <button
                type="button"
                onClick={closeSheet}
                disabled={saving}
                className="h-12 flex-1 rounded-2xl border border-neutral-200 text-sm font-medium text-neutral-700 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(5,150,105,0.22)] transition disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar gasto
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "h-10 rounded-xl border text-sm font-medium transition",
                selected
                  ? "border-emerald-200 bg-white text-emerald-800 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                  : "border-transparent bg-neutral-100 text-neutral-500",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
