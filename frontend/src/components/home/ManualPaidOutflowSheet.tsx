"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  BriefcaseBusiness,
  Bus,
  Car,
  CheckCircle2,
  CircleDollarSign,
  CircleParking,
  Droplets,
  FileText,
  Flame,
  Fuel,
  Laptop,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Utensils,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import DayPickerCalendar from "@/src/components/shared/DayPickerCalendar";
import {
  SearchSelect,
  type SearchSelectOption,
} from "@/src/components/shared/SearchSelect";
import {
  EXPENSE_SHORTCUT_GROUPS,
  type ExpenseShortcutGroup,
  type ExpenseShortcutIcon,
} from "@/src/constants/expenseShortcuts";
import {
  businessDateTimeToISOString,
  getBusinessDayKey,
  getBusinessTimeKey,
} from "@/src/lib/businessDate";
import { formatLocalDateKey } from "@/src/lib/datetime";
import { cn } from "@/src/lib/utils";
import { invalidateCache } from "@/src/lib/cache";
import {
  createManualPaidOutflow,
  listExpenseGroupAccounts,
  listManualPaidOutflowCategories,
  type ManualPaidOutflowCategory,
  type ManualPaidOutflowPaymentMethod,
} from "@/src/services/accounting";

type FormState = {
  counterpartyName: string;
  amount: string;
  description: string;
  paymentMethod: ManualPaidOutflowPaymentMethod | "";
  categoryId: string;
  occurredOn: string;
  occurredTime: string;
};

type ExpensePucSearchOption = SearchSelectOption &
  ManualPaidOutflowCategory & {
    expenseGroupId: string;
  };

const SHORTCUT_ICONS: Record<ExpenseShortcutIcon, LucideIcon> = {
  Building2,
  BriefcaseBusiness,
  Bus,
  Car,
  CircleDollarSign,
  CircleParking,
  Droplets,
  FileText,
  Flame,
  Fuel,
  Laptop,
  Megaphone,
  MoreHorizontal,
  Package,
  Phone,
  ReceiptText: FileText,
  ShieldCheck,
  Truck,
  Users,
  Utensils,
  Wrench,
  Zap,
};

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function createInitialForm(): FormState {
  return {
    counterpartyName: "",
    amount: "",
    description: "",
    paymentMethod: "",
    categoryId: "",
    occurredOn: getBusinessDayKey(new Date()),
    occurredTime: "",
  };
}

function parseAmount(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatAmount(value: string) {
  const amount = parseAmount(value);
  return amount > 0 ? copFormatter.format(amount) : "";
}

function calendarDateFromKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type ManualPaidOutflowSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ManualPaidOutflowSheet({
  open,
  onOpenChange,
}: ManualPaidOutflowSheetProps) {
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPucOption, setSelectedPucOption] =
    useState<ExpensePucSearchOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(createInitialForm());
    setSelectedGroupId(null);
    setSearchOpen(false);
    setSelectedPucOption(null);
    setError("");
    setSuccess("");
  }, [open]);

  const amount = useMemo(() => parseAmount(form.amount), [form.amount]);
  const validAccountingDateTime = useMemo(
    () =>
      businessDateTimeToISOString(
        form.occurredOn,
        form.occurredTime || "00:00",
      ),
    [form.occurredOn, form.occurredTime],
  );
  const selectedCalendarDate = useMemo(
    () => calendarDateFromKey(form.occurredOn),
    [form.occurredOn],
  );
  const todayCalendarDate = useMemo(
    () => calendarDateFromKey(getBusinessDayKey(new Date())),
    [open],
  );
  const selectedGroup = useMemo<ExpenseShortcutGroup | null>(
    () =>
      EXPENSE_SHORTCUT_GROUPS.find((group) => group.id === selectedGroupId) ??
      null,
    [selectedGroupId],
  );

  const searchExpenseAccounts = useCallback(
    async (query: string): Promise<ExpensePucSearchOption[]> => {
      if (!selectedGroup) return [];

      const searchConfig = selectedGroup.search;
      const accounts = searchConfig.endpointGroupId
        ? await listExpenseGroupAccounts(searchConfig.endpointGroupId, query)
        : await listManualPaidOutflowCategories("EXPENSE", query);
      const normalizedNameIncludes = searchConfig.nameIncludes?.map(
        normalizeSearchText,
      );

      return accounts
        .filter((account) => {
          const belongsToAllowedFamily =
            searchConfig.allowedPucPrefixes.some((prefix) =>
              account.code.startsWith(prefix),
            );
          if (!belongsToAllowedFamily) return false;
          if (!normalizedNameIncludes?.length) return true;

          const searchableName = normalizeSearchText(
            `${account.name} ${account.parentName ?? ""}`,
          );
          return normalizedNameIncludes.some((needle) =>
            searchableName.includes(needle),
          );
        })
        .map((account) => ({
          ...account,
          expenseGroupId: selectedGroup.id,
          title: account.code,
          subtitle: account.name,
          meta: account.parentName ?? undefined,
        }));
    },
    [selectedGroup],
  );

  const canSubmit = Boolean(
    amount > 0 &&
    validAccountingDateTime &&
    form.paymentMethod &&
    form.categoryId &&
    !saving,
  );

  const resetForm = () => {
    setForm(createInitialForm());
    setSelectedGroupId(null);
    setSearchOpen(false);
    setSelectedPucOption(null);
  };

  const closeSheet = () => {
    if (saving) return;
    onOpenChange(false);
    resetForm();
    setError("");
    setSuccess("");
  };

  const selectGroup = (groupId: string) => {
    const group = EXPENSE_SHORTCUT_GROUPS.find(
      (candidate) => candidate.id === groupId,
    );
    const selectedShortcutBelongsToGroup = group?.shortcuts.some(
      (shortcut) => shortcut.pucCode === form.categoryId,
    );
    const selectedSearchBelongsToGroup = Boolean(
      selectedPucOption?.expenseGroupId === groupId &&
        selectedPucOption.id === form.categoryId,
    );

    setSelectedGroupId(groupId);
    if (selectedSearchBelongsToGroup) {
      setSearchOpen(false);
      return;
    }
    if (selectedShortcutBelongsToGroup) return;

    setForm((previous) => ({ ...previous, categoryId: "" }));
    setSelectedPucOption(null);
    setSearchOpen(false);
  };

  const submit = async () => {
    if (!canSubmit || !form.paymentMethod) return;

    const submittedAt = new Date();
    const accountingTime = form.occurredTime || getBusinessTimeKey(submittedAt);
    const occurredAt = businessDateTimeToISOString(
      form.occurredOn,
      accountingTime,
    );
    if (!occurredAt) {
      setError("La fecha u hora del gasto no es válida");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const counterpartyName = form.counterpartyName.trim();
    const description = form.description.trim();

    try {
      await createManualPaidOutflow({
        ...(counterpartyName ? { counterpartyName } : {}),
        ...(description ? { description } : {}),
        amount,
        paymentMethod: form.paymentMethod,
        type: "EXPENSE",
        categoryId: form.categoryId,
        occurredAt,
      });
      invalidateCache("home:movements");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("accounting:movement-created"));
      }
      setSuccess("Gasto registrado correctamente.");
      resetForm();
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
      {open && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Cerrar formulario"
            className="absolute inset-0 bg-black/30"
            onClick={closeSheet}
          />

          <section className="absolute inset-x-0 bottom-0 flex max-h-[94vh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_40px_rgba(0,0,0,0.18)] lg:left-1/2 lg:right-auto lg:top-1/2 lg:bottom-auto lg:w-[480px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[28px]">
            <div className="flex shrink-0 items-start justify-between border-b border-neutral-100 px-5 py-4">
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

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
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

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-[0.14em] text-[#0B3F64]">
                    GASTOS
                  </span>
                  {selectedGroup && (
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(null)}
                      className="text-xs font-medium text-[#0B3F64] outline-none focus-visible:ring-2 focus-visible:ring-[#0B3F64]"
                    >
                      ← Volver
                    </button>
                  )}
                </div>

                {!selectedGroup ? (
                  <div className="grid grid-cols-2 gap-2">
                    {EXPENSE_SHORTCUT_GROUPS.map((group) => {
                      const Icon = SHORTCUT_ICONS[group.icon];
                      const hasSelectedShortcut = group.shortcuts.some(
                        (shortcut) => shortcut.pucCode === form.categoryId,
                      );
                      const hasSelectedSearch =
                        (selectedPucOption?.expenseGroupId === group.id &&
                          selectedPucOption.id === form.categoryId);
                      const selected =
                        hasSelectedShortcut || hasSelectedSearch;

                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => selectGroup(group.id)}
                          className={cn(
                            "flex min-h-16 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98]",
                            selected
                              ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                              : "border-neutral-200 bg-white text-neutral-800 active:bg-neutral-50",
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF2F8] text-[#0B3F64]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium leading-tight">
                            {group.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2">
                      <p className="text-sm font-semibold text-neutral-900">
                        {selectedGroup.label}
                      </p>
                      {selectedGroup.helperText && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {selectedGroup.helperText}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedGroup.shortcuts.map((shortcut) => {
                        const Icon =
                          SHORTCUT_ICONS[shortcut.icon ?? selectedGroup.icon];
                        const selected = form.categoryId === shortcut.pucCode;

                        return (
                          <button
                            key={shortcut.id}
                            type="button"
                            onClick={() => {
                              setSelectedPucOption(null);
                              setSearchOpen(false);
                              setForm((previous) => ({
                                ...previous,
                                categoryId: shortcut.pucCode,
                              }));
                            }}
                            className={cn(
                              "min-h-[76px] rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98]",
                              selected
                                ? "border-emerald-400 bg-emerald-50 shadow-[0_6px_18px_rgba(5,150,105,0.12)]"
                                : "border-neutral-200 bg-white active:bg-neutral-50",
                            )}
                          >
                            <span className="flex items-start gap-2">
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3F64]" />
                              <span className="text-xs font-medium leading-tight text-neutral-900">
                                {shortcut.label}
                              </span>
                            </span>
                            <span className="mt-2 block text-[10px] font-medium tracking-wide text-neutral-400">
                              PUC {shortcut.pucCode}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setSearchOpen((previous) => !previous)}
                        className={cn(
                          "min-h-[76px] rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98]",
                          selectedPucOption?.expenseGroupId ===
                            selectedGroup.id &&
                            selectedPucOption.id === form.categoryId
                            ? "border-emerald-400 bg-emerald-50 shadow-[0_6px_18px_rgba(5,150,105,0.12)]"
                            : "border-neutral-200 bg-white active:bg-neutral-50",
                        )}
                      >
                        <span className="flex items-start gap-2">
                          <Search className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3F64]" />
                          <span className="text-xs font-medium leading-tight text-neutral-900">
                            {selectedPucOption?.expenseGroupId ===
                              selectedGroup.id &&
                            selectedPucOption.id === form.categoryId
                              ? selectedPucOption.name
                              : "Buscar otro gasto..."}
                          </span>
                        </span>
                        {selectedPucOption?.expenseGroupId ===
                          selectedGroup.id &&
                          selectedPucOption.id === form.categoryId && (
                          <span className="mt-2 block text-[10px] font-medium tracking-wide text-neutral-400">
                            PUC {selectedPucOption.code}
                          </span>
                        )}
                      </button>
                    </div>

                    {searchOpen && (
                      <div className="mt-2">
                        <SearchSelect<ExpensePucSearchOption>
                          label="Buscar gasto"
                          labelClassName="sr-only"
                          value={null}
                          placeholder="Buscar cuenta PUC..."
                          emptyText="No se encontraron gastos en esta categoría."
                          buttonLabel="Buscar"
                          buttonColorClassName="bg-[#0B3F64] hover:bg-[#0B3F64]/90"
                          search={searchExpenseAccounts}
                          onSelect={(account) => {
                            setSelectedPucOption(account);
                            setForm((previous) => ({
                              ...previous,
                              categoryId: account.id,
                            }));
                            setSearchOpen(false);
                          }}
                          renderOption={(account) => (
                            <>
                              <span className="shrink-0 text-sm font-semibold text-neutral-800">
                                {account.code}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-sm leading-5 text-neutral-600">
                                  {account.name}
                                </div>
                                {account.parentName && (
                                  <div className="mt-1 text-[11px] font-medium text-neutral-400">
                                    {account.parentName}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Fecha del gasto
                </span>
                <DayPickerCalendar
                  id="expense-date-picker"
                  selectedDate={selectedCalendarDate}
                  todayDate={todayCalendarDate}
                  tone="blue"
                  onSelectDate={(date) =>
                    setForm((previous) => ({
                      ...previous,
                      occurredOn: formatLocalDateKey(date),
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                    Monto
                  </span>
                  <input
                    inputMode="numeric"
                    value={formatAmount(form.amount)}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        amount: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                    placeholder="$ 0"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                    Hora <span className="font-normal">(opcional)</span>
                  </span>
                  <input
                    type="time"
                    value={form.occurredTime}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        occurredTime: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                  />
                </label>
              </div>

              <SegmentedControl
                label="Medio de pago"
                value={form.paymentMethod}
                options={[
                  { value: "CASH", label: "Efectivo" },
                  { value: "TRANSFER", label: "Transferencia" },
                ]}
                onChange={(value) =>
                  setForm((previous) => ({
                    ...previous,
                    paymentMethod: value as ManualPaidOutflowPaymentMethod,
                  }))
                }
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Descripción <span className="font-normal">(opcional)</span>
                </span>
                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                  placeholder="Ej. Compra de insumos"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Dirigido a / Beneficiario{" "}
                  <span className="font-normal">(opcional)</span>
                </span>
                <input
                  value={form.counterpartyName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      counterpartyName: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 outline-none focus:border-emerald-300"
                  placeholder="Persona, proveedor o empresa"
                />
              </label>
            </div>

            <div
              className="flex shrink-0 gap-3 border-t border-neutral-100 bg-white px-5 pt-4"
              style={{
                paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))",
              }}
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
