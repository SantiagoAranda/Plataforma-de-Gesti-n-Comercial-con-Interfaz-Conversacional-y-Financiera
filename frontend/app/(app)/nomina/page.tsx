"use client";

import { type InputHTMLAttributes, type ReactNode, useCallback, useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  Edit3,
  FileText,
  Info,
  ListChecks,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
  X,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import { PayrollChatActionBar } from "@/src/components/payroll/PayrollChatActionBar";
import { SearchSelect, type SearchSelectOption } from "@/src/components/shared/SearchSelect";
import { AppApiError } from "@/src/lib/api";
import {
  type ArlRiskClass,
  type CalculatePayrollPayload,
  type CiiuActivity,
  type Contract,
  type Employee,
  type MoneyLike,
  type OvertimeType,
  type PayrollPeriod,
  type PayrollPayment,
  type PayrollRun,
  type Settlement,
  type PayrollBenefitPayment,
  numberValue,
  payrollApi,
} from "@/src/lib/payroll/api";
import { cn } from "@/src/lib/utils";
import { useLongPress } from "@/src/hooks/useLongPress";

const PAYROLL_OVERTIME_ITEMS: Array<{ type: OvertimeType; label: string; hint: string }> = [
  { type: "HORA_EXTRA_DIURNA", label: "Extra diurna", hint: "+25%" },
  { type: "HORA_EXTRA_NOCTURNO", label: "Extra nocturna", hint: "+75%" },
  { type: "HORA_ORDINARIA_NOCTURNA", label: "Recargo nocturno", hint: "+35%" },
  { type: "HORA_EXTRA_DOM_FESTIVO", label: "Extra dom/festiva diurna", hint: "+105%" },
  { type: "HORA_EXTRA_NOCTURNO_DOM_FESTIVO", label: "Extra dom/festiva nocturna", hint: "+155%" },
  { type: "HORA_DOMINICAL_FESTIVO", label: "Recargo dominical/festivo", hint: "+80%" },
];
const overtimeInputs = PAYROLL_OVERTIME_ITEMS;

type WizardStep = 0 | 1 | 2 | 3;

function SheetShell({
  open,
  title,
  subtitle,
  accent = "text-[#0fb18f]",
  onClose,
  children,
  footer,
  maxWidth = "sm:max-w-lg",
}: {
  open: boolean;
  title: string;
  subtitle: string;
  accent?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:p-4">
      <div className={cn(
        "relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]",
        maxWidth,
      )}>
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 bg-white px-5 pb-4 pt-3">
          <div>
            <h2 className="text-lg font-medium text-neutral-900">{title}</h2>
            <p className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-widest", accent)}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50/30 px-5 py-4">
          {children}
          <div className="h-20" />
        </div>
        <div className="absolute inset-x-0 bottom-0 border-t border-neutral-100 bg-white/95 px-5 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
          {footer}
        </div>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function BigInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 outline-none transition placeholder:font-medium placeholder:text-neutral-400 focus:border-emerald-400 focus:bg-white",
        props.className,
      )}
    />
  );
}

function SegmentedOption<T extends string>({
  value,
  current,
  onChange,
  children,
  disabled,
}: {
  value: T;
  current: T;
  onChange: (value: T) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(value)}
      className={cn(
        "h-10 rounded-xl px-3 text-xs font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "bg-[#0fb18f] text-white shadow-sm"
          : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
      )}
    >
      {children}
    </button>
  );
}

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function toNumber(value: MoneyLike) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: MoneyLike) {
  return toNumber(value).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatOneDecimalComma(value: number) {
  return value.toFixed(1).replace(".", ",");
}

function formatSettlementVacationDays(value: number) {
  return formatOneDecimalComma(Math.ceil(value * 10) / 10);
}

function shortMoney(value: MoneyLike) {
  const n = toNumber(value);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return money(n);
}

function serviceBonusPreviewValue(run: PayrollRun) {
  return (
    run.usedParameters?.serviceBonusPreview ??
    run.usedParameters?.serviceBonusProjected ??
    (run as { serviceBonusPreview?: MoneyLike }).serviceBonusPreview
  );
}

function payrollRunViewModel(run: PayrollRun) {
  const transportAllowance = toNumber(run.transportAllowance);
  const connectivityAllowance = toNumber(run.connectivityAllowance);
  const allowanceValue = run.contract?.isRemote ? connectivityAllowance : transportAllowance;
  const allowanceLabel = run.contract?.isRemote ? "Auxilio de conectividad" : "Auxilio transporte";
  const employeeHealth = toNumber(run.employeeHealth);
  const employeePension = toNumber(run.employeePension);
  const deductions =
    employeeHealth +
    employeePension +
    toNumber(run.solidarityFund) +
    toNumber(run.withholdingTax);
  const salaryPayments = (run.payments ?? [])
    .filter((payment) => payment.type === "SALARY_PAYMENT")
    .sort((a, b) => (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1));
  const allPaid = salaryPayments.length > 0 && salaryPayments.every((payment) => payment.status === "PAID");

  return {
    allowanceLabel,
    allowanceValue,
    employeeHealth,
    employeePension,
    deductions,
    salaryPayments,
    allPaid,
    paymentStatusLabel: allPaid ? "Pagada" : "Pendiente pago",
  };
}

function translatePayrollError(message: string): string {
  if (message.includes("Employee has an active contract")) return "Este empleado tiene un contrato activo. Primero debes inactivar o liquidar el contrato.";
  if (message.includes("Employee has payroll history and cannot be hard deleted")) return "Este empleado tiene historial de nómina y no puede eliminarse definitivamente.";
  if (message.includes("Contract has posted payroll history")) return "Este contrato ya tiene nómina liquidada. Para cambiar datos críticos, crea una nueva versión de contrato.";
  return message;
}

function payrollErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof AppApiError)) return fallback;
  const detailsMessage = Array.isArray(error.details?.message)
    ? error.details.message.join(" | ")
    : error.details?.message;
  return translatePayrollError(detailsMessage || error.message || fallback);
}

function runLoanDeductionValue(run?: PayrollRun | null) {
  return (
    run?.usedParameters?.deductionsBreakdown?.loanDeduction ??
    run?.usedParameters?.loanDeduction ??
    run?.loanDeduction ??
    0
  );
}

function runOtherDeductionsValue(run?: PayrollRun | null) {
  return (
    run?.usedParameters?.deductionsBreakdown?.otherDeductions ??
    run?.otherDeductions ??
    run?.usedParameters?.otherDeductions ??
    0
  );
}

function formatCivilDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = typeof value === "string" ? value : value.toISOString();
  const isoDate = date.slice(0, 10);
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return "-";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function employeeName(employee: Employee) {
  return `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "Empleado";
}

function initials(employee: Employee) {
  return `${employee.firstName?.[0] ?? ""}${employee.lastName?.[0] ?? ""}`.toUpperCase() || "N";
}

function employeeRole(employee: Employee, _contract?: Contract | null) {
  return employee.position?.trim() || "Empleado";
}

function dateOnlyUtc(value?: string | null) {
  if (!value) return null;
  const [datePart] = value.split("T");
  const parts = datePart.split("-").map(Number);
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function periodRangeUtc(period?: PayrollPeriod) {
  if (!period) return null;
  return {
    start: Date.UTC(period.year, period.month - 1, 1),
    end: Date.UTC(period.year, period.month, 0),
  };
}

function isContractActiveForPeriod(contract?: Contract | null, period?: PayrollPeriod) {
  if (!contract || contract.isActive === false) return false;
  const start = dateOnlyUtc(contract.startDate);
  const end = dateOnlyUtc(contract.endDate);
  const range = periodRangeUtc(period);
  if (!range) return true;
  return (start === null || start <= range.end) && (end === null || end >= range.start);
}

function findActiveContract(contracts?: Contract[], period?: PayrollPeriod) {
  return contracts?.find((contract) => isContractActiveForPeriod(contract, period)) ?? null;
}

function isPeriodEditable(period?: PayrollPeriod) {
  return Boolean(period && period.status !== "POSTED" && period.status !== "CLOSED");
}

function isoDate(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function settlementDefaultEndDate(contract?: Contract | null, period?: PayrollPeriod) {
  if (!period) return isoDate(contract?.endDate);
  const periodYearEnd = `${period.year}-12-31`;
  const contractEnd = isoDate(contract?.endDate);
  if (!contractEnd) return periodYearEnd;
  return contractEnd > periodYearEnd ? periodYearEnd : contractEnd;
}

function payrollSimulationKey(employeeId: string, contractId?: string | null, periodId?: string | null) {
  return `${employeeId}:${contractId ?? "no-contract"}:${periodId ?? "no-period"}`;
}

function isPrimaryMonthlyPeriod(period?: PayrollPeriod | null) {
  return Boolean(period && period.paymentCycle === "MONTHLY" && (period.installmentNumber ?? 1) === 1);
}

function choosePrimaryMonthlyPeriod(periods: PayrollPeriod[], year: number, month: number) {
  const candidates = periods.filter(
    (period) => period.year === year && period.month === month && isPrimaryMonthlyPeriod(period),
  );
  return candidates.find((period) => period.status === "POSTED" || period.status === "CLOSED")
    ?? candidates.find((period) => period.status === "CALCULATED")
    ?? candidates[0]
    ?? null;
}

function getPrimaDateRange(contract: Contract | null | undefined, currentYear: number) {
  if (!contract?.startDate) return "1 ene \u2013 31 dic";
  
  const parseDateStr = (dateStr: string) => {
    const parts = dateStr.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  };
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  };

  const start = parseDateStr(contract.startDate);
  const startYear = start.getUTCFullYear();
  
  const end = contract.endDate ? parseDateStr(contract.endDate) : null;
  const endYear = end ? end.getUTCFullYear() : null;

  const startStr = startYear < currentYear ? "1 ene" : formatDate(start);
  const endStr = (!end || endYear! > currentYear) ? "31 dic" : formatDate(end);

  return `${startStr} \u2013 ${endStr}`;
}



function SummaryCard({
  period,
  totalCost,
  totalNet,
}: {
  period?: PayrollPeriod;
  totalCost: number;
  totalNet: number;
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const diff = totalCost - totalNet;
  const percent = totalNet > 0 ? (diff / totalNet) * 100 : 0;

  let statusText = "Sin periodo";
  if (period?.status === "POSTED") statusText = "Pagada";
  else if (period?.status === "CALCULATED") statusText = "Pendiente pago";
  else if (period?.status === "OPEN") statusText = "Abierto";
  else if (period?.status === "CLOSED") statusText = "Cerrado";

  return (
    <section className={cn(
      "relative overflow-hidden rounded-[28px] bg-[#0fb18f] bg-[linear-gradient(135deg,#0fb18f_0%,#26c7a6_48%,#80dcc7_100%)] text-white shadow-[0_18px_42px_rgba(15,177,143,0.28)] transition-all duration-300 ease-in-out",
      isMinimized ? "px-4 py-3" : "px-4 py-3.5 lg:px-4 lg:py-3"
    )}>
      {isMinimized ? (
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <h1 className="text-base font-medium tracking-tight shrink-0">
              {period ? `${monthNames[period.month - 1]} ${period.year}` : "Nómina"}
            </h1>
            <span className="rounded-full bg-white/18 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur shrink-0">
              {statusText}
            </span>
            <span className="hidden sm:inline-block text-white/30 font-light">|</span>
            <div className="flex items-center gap-1.5 text-xs text-white/95">
              <span className="font-semibold text-[9px] uppercase tracking-wider text-white/78">Costo laboral real:</span>
              <span className="font-medium text-sm tabular-nums">{money(totalCost)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="ml-2 p-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition shrink-0 active:scale-95"
            aria-label="Expandir resumen"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 lg:mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl lg:text-lg font-medium tracking-tight">
                {period ? `${monthNames[period.month - 1]} ${period.year}` : "Nómina"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/18 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                {statusText}
              </span>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition active:scale-95"
                aria-label="Minimizar resumen"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3 lg:space-y-2.5">
            <div>
              <p className="mb-0.5 text-[10px] lg:text-[9px] font-medium uppercase tracking-wider text-white/78">Costo laboral real</p>
              <p className="text-2xl lg:text-xl font-medium tabular-nums">{money(totalCost)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:gap-1.5">
              <div className="rounded-2xl bg-white/14 p-2.5 lg:p-2 backdrop-blur">
                <p className="mb-0.5 text-[9px] font-medium uppercase tracking-wider text-white/78">Neto a pagar</p>
                <p className="text-base lg:text-sm font-medium tabular-nums">{money(totalNet)}</p>
              </div>
              <div className="rounded-2xl bg-white/14 p-2.5 lg:p-2 backdrop-blur">
                <p className="mb-0.5 text-[9px] font-medium uppercase tracking-wider text-white/78">Deducciones, cargas y provisiones</p>
                <div className="flex flex-col gap-1 lg:gap-0.5">
                  <p className="text-base lg:text-sm font-medium tabular-nums">{money(diff)}</p>
                  <span className="self-start rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium text-white">
                    {percent.toFixed(1)}% sobre neto
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

type PayrollConfirmIntent = "payroll" | "settlement" | "visual";

function PayrollConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  intent,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  intent: PayrollConfirmIntent;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const intentClasses: Record<PayrollConfirmIntent, string> = {
    payroll: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    settlement: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
    visual: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200",
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-[28px] border border-white/60 bg-white p-5 shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-60"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-11 rounded-2xl bg-slate-100 text-sm font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-11 rounded-2xl border text-sm font-medium transition disabled:opacity-60",
              intentClasses[intent],
            )}
          >
            {loading ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MoneyLine({
  label,
  value,
  color = "text-slate-700",
  valueColor = "text-slate-900",
  indent = false,
  medium = false,
  sign,
}: {
  label: string;
  value: MoneyLike;
  color?: string;
  valueColor?: string;
  indent?: boolean;
  medium?: boolean;
  sign?: "+" | "-";
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-[13px]", indent && "pl-4")}>
      <span className={cn("font-normal", color)}>{label}</span>
      <span className={cn("tabular-nums", valueColor, medium ? "font-medium" : "font-normal")}>
        {sign ? `${sign} ${money(value)}` : money(value)}
      </span>
    </div>
  );
}

function SectionBreakdown({
  title,
  color,
  totalLabel,
  rows,
}: {
  title: string;
  color: string;
  totalLabel?: string;
  rows: Array<{ label: string; value: MoneyLike }>;
}) {
  const total = rows.reduce((acc, row) => acc + toNumber(row.value), 0);

  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <p className="text-[12px] font-medium text-slate-800">{title}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <MoneyLine key={row.label} label={row.label} value={row.value} color="text-slate-500" />
        ))}
        <div className="mt-2 border-t border-slate-200/80 pt-2">
          <MoneyLine
            label={totalLabel ?? `Total ${title}`}
            value={total}
            color="text-slate-800"
            medium
            valueColor="text-slate-900"
          />
        </div>
      </div>
    </div>
  );
}

function HeaderCalendar({
  periods,
  selectedId,
  onChange,
  onCreateOrSelect
}: {
  periods: PayrollPeriod[];
  selectedId: string;
  onChange: (id: string) => void;
  onCreateOrSelect: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const monthlyPeriods = periods.filter(isPrimaryMonthlyPeriod);
  const selectedPeriod = monthlyPeriods.find(p => p.id === selectedId);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
      >
        <CalendarDays className="h-4 w-4" />
        <span>
          {selectedPeriod ? `${monthNames[selectedPeriod.month - 1].substring(0, 3)} ${selectedPeriod.year}` : "Mes"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => setViewYear(y => y - 1)} className="p-1 text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-5 w-5"/></button>
            <span className="font-semibold text-neutral-800">{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="p-1 text-neutral-500 hover:text-neutral-900"><ChevronRight className="h-5 w-5"/></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {monthNames.map((name, i) => {
              const month = i + 1;
              const periodExists = choosePrimaryMonthlyPeriod(monthlyPeriods, viewYear, month);
              const isSelected = selectedPeriod?.year === viewYear && selectedPeriod?.month === month;
              
              return (
                <button
                  key={month}
                  onClick={() => {
                    if (periodExists) {
                      onChange(periodExists.id);
                    } else {
                      onCreateOrSelect(viewYear, month);
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-xl py-2 text-[13px] font-medium transition-colors",
                    isSelected 
                      ? "bg-[#0fb18f] text-white" 
                      : "border border-neutral-100 bg-white text-slate-700 hover:bg-neutral-50"
                  )}
                >
                  {name.substring(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type PayrollSheetMode = "editEmployee" | "createEmployee" | "createContract" | "createContractForEmployee";

type PayrollSheetTab<T extends string = string> = {
  id: T;
  label: string;
};

type EmployeeDraft = {
  firstName: string;
  lastName: string;
  documentNumber: string;
  position: string;
  phone: string;
  email: string;
};

type ContractDraft = {
  salaryMonthly: string;
  startDate: string;
  endDate: string;
  contractType: "INDEFINITE" | "FIXED_TERM";
  arlRiskClassId: string;
  applyLaw1819: boolean;
  isRemote: boolean;
  paymentCycle: "MONTHLY" | "BIWEEKLY";
};

type AdjustmentsDraft = {
  workedDays: string;
  loans: string;
  commissions: string;
  nonSalaryBonus: string;
  otherDeductions: string;
  simulatedEndDate: string;
  overtimeHours: Record<OvertimeType, string>;
};

function PayrollEmployeeHeader({
  title,
  subtitle,
  documentNumber,
  role,
  onClose,
}: {
  title: string;
  subtitle: string;
  documentNumber?: string | null;
  role?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-medium text-slate-900">{title}</h2>
        <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
          {subtitle || [documentNumber || "Sin doc.", role || "Empleado"].filter(Boolean).join(" • ")}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
        aria-label="Cerrar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function PayrollEmployeeTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Array<PayrollSheetTab<T>>;
  activeTab: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-medium transition-colors",
            activeTab === tab.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PayrollSheetFooter({
  error,
  primaryLabel,
  submitting,
  primaryDisabled,
  onCancel,
  onPrimary,
}: {
  error?: string | null;
  primaryLabel: string;
  submitting?: boolean;
  primaryDisabled?: boolean;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)]">
      {error && <p className="mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 rounded-2xl bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={submitting || primaryDisabled}
          className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white shadow-lg shadow-emerald-100 hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Guardando..." : primaryLabel}
        </button>
      </div>
    </div>
  );
}

function PayrollEmployeeSheetShell<T extends string>({
  open,
  title,
  subtitle,
  documentNumber,
  role,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  documentNumber?: string | null;
  role?: string | null;
  tabs: Array<PayrollSheetTab<T>>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  if (!open) return null;

  const changeTab = (tab: T) => {
    onTabChange(tab);
    window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex h-[88dvh] max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl transition-transform animate-in slide-in-from-bottom sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-[720px] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]">
        <div className="shrink-0 border-b border-neutral-100 bg-white px-5 pb-4 pt-4">
          <PayrollEmployeeHeader
            title={title}
            subtitle={subtitle}
            documentNumber={documentNumber}
            role={role}
            onClose={onClose}
          />
          <PayrollEmployeeTabs tabs={tabs} activeTab={activeTab} onChange={changeTab} />
        </div>
        <div ref={contentRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50/30 px-5 py-4 pb-28 overscroll-contain">
          {children}
        </div>
        {footer}
      </div>
    </>
  );
}

function EmployeeFormSection({
  value,
  onChange,
}: {
  value: EmployeeDraft;
  onChange: (value: EmployeeDraft) => void;
}) {
  const update = (patch: Partial<EmployeeDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldBlock label="Nombre">
          <BigInput value={value.firstName} onChange={(event) => update({ firstName: event.target.value })} placeholder="Juan" />
        </FieldBlock>
        <FieldBlock label="Apellido">
          <BigInput value={value.lastName} onChange={(event) => update({ lastName: event.target.value })} placeholder="Perez" />
        </FieldBlock>
        <FieldBlock label="Documento">
          <BigInput value={value.documentNumber} onChange={(event) => update({ documentNumber: event.target.value })} placeholder="123456789" />
        </FieldBlock>
        <FieldBlock label="Cargo">
          <BigInput value={value.position} onChange={(event) => update({ position: event.target.value })} placeholder="Auxiliar" />
        </FieldBlock>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldBlock label="Telefono">
          <BigInput value={value.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="3001234567" />
        </FieldBlock>
        <FieldBlock label="Correo opcional">
          <BigInput value={value.email} onChange={(event) => update({ email: event.target.value })} placeholder="correo@empresa.com" type="email" />
        </FieldBlock>
      </div>
    </div>
  );
}

function ContractFormSection({
  value,
  arlRisks,
  onChange,
}: {
  value: ContractDraft;
  arlRisks: ArlRiskClass[];
  onChange: (value: ContractDraft) => void;
}) {
  const update = (patch: Partial<ContractDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldBlock label="Fecha ingreso">
          <BigInput value={value.startDate} onChange={(event) => update({ startDate: event.target.value })} type="date" />
        </FieldBlock>
        <FieldBlock label="Fecha salida">
          <BigInput value={value.endDate} onChange={(event) => update({ endDate: event.target.value })} type="date" />
        </FieldBlock>
      </div>

      <FieldBlock label="Salario mensual">
        <BigInput 
          value={value.salaryMonthly ? Number(value.salaryMonthly.replace(/\D/g, "")).toLocaleString("es-CO") : ""} 
          onChange={(event) => {
            const val = event.target.value.replace(/\D/g, "");
            update({ salaryMonthly: val });
          }} 
          placeholder="3.000.000" 
          type="text" 
          inputMode="numeric"
        />
      </FieldBlock>

      <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
        <span className="mb-2 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">ARL</span>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((level) => {
            const risk = arlRisks.find((item) => item.level === level);
            const selected = value.arlRiskClassId === risk?.id;
            return (
              <button
                key={level}
                type="button"
                disabled={!risk}
                onClick={() => risk && update({ arlRiskClassId: risk.id })}
                className={cn(
                  "h-10 rounded-xl text-[11px] font-medium transition disabled:opacity-40",
                  selected ? "bg-blue-500 text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700",
                )}
              >
                Riesgo {level}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
        <span className="mb-2 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">Configuracion adicional</span>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => update({ isRemote: !value.isRemote })} className={cn("h-11 rounded-xl text-xs font-medium", value.isRemote ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
            Trabajo remoto
          </button>
          <button type="button" onClick={() => update({ applyLaw1819: !value.applyLaw1819 })} className={cn("h-11 rounded-xl text-xs font-medium", value.applyLaw1819 ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
            Exonerado Ley 1819
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
        <span className="mb-2 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">Ciclo de pago</span>
        <div className="grid grid-cols-1 gap-2">
          <SegmentedOption value="MONTHLY" current={value.paymentCycle} onChange={(paymentCycle) => update({ paymentCycle })}>Mensual</SegmentedOption>
        </div>
      </div>
    </div>
  );
}

function PayrollAdjustmentsSection({
  value,
  onChange,
  disabled,
}: {
  value: AdjustmentsDraft;
  onChange: (value: AdjustmentsDraft) => void;
  disabled?: boolean;
}) {
  const update = (patch: Partial<AdjustmentsDraft>) => onChange({ ...value, ...patch });
  const totalOvertimeHours = overtimeInputs.reduce(
    (sum, item) => sum + numberValue(value.overtimeHours[item.type]),
    0,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldBlock label="Dias trabajados">
          <BigInput value={value.workedDays} onChange={(event) => update({ workedDays: event.target.value })} type="number" min="1" max="30" disabled={disabled} />
        </FieldBlock>
        <FieldBlock label="Prestamos">
          <BigInput value={value.loans} onChange={(event) => update({ loans: event.target.value })} type="number" min="0" disabled={disabled} />
        </FieldBlock>
        <FieldBlock label="Comisiones salariales">
          <BigInput value={value.commissions} onChange={(event) => update({ commissions: event.target.value })} type="number" min="0" disabled={disabled} />
        </FieldBlock>
        <FieldBlock label="Bonos no salariales">
          <BigInput value={value.nonSalaryBonus} onChange={(event) => update({ nonSalaryBonus: event.target.value })} type="number" min="0" disabled={disabled} />
        </FieldBlock>
        <FieldBlock label="Otras deducciones">
          <BigInput value={value.otherDeductions} onChange={(event) => update({ otherDeductions: event.target.value })} type="number" min="0" disabled={disabled} />
        </FieldBlock>
        <FieldBlock label="Fecha salida simulada">
          <BigInput value={value.simulatedEndDate} onChange={(event) => update({ simulatedEndDate: event.target.value })} type="date" disabled={disabled} />
        </FieldBlock>
      </div>

      <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Trabajo suplementario</span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-medium text-neutral-500">{totalOvertimeHours} h</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {overtimeInputs.map((item) => (
            <label key={item.type} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-2">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-medium text-neutral-700">{item.label}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#0fb18f]">{item.hint}</span>
              </span>
              <input
                value={value.overtimeHours[item.type]}
                onChange={(event) =>
                  update({
                    overtimeHours: {
                      ...value.overtimeHours,
                      [item.type]: event.target.value,
                    },
                  })
                }
                type="number"
                min="0"
                disabled={disabled}
                className="mt-2 h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-right text-sm font-semibold outline-none focus:border-emerald-400 disabled:opacity-60"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

const defaultOvertimeHours = (): Record<OvertimeType, string> => ({
  HORA_EXTRA_DIURNA: "0",
  HORA_EXTRA_NOCTURNO: "0",
  HORA_ORDINARIA_NOCTURNA: "0",
  HORA_EXTRA_DOM_FESTIVO: "0",
  HORA_EXTRA_NOCTURNO_DOM_FESTIVO: "0",
  HORA_DOMINICAL_FESTIVO: "0",
  HORA_DOM_FESTIVO_NOCTURNO: "0",
});

const createEmployeeTabs: Array<PayrollSheetTab<"empleado" | "contrato">> = [
  { id: "empleado", label: "Empleado" },
  { id: "contrato", label: "Contrato" },
];

const createEmployeeOnlyTabs: Array<PayrollSheetTab<"empleado">> = [
  { id: "empleado", label: "Empleado" },
];

const createContractOnlyTabs: Array<PayrollSheetTab<"contrato">> = [
  { id: "contrato", label: "Contrato" },
];

function PayrollQuickEmployeeSheet({
  open,
  mode,
  initialEmployee,
  employees,
  arlRisks,
  selectedPeriod,
  onClose,
  onChanged,
}: {
  open: boolean;
  mode: Exclude<PayrollSheetMode, "editEmployee"> | null;
  initialEmployee?: Employee | null;
  employees: Employee[];
  arlRisks: ArlRiskClass[];
  selectedPeriod?: PayrollPeriod;
  onClose: () => void;
  onChanged: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState<"empleado" | "contrato">("empleado");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [createdEmployee, setCreatedEmployee] = useState<Employee | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeDraft>({
    firstName: "",
    lastName: "",
    documentNumber: "",
    position: "",
    phone: "",
    email: "",
  });
  const [contractDraft, setContractDraft] = useState<ContractDraft>({
    salaryMonthly: "",
    startDate: todayIso,
    endDate: "",
    contractType: "INDEFINITE",
    arlRiskClassId: "",
    applyLaw1819: true,
    isRemote: false,
    paymentCycle: "MONTHLY",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEmployee = employees.find((employee) => employee.id === employeeId)
    ?? (createdEmployee?.id === employeeId ? createdEmployee : null)
    ?? (initialEmployee?.id === employeeId ? initialEmployee : null);
  const activeContract = selectedEmployee
    ? findActiveContract(selectedEmployee.contracts, selectedPeriod)
      ?? selectedEmployee.contracts?.find((contract) => contract.isActive !== false && !contract.endDate)
      ?? null
    : null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setActiveTab(mode === "createContractForEmployee" ? "contrato" : "empleado");
    setEmployeeId(initialEmployee?.id ?? "");
    setCreatedEmployee(null);
    setEmployeeDraft({
      firstName: "",
      lastName: "",
      documentNumber: "",
      position: "",
      phone: "",
      email: "",
    });
    setContractDraft({
      salaryMonthly: "",
      startDate: todayIso,
      endDate: "",
      contractType: "INDEFINITE",
      arlRiskClassId: "",
      applyLaw1819: true,
      isRemote: false,
      paymentCycle: "MONTHLY",
    });
  }, [initialEmployee, open, mode, selectedPeriod, todayIso]);

  if (!open || !mode) return null;

  const closeWithDirtyCheck = () => {
    const hasEmployeeData = Object.values(employeeDraft).some((value) => value.trim());
    const hasContractData = contractDraft.salaryMonthly.trim() || contractDraft.endDate.trim() || employeeId;
    if (hasEmployeeData || hasContractData) {
      toast((t) => (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-900">Hay cambios sin guardar.</p>
          <div className="flex gap-2">
            <button onClick={() => toast.dismiss(t.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Seguir editando</button>
            <button onClick={() => { toast.dismiss(t.id); onClose(); }} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Descartar</button>
          </div>
        </div>
      ), { duration: Infinity });
      return;
    }
    onClose();
  };

  const validateEmployeeDraft = () => {
    if (!employeeDraft.firstName.trim()) return "El nombre es obligatorio.";
    if (!employeeDraft.lastName.trim()) return "El apellido es obligatorio.";
    if (!employeeDraft.documentNumber.trim()) return "El documento es obligatorio.";
    if (!employeeDraft.position.trim()) return "El cargo es obligatorio.";
    return null;
  };

  const validateContractDraft = (requireEmployee: boolean) => {
    if (requireEmployee && !employeeId) return "Selecciona un empleado.";
    if (!contractDraft.startDate) return "La fecha de ingreso es obligatoria.";
    if (numberValue(contractDraft.salaryMonthly) <= 0) return "El salario mensual debe ser mayor a 0.";
    if (!contractDraft.contractType) return "Selecciona el tipo de contrato.";
    if (!contractDraft.arlRiskClassId) return "Selecciona ARL.";
    if (!contractDraft.paymentCycle) return "Selecciona el ciclo de pago.";
    return null;
  };

  const buildContractPayload = () => ({
    contractType: contractDraft.contractType,
    salaryMonthly: numberValue(contractDraft.salaryMonthly),
    startDate: contractDraft.startDate,
    endDate: contractDraft.endDate || undefined,
    isRemote: contractDraft.isRemote,
    applyLaw1819: contractDraft.applyLaw1819,
    paymentCycle: contractDraft.paymentCycle,
    arlRiskClassId: contractDraft.arlRiskClassId,
  });

  const save = async () => {
    if (activeTab === "empleado") {
      if (createdEmployee) {
        setActiveTab("contrato");
        setError(null);
        return;
      }
      const employeeValidation = validateEmployeeDraft();
      if (employeeValidation) {
        setActiveTab("empleado");
        return setError(employeeValidation);
      }
      setSubmitting(true);
      setError(null);
      try {
        const employee = await payrollApi.createEmployee({
          firstName: employeeDraft.firstName.trim(),
          lastName: employeeDraft.lastName.trim(),
          documentNumber: employeeDraft.documentNumber.trim(),
          position: employeeDraft.position.trim(),
          email: employeeDraft.email.trim() || undefined,
          phone: employeeDraft.phone.trim() || undefined,
        });
        toast.success("Empleado creado.");
        setCreatedEmployee(employee);
        setEmployeeId(employee.id);
        onChanged();
        setActiveTab("contrato");
      } catch (err) {
        setError(err instanceof AppApiError ? err.message : "No se pudo crear el empleado.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selectedEmployee) {
      setActiveTab("contrato");
      return setError("Selecciona un empleado.");
    }
    const contractValidation = validateContractDraft(true);
    if (contractValidation) {
      setActiveTab("contrato");
      return setError(contractValidation);
    }
    if (activeContract) {
      setActiveTab("contrato");
      return setError("Este empleado ya tiene un contrato activo. Para crear uno nuevo, primero debes inactivar el contrato actual.");
    }

    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.createContract(selectedEmployee.id, buildContractPayload());
      toast.success("Contrato creado.");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo crear el contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  const inactivateCurrentContract = async () => {
    if (!activeContract) return toast("Función pendiente de implementación.");
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.deleteContract(activeContract.id);
      toast.success("Contrato inactivado");
      onChanged();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo inactivar el contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  type EmployeeSearchOption = SearchSelectOption & { employee: Employee };
  const selectedEmployeeOption: EmployeeSearchOption | null = selectedEmployee
    ? {
        id: selectedEmployee.id,
        title: employeeName(selectedEmployee),
        subtitle: selectedEmployee.documentNumber ?? "Sin doc.",
        meta: selectedEmployee.position ?? "Sin cargo",
        employee: selectedEmployee,
      }
    : null;

  const searchEmployees = (query: string): EmployeeSearchOption[] => {
    const term = query.trim().toLowerCase();
    return employees
      .filter((employee) => {
        if (!term) return true;
        return (
          employee.firstName?.toLowerCase().includes(term) ||
          employee.lastName?.toLowerCase().includes(term) ||
          employeeName(employee).toLowerCase().includes(term) ||
          employee.documentNumber?.toLowerCase().includes(term)
        );
      })
      .slice(0, 12)
      .map((employee) => ({
        id: employee.id,
        title: employeeName(employee),
        subtitle: employee.documentNumber ?? "Sin doc.",
        meta: employee.position ?? "Sin cargo",
        employee,
      }));
  };
  const createContractTabs = createContractOnlyTabs;
  const createContractTab = activeTab;
  const setCreateContractTab = setActiveTab;
  const createContract = save;
  const filteredEmployees = searchEmployees(employeeSearch).map((option) => option.employee);

  if (mode === "createEmployee") {
    return (
      <PayrollEmployeeSheetShell
        open={open}
        title="Nuevo empleado"
        subtitle="Carga inicial de datos laborales"
        tabs={createEmployeeTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={closeWithDirtyCheck}
        footer={
          <PayrollSheetFooter
            error={error}
            primaryLabel={activeTab === "empleado" ? (createdEmployee ? "Ir a contrato" : "Crear empleado") : "Crear contrato"}
            submitting={submitting}
            onCancel={closeWithDirtyCheck}
            onPrimary={save}
          />
        }
      >
        {activeTab === "empleado" && (
          createdEmployee ? (
            <div className="space-y-3">
              <p className="rounded-[20px] border border-emerald-100 bg-emerald-50 p-3 text-xs font-medium leading-relaxed text-emerald-800">
                Empleado creado
              </p>
              <div className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="text-sm font-medium text-slate-900">{employeeName(createdEmployee)}</p>
                <p className="mt-1 text-xs text-slate-500">{createdEmployee.documentNumber ?? "Sin doc."} • {createdEmployee.position || "Sin cargo"}</p>
              </div>
            </div>
          ) : selectedEmployee ? (
            <div className="space-y-3">
              <p className="rounded-[20px] border border-emerald-100 bg-emerald-50 p-3 text-xs font-medium leading-relaxed text-emerald-800">
                Se usara el empleado existente seleccionado en Contrato. No se creara un empleado duplicado.
              </p>
              <div className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="text-sm font-medium text-slate-900">{employeeName(selectedEmployee)}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedEmployee.documentNumber ?? "Sin doc."} • {selectedEmployee.position || "Sin cargo"}</p>
                <button
                  type="button"
                  onClick={() => setEmployeeId("")}
                  className="mt-3 h-10 rounded-xl bg-slate-100 px-4 text-xs font-medium text-slate-600"
                >
                  Crear empleado nuevo
                </button>
              </div>
            </div>
          ) : (
            <EmployeeFormSection value={employeeDraft} onChange={setEmployeeDraft} />
          )
        )}
        {activeTab === "contrato" && (
          <>
            {createdEmployee && (
              <div className="rounded-[20px] border border-neutral-100 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Contrato para</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{employeeName(createdEmployee)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{createdEmployee.documentNumber ?? "Sin doc."} • {createdEmployee.position || "Sin cargo"}</p>
              </div>
            )}
            <SearchSelect<EmployeeSearchOption>
              label="Buscar empleado existente"
              value={selectedEmployeeOption}
              placeholder="Buscar por nombre, apellido o documento"
              emptyText="No se encontraron empleados para esa busqueda."
              selectedLabel="Empleado seleccionado"
              search={searchEmployees}
              onSelect={(option) => {
                setEmployeeId(option.employee.id);
                setError(null);
              }}
              renderOption={(option) => (
                <>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-xs font-medium text-[#0f8f76]">
                    {initials(option.employee)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{option.title}</p>
                    <p className="truncate text-xs text-neutral-500">{option.subtitle} • {option.meta}</p>
                  </div>
                </>
              )}
            />
            {activeContract && (
              <div className="space-y-2 rounded-[20px] border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                <p>Este empleado ya tiene un contrato activo. Para crear uno nuevo, primero debes inactivar el contrato actual.</p>
                <button
                  type="button"
                  onClick={inactivateCurrentContract}
                  disabled={submitting}
                  className="h-10 w-full rounded-xl bg-white text-xs font-medium text-amber-800 shadow-sm disabled:opacity-60"
                >
                  Inactivar contrato actual
                </button>
              </div>
            )}
            <ContractFormSection value={contractDraft} arlRisks={arlRisks} onChange={setContractDraft} />
          </>
        )}
      </PayrollEmployeeSheetShell>
    );
  }

  return (
    <PayrollEmployeeSheetShell
      open={open}
      title={selectedEmployee ? employeeName(selectedEmployee) : "Nuevo contrato"}
      subtitle={selectedEmployee ? `${selectedEmployee.documentNumber ?? "Sin doc."} • ${employeeRole(selectedEmployee)}` : "Selecciona empleado activo"}
      documentNumber={selectedEmployee?.documentNumber}
      role={selectedEmployee?.position}
      tabs={mode === "createContractForEmployee" ? [{ id: "contrato", label: "Contrato" }] : createContractTabs}
      activeTab={createContractTab}
      onTabChange={setCreateContractTab}
      onClose={closeWithDirtyCheck}
      footer={
        <PayrollSheetFooter
          error={error}
          primaryLabel="Crear contrato"
          submitting={submitting}
          primaryDisabled={Boolean(activeContract)}
          onCancel={closeWithDirtyCheck}
          onPrimary={createContract}
        />
      }
    >
      {createContractTab === "empleado" && (
        <div className="space-y-3">
          <FieldBlock label="Buscar empleado">
            <BigInput value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Nombre, documento o cargo" />
          </FieldBlock>
          <div className="space-y-2">
            {filteredEmployees.map((employee) => {
              const selected = employee.id === employeeId;
              return (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => {
                    setEmployeeId(employee.id);
                    setCreateContractTab("contrato");
                    setError(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[22px] bg-white p-3 text-left shadow-sm ring-1 ring-black/5 transition",
                    selected && "ring-2 ring-[#0fb18f]",
                  )}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-sm font-medium text-[#0f8f76]">
                    {initials(employee)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{employeeName(employee)}</p>
                    <p className="truncate text-xs text-slate-500">{employee.documentNumber ?? "Sin doc."} • {employee.position || "Sin cargo"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {createContractTab === "contrato" && (
        <div className="space-y-3">
          {mode !== "createContractForEmployee" && (
            <SearchSelect<EmployeeSearchOption>
              label="Buscar empleado existente"
              value={selectedEmployeeOption}
              placeholder="Buscar por nombre, apellido o documento"
              emptyText="No se encontraron empleados para esa busqueda."
              selectedLabel="Empleado seleccionado"
              search={searchEmployees}
              onSelect={(option) => {
                setEmployeeId(option.employee.id);
                setError(null);
              }}
              renderOption={(option) => (
                <>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-xs font-medium text-[#0f8f76]">
                    {initials(option.employee)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{option.title}</p>
                    <p className="truncate text-xs text-neutral-500">{option.subtitle} • {option.meta}</p>
                  </div>
                </>
              )}
            />
          )}
          {mode !== "createContractForEmployee" && (
            <div className="rounded-[20px] border border-neutral-100 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Contrato nuevo</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{selectedEmployee ? employeeName(selectedEmployee) : "Selecciona un empleado"}</p>
            </div>
          )}
          {activeContract && mode !== "createContractForEmployee" && (
            <div className="space-y-2 rounded-[20px] border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
              <p>Este empleado ya tiene un contrato activo. Para crear uno nuevo, primero debes inactivar el contrato actual.</p>
              <button
                type="button"
                onClick={inactivateCurrentContract}
                disabled={submitting}
                className="h-10 w-full rounded-xl bg-white text-xs font-medium text-amber-800 shadow-sm disabled:opacity-60"
              >
                Inactivar contrato actual
              </button>
            </div>
          )}
          <ContractFormSection value={contractDraft} arlRisks={arlRisks} onChange={setContractDraft} />
        </div>
      )}
    </PayrollEmployeeSheetShell>
  );
}

function EmployeePayrollEditorSheet({
  open,
  onClose,
  run,
  arlRisks,
  selectedPeriod,
  onChanged,
  onCreateContract,
  onInactivateContract,
  onInactivateEmployee,
  onHardDeleteEmployee,
}: {
  open: boolean;
  onClose: () => void;
  run: PayrollRun | null;
  arlRisks: ArlRiskClass[];
  selectedPeriod?: PayrollPeriod;
  onChanged: () => void;
  onCreateContract?: (employee: Employee) => void;
  onInactivateContract?: (contract: Contract) => void;
  onInactivateEmployee?: (employee: Employee) => void;
  onHardDeleteEmployee?: (employee: Employee) => void;
}) {
  const [activeTab, setActiveTab] = useState<"horas" | "contrato" | "empleado">("horas");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasPostedHistoryError, setHasPostedHistoryError] = useState(false);

  // Tab 1: Horas/Ajustes State
  const [workedDays, setWorkedDays] = useState("30");
  const [commissions, setCommissions] = useState("0");
  const [nonSalaryBonus, setNonSalaryBonus] = useState("0");
  const [loans, setLoans] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [simulatedEndDate, setSimulatedEndDate] = useState("");
  const [overtimeHours, setOvertimeHours] = useState<Record<OvertimeType, string>>(defaultOvertimeHours);

  // Tab 2: Contrato State
  const todayIso = new Date().toISOString().slice(0, 10);
  const [salaryMonthly, setSalaryMonthly] = useState("");
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState("");
  const [contractType, setContractType] = useState<"INDEFINITE" | "FIXED_TERM">("INDEFINITE");
  const [arlRiskClassId, setArlRiskClassId] = useState("");
  const [applyLaw1819, setApplyLaw1819] = useState(true);
  const [isRemote, setIsRemote] = useState(false);
  const [paymentCycle, setPaymentCycle] = useState<"MONTHLY" | "BIWEEKLY">("MONTHLY");

  // Tab 3: Empleado State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const contentRef = useRef<HTMLDivElement>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  useEffect(() => {
    if (!open || !run) return;
    setError(null);
    setActiveTab("horas");

    // Initialize Tab 1 (Novedades)
    setWorkedDays(String(run.usedParameters?.workedDays ?? "30"));
    setCommissions(String(run.commissions ?? "0"));
    setNonSalaryBonus(String(run.nonSalaryBonus ?? "0"));
    
    setLoans(String(runLoanDeductionValue(run)));
    setOtherDeductions(String(runOtherDeductionsValue(run)));
    
    setSimulatedEndDate(settlementDefaultEndDate(run.contract, selectedPeriod));
    const defaultOvertime = defaultOvertimeHours();
    if (run.usedParameters?.overtimeHours && Array.isArray(run.usedParameters.overtimeHours)) {
      run.usedParameters.overtimeHours.forEach((oh: any) => {
        if (oh.type in defaultOvertime) {
          defaultOvertime[oh.type as OvertimeType] = String(oh.quantity ?? "0");
        }
      });
    }
    setOvertimeHours(defaultOvertime);

    // Initialize Tab 2 (Contrato)
    if (run.contract) {
      setSalaryMonthly(String(run.contract.salaryMonthly ?? ""));
      setStartDate(run.contract.startDate?.slice(0, 10) ?? todayIso);
      setEndDate(run.contract.endDate?.slice(0, 10) ?? "");
      setContractType((run.contract.contractType as "INDEFINITE" | "FIXED_TERM") ?? "INDEFINITE");
      setArlRiskClassId(run.contract.arlRiskClassId ?? run.contract.arlRiskClass?.id ?? "");
      setApplyLaw1819(run.contract.applyLaw1819 ?? true);
      setIsRemote(run.contract.isRemote ?? false);
      setPaymentCycle((run.contract.paymentCycle as "MONTHLY" | "BIWEEKLY") ?? "MONTHLY");
    }

    // Initialize Tab 3 (Empleado)
    const currentFirstName = run.employee.firstName?.trim() ?? "";
    const currentLastName = run.employee.lastName?.trim() ?? "";
    let finalFirstName = currentFirstName;
    let finalLastName = currentLastName;
    if (currentFirstName || currentLastName) {
      setFirstName(currentFirstName);
      setLastName(currentLastName);
    } else {
      const parts = employeeName(run.employee).trim().split(/\s+/).filter(Boolean);
      finalFirstName = parts[0] ?? "";
      finalLastName = parts.slice(1).join(" ");
      setFirstName(finalFirstName);
      setLastName(finalLastName);
    }
    setDocumentNumber(run.employee.documentNumber ?? "");
    setPosition(run.employee.position ?? "");
    setEmail(run.employee.email ?? "");
    setPhone(run.employee.phone ?? "");
    setActive(run.employee.isActive === false ? "INACTIVE" : "ACTIVE");

    setInitialSnapshot(JSON.stringify({
      workedDays: String(run.usedParameters?.workedDays ?? "30"),
      commissions: String(run.commissions ?? "0"),
      nonSalaryBonus: String(run.nonSalaryBonus ?? "0"),
      loans: String(runLoanDeductionValue(run)),
      otherDeductions: String(runOtherDeductionsValue(run)),
      salaryMonthly: String(run.contract?.salaryMonthly ?? ""),
      startDate: run.contract?.startDate?.slice(0, 10) ?? todayIso,
      endDate: run.contract?.endDate?.slice(0, 10) ?? "",
      contractType: (run.contract?.contractType as "INDEFINITE" | "FIXED_TERM") ?? "INDEFINITE",
      arlRiskClassId: run.contract?.arlRiskClassId ?? run.contract?.arlRiskClass?.id ?? "",
      applyLaw1819: run.contract?.applyLaw1819 ?? true,
      isRemote: run.contract?.isRemote ?? false,
      paymentCycle: (run.contract?.paymentCycle as "MONTHLY" | "BIWEEKLY") ?? "MONTHLY",
      firstName: finalFirstName,
      lastName: finalLastName,
      documentNumber: run.employee.documentNumber ?? "",
      position: run.employee.position ?? "",
      email: run.employee.email ?? "",
      phone: run.employee.phone ?? "",
      active: run.employee.isActive === false ? "INACTIVE" : "ACTIVE"
    }));
  }, [open, run, selectedPeriod, todayIso]);

  const changeTab = (tab: "horas" | "contrato" | "empleado") => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
  };

  const buildPayload = useCallback((): CalculatePayrollPayload | null => {
    const parsedWorkedDays = numberValue(workedDays);
    if (!Number.isInteger(parsedWorkedDays) || parsedWorkedDays < 1 || parsedWorkedDays > 30) {
      return null;
    }
    const overtimePayload = overtimeInputs
      .map((item) => ({
        type: item.type,
        quantity: numberValue(overtimeHours[item.type]),
      }))
      .filter((item) => item.quantity > 0);

    return {
      workedDays: parsedWorkedDays,
      commissions: numberValue(commissions),
      nonSalaryBonus: numberValue(nonSalaryBonus),
      loanDeduction: numberValue(loans),
      otherDeductions: numberValue(otherDeductions),
      overtimeHours: overtimePayload.length ? overtimePayload : undefined,
    };
  }, [workedDays, commissions, nonSalaryBonus, loans, otherDeductions, overtimeHours]);

  if (!open || !run) return null;

  const editable = isPeriodEditable(selectedPeriod);

  const totalOvertimeHours = overtimeInputs.reduce(
    (sum, item) => sum + numberValue(overtimeHours[item.type]),
    0,
  );

  const saveNews = async () => {
    if (!selectedPeriod) return setError("Selecciona un periodo.");
    if (!editable) return setError("Este perodo ya fue liquidado. No se pueden modificar novedades.");
    const parsedWorkedDays = numberValue(workedDays);
    if (!Number.isInteger(parsedWorkedDays) || parsedWorkedDays < 1 || parsedWorkedDays > 30) {
      return setError("Los dias trabajados deben estar entre 1 y 30.");
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (!payload) return setError("Revisa los valores de novedades.");
      await payrollApi.calculateEmployee(selectedPeriod.id, run.employeeId, payload);
      toast.success("Novedades guardadas");
      onChanged();
      onClose();
    } catch (err) {
      const message = payrollErrorMessage(err, "No se pudieron guardar las novedades.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveContract = async () => {
    if (!run.contractId) return setError("No hay contrato asignado.");
    if (numberValue(salaryMonthly) <= 0) return setError("El salario mensual debe ser mayor a 0.");
    if (!startDate) return setError("La fecha de ingreso es obligatoria.");
    if (!arlRiskClassId) return setError("Selecciona ARL.");
    setSubmitting(true);
    try {
      const payload = {
        contractType,
        salaryMonthly: numberValue(salaryMonthly),
        startDate,
        endDate: endDate || undefined,
        isRemote,
        applyLaw1819,
        paymentCycle: "MONTHLY" as const,
        arlRiskClassId,
      };
      await payrollApi.updateContract(run.contractId, payload);
      toast.success("Contrato actualizado");
      onChanged();
      onClose();
    } catch (err) {
      const message = payrollErrorMessage(err, "No se pudo guardar el contrato.");
      if (err instanceof AppApiError && (err.message.includes("Contract has posted payroll history") || message.includes("nueva versi\u00f3n"))) {
        setHasPostedHistoryError(true);
      }
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveEmployee = async () => {
    if (!firstName.trim()) return setError("El nombre es obligatorio.");
    if (!lastName.trim()) return setError("El apellido es obligatorio.");
    if (!documentNumber.trim()) return setError("El documento es obligatorio.");
    setSubmitting(true);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        documentNumber: documentNumber.trim(),
        position: position.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      };
      await payrollApi.updateEmployee(run.employeeId, payload);
      toast.success("Empleado actualizado");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo guardar el empleado.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = () => {
    if (activeTab === "horas") {
      saveNews();
    } else if (activeTab === "contrato") {
      saveContract();
    } else if (activeTab === "empleado") {
      saveEmployee();
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex h-[88dvh] max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl transition-transform animate-in slide-in-from-bottom sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-[720px] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]">
        <div className="shrink-0 border-b border-neutral-100 bg-white px-5 pb-4 pt-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-medium text-slate-900">{employeeName(run.employee)}</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
              {run.employee.documentNumber ?? "Sin doc."} • {employeeRole(run.employee, run.contract)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (run.contract && run.contract.isActive !== false) {
                  toast.error("Este empleado tiene un contrato activo. Primero debes inactivar o liquidar el contrato.", { duration: 4000 });
                  return;
                }
                onClose();
                onInactivateEmployee?.(run.employee);
              }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Inactivar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const currentSnapshot = JSON.stringify({
                  workedDays, commissions, nonSalaryBonus, loans, otherDeductions,
                  salaryMonthly, startDate, endDate, contractType, arlRiskClassId, applyLaw1819, isRemote, paymentCycle,
                  firstName, lastName, documentNumber, position, email, phone, active
                });
                if (currentSnapshot !== initialSnapshot) {
                  toast((t) => (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium text-slate-900">Hay cambios sin guardar.</p>
                      <div className="flex gap-2">
                        <button onClick={() => toast.dismiss(t.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Seguir editando</button>
                        <button onClick={() => { toast.dismiss(t.id); onClose(); }} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Descartar</button>
                      </div>
                    </div>
                  ), { duration: Infinity });
                } else {
                  onClose();
                }
              }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => changeTab("horas")}
            className={cn("flex-1 rounded-lg py-2 text-xs font-medium transition-colors", activeTab === "horas" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Horas/Ajustes
          </button>
          <button
            type="button"
            onClick={() => changeTab("contrato")}
            className={cn("flex-1 rounded-lg py-2 text-xs font-medium transition-colors", activeTab === "contrato" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Contrato
          </button>
          <button
            type="button"
            onClick={() => changeTab("empleado")}
            className={cn("flex-1 rounded-lg py-2 text-xs font-medium transition-colors", activeTab === "empleado" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Empleado
          </button>
        </div>
        </div>

        {/* Form Body */}
        <div ref={contentRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50/30 px-5 py-4 pb-28 overscroll-contain">
          {activeTab === "horas" && (
            <div className="space-y-3">
              {!editable && (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Este perodo ya fue liquidado. No se pueden modificar novedades.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <FieldBlock label="Dias trabajados">
                  <BigInput value={workedDays} onChange={(event) => setWorkedDays(event.target.value)} type="number" min="1" max="30" disabled={!editable} />
                </FieldBlock>
                <FieldBlock label="Prestamos">
                  <BigInput value={loans} onChange={(event) => setLoans(event.target.value)} type="number" min="0" disabled={!editable} />
                </FieldBlock>
                <FieldBlock label="Comisiones salariales">
                  <BigInput value={commissions} onChange={(event) => setCommissions(event.target.value)} type="number" min="0" disabled={!editable} />
                </FieldBlock>
                <FieldBlock label="Bonos no salariales">
                  <BigInput value={nonSalaryBonus} onChange={(event) => setNonSalaryBonus(event.target.value)} type="number" min="0" disabled={!editable} />
                </FieldBlock>
                <FieldBlock label="Otras deducciones">
                  <BigInput value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)} type="number" min="0" disabled={!editable} />
                </FieldBlock>
                <FieldBlock label="Fecha salida simulada">
                  <BigInput value={simulatedEndDate} onChange={(event) => setSimulatedEndDate(event.target.value)} type="date" />
                </FieldBlock>
              </div>

              {/* Extras hours */}
              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Trabajo suplementario</span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-medium text-neutral-500">{totalOvertimeHours} h</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {overtimeInputs.map((item) => (
                    <label key={item.type} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-2">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] font-medium text-neutral-700">{item.label}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#0fb18f]">{item.hint}</span>
                      </span>
                      <input
                        value={overtimeHours[item.type]}
                        onChange={(event) =>
                          setOvertimeHours((current) => ({
                            ...current,
                            [item.type]: event.target.value,
                          }))
                        }
                        type="number"
                        min="0"
                        disabled={!editable}
                        className="mt-2 h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-right text-sm font-semibold outline-none focus:border-emerald-400"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "contrato" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(run.contract && run.contract.isActive !== false)}
                  onClick={() => { onClose(); onCreateContract?.(run.employee); }}
                  className="flex-1 rounded-xl border border-neutral-200 bg-white py-2.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Nuevo contrato
                </button>
                <button
                  type="button"
                  disabled={!run.contract || run.contract.isActive === false}
                  onClick={() => { onClose(); if (run.contract) onInactivateContract?.(run.contract); }}
                  className="flex-1 rounded-xl border border-amber-200 bg-amber-50/80 py-2.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  Inactivar contrato
                </button>
              </div>
              {Boolean(run.contract && run.contract.isActive !== false) && (
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  Contrato activo vigente. Para crear uno nuevo, primero debes inactivar o liquidar el contrato actual.
                </p>
              )}

              {hasPostedHistoryError && (
                <div className="space-y-2 rounded-[20px] border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  Este contrato tiene nómina liquidada. Los cambios críticos requieren una nueva versión de contrato.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FieldBlock label="Fecha ingreso">
                  <BigInput value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" disabled={hasPostedHistoryError} />
                </FieldBlock>
                <FieldBlock label="Fecha salida">
                  <BigInput value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" disabled={hasPostedHistoryError} />
                </FieldBlock>
              </div>

              <FieldBlock label="Salario mensual">
                <BigInput 
                  value={salaryMonthly ? Number(String(salaryMonthly).replace(/\D/g, "")).toLocaleString("es-CO") : ""} 
                  onChange={(event) => {
                    const val = event.target.value.replace(/\D/g, "");
                    setSalaryMonthly(val);
                  }} 
                  placeholder="3.000.000" 
                  type="text" 
                  inputMode="numeric"
                  disabled={hasPostedHistoryError}
                />
              </FieldBlock>

              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <span className="mb-2 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">ARL</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((level) => {
                    const risk = arlRisks.find((item) => item.level === level);
                    const selected = arlRiskClassId === risk?.id;
                    return (
                      <button
                        key={level}
                        type="button"
                        disabled={!risk || hasPostedHistoryError}
                        onClick={() => risk && setArlRiskClassId(risk.id)}
                        className={cn(
                          "h-10 rounded-xl text-[11px] font-medium transition disabled:opacity-40",
                          selected ? "bg-blue-500 text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700",
                        )}
                      >
                        Riesgo {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <span className="mb-2 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">Configuracion adicional</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={hasPostedHistoryError} onClick={() => setIsRemote((value) => !value)} className={cn("h-11 rounded-xl text-xs font-medium disabled:opacity-50", isRemote ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
                    Trabajo remoto
                  </button>
                  <button type="button" disabled={hasPostedHistoryError} onClick={() => setApplyLaw1819((value) => !value)} className={cn("h-11 rounded-xl text-xs font-medium disabled:opacity-50", applyLaw1819 ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
                    Exonerado Ley 1819
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <span className="mb-2 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">Ciclo de pago</span>
                <div className="grid grid-cols-1 gap-2">
                  <SegmentedOption value="MONTHLY" current={paymentCycle} onChange={setPaymentCycle}>Mensual</SegmentedOption>
                </div>
              </div>
            </div>
          )}

          {activeTab === "empleado" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FieldBlock label="Nombre">
                  <BigInput value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Juan" />
                </FieldBlock>
                <FieldBlock label="Apellido">
                  <BigInput value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Perez" />
                </FieldBlock>
                <FieldBlock label="Documento">
                  <BigInput value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="123456789" />
                </FieldBlock>
                <FieldBlock label="Cargo">
                  <BigInput value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Auxiliar" />
                </FieldBlock>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldBlock label="Telefono">
                  <BigInput value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="3001234567" />
                </FieldBlock>
                <FieldBlock label="Correo opcional">
                  <BigInput value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@empresa.com" type="email" />
                </FieldBlock>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)]">
          {error && <p className="mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting || (activeTab === "horas" && !editable)}
              className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white shadow-lg shadow-emerald-100 hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function PayrollSummaryPanel({
  run,
  expanded,
  onToggleExpanded,
  onTogglePayment,
  selectedPeriod,
  visualPaid,
  onToggleVisualPaid,
  onOpenEditor,
}: {
  run: PayrollRun;
  expanded: boolean;
  onToggleExpanded: () => void;
  onTogglePayment: (run: PayrollRun) => void;
  selectedPeriod?: PayrollPeriod;
  visualPaid?: boolean;
  onToggleVisualPaid?: (run: PayrollRun, paid: boolean) => void;
  onOpenEditor?: (run: PayrollRun) => void;
}) {
  const extras = [
    { label: "Horas extras", value: run.overtimeAmount },
    { label: "Comisiones", value: run.commissions },
    { label: "Bonificaciones", value: run.nonSalaryBonus },
  ].filter((item) => toNumber(item.value) > 0);
  const viewModel = payrollRunViewModel(run);

  const longPress = useLongPress({
    onLongPress: () => onOpenEditor?.(run),
    delay: 600,
  });

  const isBiweekly = run.contract?.paymentCycle === "BIWEEKLY";
  const canCalculateNews = run.contract?.isActive !== false && !run.contract?.endDate;
  const primarySalaryPayment = viewModel.salaryPayments[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleExpanded}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleExpanded();
        }
      }}
      className="min-w-full snap-start text-left"
      aria-expanded={expanded}
    >
      <article 
        {...longPress.handlers}
        onClick={(e) => {
          if (longPress.isLongPressTriggered()) {
            e.stopPropagation();
            return;
          }
        }}
        className="overflow-hidden rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:shadow-md cursor-pointer select-none"
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-sm font-medium text-[#0f8f76]">
            {initials(run.employee)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-slate-900">{employeeName(run.employee)}</p>
            <p className="mt-0.5 text-[12px] font-medium uppercase text-slate-500">{employeeRole(run.employee, run.contract)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{run.employee.documentNumber ?? "Sin documento"}</p>
          </div>
          <div className="text-right">
            <p className="text-[16px] font-medium tabular-nums text-[#0fb18f]">{money(run.netPay)}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Transferencia neta</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">Devengado mensual</p>
          <MoneyLine label="Sueldo básico" value={run.salaryEarned} color="text-slate-800" valueColor="text-slate-900" medium />
          
          {extras.length > 0 && (
            <div className="my-2 ml-4 space-y-1.5 rounded-2xl bg-[#c3975c]/10 px-3 py-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[#ba965e]">Desglose de extras</p>
              {extras.map((item) => (
                <MoneyLine
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  color="text-[#ba965e]"
                  valueColor="text-[#ba965e]"
                />
              ))}
            </div>
          )}
          
          <MoneyLine
            label={viewModel.allowanceLabel}
            value={viewModel.allowanceValue}
            color="text-[#43856f]"
            valueColor="text-[#43856f]"
            sign="+"
          />
          <MoneyLine
            label="Deducción salud"
            value={viewModel.employeeHealth}
            color="text-[#e5a5ba]"
            valueColor="text-[#d985a1]"
            sign="-"
          />
          <MoneyLine
            label="Deducción pensión"
            value={viewModel.employeePension}
            color="text-[#e5a5ba]"
            valueColor="text-[#d985a1]"
            sign="-"
          />

        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Costo real empresa</p>
            <p className="text-[15px] font-medium tabular-nums text-slate-800">{money(run.realEmployerCost)}</p>
          </div>
          <div className="flex items-center gap-2">
            {primarySalaryPayment && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePayment(run);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors",
                  viewModel.allPaid 
                    ? "bg-emerald-50 text-emerald-700" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer"
                )}
              >
                {viewModel.paymentStatusLabel}
              </button>
            )}
            {!primarySalaryPayment && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Pendiente pago
              </span>
            )}
            <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
          </div>
        </div>

        <div className={cn("grid transition-all duration-300", expanded ? "grid-rows-[1fr] pt-4 opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="min-h-0 overflow-hidden space-y-3">
            <SectionBreakdown
              title="Seguridad Social"
              color="#5b8def"
              totalLabel="Total Seguridad Social"
              rows={[
                { label: "Salud empleador", value: run.employerHealth },
                { label: "Pension empleador", value: run.employerPension },
                { label: "ARL", value: run.employerArl },
              ]}
            />
            <SectionBreakdown
              title="Parafiscales"
              color="#5b8def"
              totalLabel="Total Parafiscales"
              rows={[
                { label: "CCF", value: run.compensationFund },
                { label: "SENA", value: run.sena },
                { label: "ICBF", value: run.icbf },
              ]}
            />
            <SectionBreakdown
              title="Prestaciones Sociales"
              color="#8b5cf6"
              totalLabel="Total Prestaciones Sociales"
              rows={[
                { label: "Cesantias", value: run.severance },
                { label: "Intereses cesantias", value: run.severanceInterest },
                { label: "Prima", value: run.serviceBonus },
                { label: "Vacaciones", value: run.vacation },
              ]}
            />
          </div>
        </div>
      </article>
    </div>
  );
}

function formatSettlementDate(value?: string | Date | null): string {
  if (!value) return "-";
  const dateStr = typeof value === "string" ? value : value.toISOString();
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "-";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function SettlementPanelLegacy({ settlement }: { settlement?: Settlement }) {
  if (!settlement) {
    return (
      <article className="flex min-w-full snap-start flex-col justify-center rounded-[24px] border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
        <ReceiptText className="mx-auto h-7 w-7 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">Liquidación año vigente</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          No hay liquidación calculada.
        </p>
      </article>
    );
  }

  const params = (settlement.usedParameters ?? {}) as any;
  const cutoffStartDate = settlement.cutoffStartDate ?? params.cutoffStartDate ?? settlement.startDate;
  const settlementDate = settlement.settlementDate ?? settlement.calculationEndDate ?? settlement.endDate;
  const startDateStr = formatSettlementDate(cutoffStartDate);
  const endDateStr = formatSettlementDate(settlementDate);
  const causedDays = settlement.causedDays ?? toNumber(params.causedDays ?? settlement.totalWorkedDays);
  const serviceBonus = settlement.serviceBonus ?? settlement.serviceBonusTotal ?? 0;

  const calculatedTotal =
    toNumber(settlement.severance) +
    toNumber(settlement.severanceInterest) +
    toNumber(serviceBonus) +
    toNumber(settlement.vacation);

  const totalWorkedDays = toNumber(causedDays);
  const rawVacDays = settlement.vacationDays !== undefined && settlement.vacationDays !== null
    ? toNumber(settlement.vacationDays)
    : (totalWorkedDays * 15 / 360);
  const formattedVacationDays = formatSettlementVacationDays(rawVacDays);

  const hourlyRateVal = toNumber(settlement.hourlyRate ?? params.hourlyRate);

  const formattedHourlyRate = hourlyRateVal > 0 
    ? hourlyRateVal.toFixed(1).split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (hourlyRateVal.toFixed(1).split(".")[1] || "0")
    : "0,0";

  return (
    <article className="min-w-full snap-start rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <h3 className="text-sm font-medium text-slate-900 mb-4">Liquidación año vigente</h3>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Fecha corte inicial</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{startDateStr}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Fecha liquidación</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{endDateStr}</p>
        </div>
      </div>

      <div className="border-b border-slate-100 pb-3 mb-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Días causados</p>
        <p className="text-sm font-semibold text-slate-700 mt-0.5">{causedDays}</p>
      </div>

      {/* Prestaciones */}
      <div className="space-y-2 pb-3 mb-3 border-b border-slate-100">
        <MoneyLine label="Cesantías causadas" value={settlement.severance} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Intereses cesantías causados" value={settlement.severanceInterest} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Prima de servicios" value={serviceBonus} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Vacaciones" value={settlement.vacation} color="text-slate-600" valueColor="text-slate-800" />
      </div>

      {/* Total */}
      <div className="flex justify-between items-center mb-4 pt-1">
        <span className="text-[13px] font-medium text-slate-800">Total</span>
        <span className="text-base font-medium text-violet-700">{money(calculatedTotal)}</span>
      </div>

      <p className="mb-3 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        Consulta el icono de informacion para ver el alcance de la estimacion.
      </p>

      <div className="space-y-1.5 pt-2 border-t border-slate-50">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Días de vacaciones</span>
          <span className="font-semibold text-slate-600">{formattedVacationDays}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Valor hora</span>
          <span className="font-semibold text-slate-600">{formattedHourlyRate}</span>
        </div>
      </div>
    </article>
  );
}

function SettlementPanel({
  settlement,
  onLiquidate,
  liquidated,
  posting,
}: {
  settlement?: Settlement;
  onLiquidate?: () => void;
  liquidated?: boolean;
  posting?: boolean;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [payModal, setPayModal] = useState<{ semester: 1 | 2; amount: number } | null>(null);
  const [regularizationModal, setRegularizationModal] = useState<{
    contractId: string;
    benefitType: "PRIMA";
    amount: number;
    year: number;
    semester: 1 | 2;
    missingProvision: number;
    calculatedAmount: number;
    provisionedAmount: number;
    paymentMethod?: "CASH" | "BANK_TRANSFER" | "OTHER";
    requiredAmount?: number;
    missingAmount?: number;
  } | null>(null);
  const [submittingPrima, setSubmittingPrima] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "OTHER">("BANK_TRANSFER");
  const [benefitPayments, setBenefitPayments] = useState<PayrollBenefitPayment[]>([]);
  const paymentCalculationYear = settlement
    ? settlement.calculationYear ?? new Date(settlement.effectiveEndDate ?? settlement.settlementDate ?? settlement.calculationEndDate ?? settlement.endDate).getFullYear()
    : new Date().getFullYear();

  useEffect(() => {
    if (settlement?.contractId) {
      payrollApi.listBenefitPayments(settlement.contractId)
        .then(setBenefitPayments)
        .catch(console.error);
    }
  }, [settlement?.contractId]);

  const closePaymentModal = () => {
    setPayModal(null);
    setRegularizationModal(null);
  };

  const submitPrimaPayment = async () => {
    if (!settlement?.contractId || !payModal || submittingPrima) return;
    setSubmittingPrima(true);
    try {
      await payrollApi.createBenefitPayment(settlement.contractId, {
        type: "PRIMA",
        amount: payModal.amount,
        year: paymentCalculationYear,
        semester: payModal.semester,
        paymentMethod,
        status: "PAID",
      });
      toast.success("Prima registrada como pagada.");
      closePaymentModal();
      payrollApi.listBenefitPayments(settlement.contractId).then(setBenefitPayments).catch(console.error);
    } catch (err: any) {
      if (process.env.NODE_ENV === "development") {
        console.log("[payroll][prima-payment-catch]", {
          err,
          code: err?.code,
          detailsCode: err?.details?.code,
          raw: err?.raw,
          details: err?.details,
        });
      }

      const isAlreadyPaidConflict =
        err instanceof AppApiError &&
        err.status === 409 &&
        (err.message?.toLowerCase().includes("ya fue pagada") ||
          err.message?.toLowerCase().includes("already paid") ||
          err.message?.toLowerCase().includes("exist"));

      if (isAlreadyPaidConflict) {
        toast.success("Prima registrada como pagada.");
        closePaymentModal();
        payrollApi.listBenefitPayments(settlement.contractId).then(setBenefitPayments).catch(console.error);
        return;
      }

      let rawParsed: any = {};
      try {
        if (typeof err?.raw === "string") rawParsed = JSON.parse(err.raw);
        else if (typeof err?.details?.raw === "string") rawParsed = JSON.parse(err.details.raw);
      } catch (_) {}

      const code = err?.details?.code || err?.code || rawParsed?.code || "";

      if (
        code === "INSUFFICIENT_PROVISION_REQUIRES_REGULARIZATION" ||
        code === "INSUFFICIENT_PROVISION_REQUIRED"
      ) {
        setPayModal(null);
        setRegularizationModal({
          contractId: settlement.contractId,
          benefitType: "PRIMA",
          amount: payModal.amount,
          year: Number(err.details?.year ?? rawParsed?.year ?? paymentCalculationYear),
          semester: ((err.details?.semester ?? rawParsed?.semester ?? payModal.semester) === 2 ? 2 : 1) as 1 | 2,
          paymentMethod,
          requiredAmount: Number(err.details?.requiredAmount ?? rawParsed?.requiredAmount ?? payModal.amount),
          provisionedAmount: Number(err.details?.provisionedAmount ?? rawParsed?.provisionedAmount ?? 0),
          missingAmount: Number(err.details?.missingAmount ?? rawParsed?.missingAmount ?? payModal.amount),
          calculatedAmount: Number(err.details?.requiredAmount ?? rawParsed?.requiredAmount ?? payModal.amount),
          missingProvision: Number(err.details?.missingAmount ?? rawParsed?.missingAmount ?? payModal.amount),
        });
        return;
      }
      toast.error(err.message || "Error al registrar el pago.");
    } finally {
      setSubmittingPrima(false);
    }
  };

  const submitRegularizedPrimaPayment = async () => {
    if (!settlement?.contractId || !regularizationModal || submittingPrima) return;
    setSubmittingPrima(true);
    const payload = {
      type: "PRIMA",
      amount: regularizationModal.amount,
      year: regularizationModal.year,
      semester: regularizationModal.semester,
      paymentMethod: regularizationModal.paymentMethod ?? "BANK_TRANSFER",
      regularizeMissingProvision: true,
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[payroll][regularized-prima-payment] payload", payload);
    }
    try {
      await payrollApi.createBenefitPayment(settlement.contractId, payload);
      toast.success("Saldo regularizado y prima registrada como pagada.");
      closePaymentModal();
      payrollApi.listBenefitPayments(settlement.contractId).then(setBenefitPayments).catch(console.error);
    } catch (err: any) {
      const isAlreadyPaidConflict =
        err instanceof AppApiError &&
        err.status === 409 &&
        (err.message?.toLowerCase().includes("ya fue pagada") ||
          err.message?.toLowerCase().includes("already paid") ||
          err.message?.toLowerCase().includes("exist"));

      if (isAlreadyPaidConflict) {
        toast.success("Saldo regularizado y prima registrada como pagada.");
        closePaymentModal();
        payrollApi.listBenefitPayments(settlement.contractId).then(setBenefitPayments).catch(console.error);
        return;
      }
      toast.error(err.message || "Error al registrar el pago.");
    } finally {
      setSubmittingPrima(false);
    }
  };

  if (!settlement) {
    return (
      <article className="flex min-w-full snap-start flex-col justify-center rounded-[24px] border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
        <ReceiptText className="mx-auto h-7 w-7 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">Liquidacion año vigente</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          No hay liquidacion calculada.
        </p>
      </article>
    );
  }

  const params = (settlement.usedParameters ?? {}) as any;
  const startDateStr = formatSettlementDate(params.originalContractStartDate ?? settlement.startDate);
  const requestedEndDate = settlement.requestedEndDate ?? params.requestedEndDate ?? settlement.endDate;
  const effectiveEndDate = settlement.effectiveEndDate ?? params.effectiveEndDate ?? settlement.settlementDate ?? settlement.calculationEndDate ?? settlement.endDate;
  const requestedEndDateStr = formatSettlementDate(requestedEndDate);
  const effectiveEndDateStr = formatSettlementDate(effectiveEndDate);
  const hasMvpCutoff = requestedEndDateStr !== effectiveEndDateStr;
  const causedDays = settlement.causedDays ?? toNumber(params.causedDays ?? settlement.totalWorkedDays);
  const semester1Days = settlement.semester1Days ?? settlement.semesterOneDays ?? toNumber(params.semester1Days ?? params.daysWorkedSemester1);
  const semester2Days = settlement.semester2Days ?? settlement.semesterTwoDays ?? toNumber(params.semester2Days ?? params.daysWorkedSemester2);
  const serviceBonusSemester1 = settlement.serviceBonusSemester1 ?? settlement.serviceBonusSemesterOne ?? 0;
  const serviceBonusSemester2 = settlement.serviceBonusSemester2 ?? settlement.serviceBonusSemesterTwo ?? 0;

  const backendTotal = settlement.totalAmount ?? settlement.settlementTotalPayable ?? 0;

  const rawVacDays = settlement.vacationDays !== undefined && settlement.vacationDays !== null
    ? toNumber(settlement.vacationDays)
    : (toNumber(causedDays) / 24);
  const formattedVacationDays = formatSettlementVacationDays(rawVacDays);

  const hourlyRateVal = toNumber(settlement.hourlyRate ?? params.hourlyRate);
  const formattedHourlyRate = hourlyRateVal > 0
    ? hourlyRateVal.toFixed(1).split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (hourlyRateVal.toFixed(1).split(".")[1] || "0")
    : "0,0";

  const calculationYear = settlement.calculationYear ?? new Date(effectiveEndDate).getFullYear();
  const prima1Paid = benefitPayments.find((p) => p.type === "PRIMA" && p.year === calculationYear && p.semester === 1);
  const prima2Paid = benefitPayments.find((p) => p.type === "PRIMA" && p.year === calculationYear && p.semester === 2);

  return (
    <article className="min-w-full snap-start rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <div className="relative mb-4 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-slate-900">Liquidacion año vigente</h3>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowInfo((current) => !current);
          }}
          className="grid h-5 w-5 place-items-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
          aria-label="Informacion de liquidacion"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        {showInfo && (
          <div className="absolute left-0 top-7 z-10 max-w-[260px] rounded-2xl border border-slate-100 bg-white p-3 text-[11px] leading-relaxed text-slate-600 shadow-xl">
            Esta estimacion contempla unicamente prestaciones causadas desde el ultimo corte anual. No incluye historicos de años anteriores. El calculo usa año laboral de 360 dias: meses de 30 dias.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Fecha de ingreso</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{startDateStr}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {hasMvpCutoff ? "Fecha salida solicitada" : "Fecha de salida"}
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{requestedEndDateStr}</p>
        </div>
      </div>

      {hasMvpCutoff && (
        <div className="border-b border-slate-100 pb-3 mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Corte calculado hasta</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{effectiveEndDateStr}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Dias laborados semestre I</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{semester1Days}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Dias laborados semestre II</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{semester2Days}</p>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          setExpanded((prev) => !prev);
        }}
        className="cursor-pointer select-none"
      >
        <div className="flex justify-between items-center mb-4 pt-1">
          <span className="text-[13px] font-medium text-slate-800">Total</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-violet-700">{money(backendTotal)}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform text-slate-400", expanded && "rotate-180")} />
          </div>
        </div>

        <div className={cn("grid transition-all duration-300", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="min-h-0 overflow-hidden space-y-2 pb-3 mb-3 border-b border-slate-100">
            <MoneyLine label="Cesantias" value={settlement.severance} color="text-slate-600" valueColor="text-slate-800" />
            <MoneyLine label="Intereses cesantias" value={settlement.severanceInterest} color="text-slate-600" valueColor="text-slate-800" />
            
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-normal text-slate-600">Prima de servicios I</span>
                {toNumber(serviceBonusSemester1) > 0 && !prima1Paid && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPayModal({ semester: 1, amount: toNumber(serviceBonusSemester1) }) }}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Pagar
                  </button>
                )}
                {prima1Paid && (
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold text-green-600">
                    Pagada
                  </span>
                )}
              </div>
              <span className="tabular-nums font-normal text-slate-800">{money(serviceBonusSemester1)}</span>
            </div>

            <div className="flex items-center justify-between gap-3 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-normal text-slate-600">Prima de servicios II</span>
                {toNumber(serviceBonusSemester2) > 0 && !prima2Paid && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPayModal({ semester: 2, amount: toNumber(serviceBonusSemester2) }) }}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Pagar
                  </button>
                )}
                {prima2Paid && (
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold text-green-600">
                    Pagada
                  </span>
                )}
              </div>
              <span className="tabular-nums font-normal text-slate-800">{money(serviceBonusSemester2)}</span>
            </div>
            <MoneyLine label="Vacaciones" value={settlement.vacation} color="text-slate-600" valueColor="text-slate-800" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-slate-50">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Dias de vacaciones</span>
          <span className="font-semibold text-slate-600">{formattedVacationDays}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Valor hora</span>
          <span className="font-semibold text-slate-600">{formattedHourlyRate}</span>
        </div>
      </div>

      <SheetShell
        open={!!payModal}
        onClose={closePaymentModal}
        title={`Pagar Prima de Servicios ${payModal?.semester === 1 ? "I" : "II"}`}
        subtitle={`Periodo ${calculationYear}-${payModal?.semester}`}
        footer={
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={closePaymentModal}
              className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              disabled={submittingPrima}
            >
              Cancelar
            </button>
            <button
              onClick={() => submitPrimaPayment()}
              disabled={submittingPrima}
              className="flex-1 rounded-xl bg-[#0fb18f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0da081] disabled:opacity-50"
            >
              {submittingPrima ? "Registrando..." : "Confirmar pago"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pt-4">
          <p className="text-sm text-slate-600">
            ¿Confirmas el pago de la prima de servicios por valor de{" "}
            <strong className="text-slate-900">{money(payModal?.amount)}</strong>?
          </p>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-slate-500">Método de pago</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm focus:outline-none"
            >
              <option value="BANK_TRANSFER">Transferencia bancaria</option>
              <option value="CASH">Efectivo</option>
            </select>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                Esta acción creará los movimientos contables correspondientes, debitando la provisión y acreditando la cuenta de pago. No se podrá deshacer automáticamente.
              </p>
            </div>
          </div>
        </div>
      </SheetShell>

      <SheetShell
        open={!!regularizationModal}
        onClose={() => setRegularizationModal(null)}
        title="Regularizar saldo de prima"
        subtitle={`Periodo ${regularizationModal?.year ?? paymentCalculationYear}-${regularizationModal?.semester}`}
        footer={
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => setRegularizationModal(null)}
              className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              disabled={submittingPrima}
            >
              Cancelar
            </button>
            <button
              onClick={() => submitRegularizedPrimaPayment()}
              disabled={submittingPrima}
              className="flex-1 rounded-xl bg-[#0fb18f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0da081] disabled:opacity-50"
            >
              {submittingPrima ? "Registrando..." : "Regularizar y pagar"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pt-4">
          <p className="text-sm leading-relaxed text-slate-600">
            La provisión acumulada en el sistema es menor al valor legal calculado. Esto puede ocurrir cuando comienzas a usar la app a mitad de año.
          </p>
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4">
            <MoneyLine label="Prima calculada" value={regularizationModal?.calculatedAmount} color="text-slate-600" valueColor="text-slate-900" />
            <MoneyLine label="Provisionado" value={regularizationModal?.provisionedAmount} color="text-slate-600" valueColor="text-slate-900" />
            <MoneyLine label="Faltante a regularizar" value={regularizationModal?.missingProvision} color="text-slate-600" valueColor="text-amber-700" />
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                Al confirmar, se registrará un asiento de regularización y luego el pago de la prima.
              </p>
            </div>
          </div>
        </div>
      </SheetShell>
    </article>
  );
}

function EmployeeCarousel({
  run,
  settlement,
  expanded,
  onToggleExpanded,
  onTogglePayment,
  selected,
  onSelect,
  selectedPeriod,
  visualPaid,
  onToggleVisualPaid,
  onLiquidateContract,
  contractLiquidated,
  settlementPosting,
  onOpenEditor,
}: {
  run: PayrollRun;
  settlement?: Settlement;
  expanded: boolean;
  onToggleExpanded: () => void;
  onTogglePayment: (run: PayrollRun) => void;
  selected?: boolean;
  onSelect?: () => void;
  selectedPeriod?: PayrollPeriod;
  visualPaid?: boolean;
  onToggleVisualPaid?: (run: PayrollRun, paid: boolean) => void;
  onLiquidateContract?: (run: PayrollRun, settlement: Settlement) => void;
  contractLiquidated?: boolean;
  settlementPosting?: boolean;
  onOpenEditor?: (run: PayrollRun) => void;
}) {
  return (
    <div
      onMouseDown={onSelect}
      className="overflow-hidden rounded-[24px]"
    >
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <PayrollSummaryPanel
          run={run}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          onTogglePayment={onTogglePayment}
          selectedPeriod={selectedPeriod}
          visualPaid={visualPaid}
          onToggleVisualPaid={onToggleVisualPaid}
          onOpenEditor={onOpenEditor}
        />
        <SettlementPanel
          settlement={settlement}
          onLiquidate={settlement ? () => onLiquidateContract?.(run, settlement) : undefined}
          liquidated={contractLiquidated}
          posting={settlementPosting}
        />
      </div>
    </div>
  );
}

function EmployeeStandaloneCard({
  employee,
  contract,
  selectedPeriod,
  complementaryAvailable,
  onComplementaryRun,
}: {
  employee: Employee;
  contract?: Contract | null;
  selectedPeriod?: PayrollPeriod;
  complementaryAvailable?: boolean;
  onComplementaryRun?: (employee: Employee) => void;
}) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-sm font-medium text-[#0f8f76]">
          {initials(employee)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-slate-900">{employeeName(employee)}</p>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">{employeeRole(employee, contract)}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{employee.documentNumber ?? "Sin documento"}</p>
        </div>
        <div className="text-right">
          {contract ? (
            <>
              <p className="text-[15px] font-medium tabular-nums text-[#0fb18f]">{money(contract?.salaryMonthly)}</p>
              <p className="text-[11px] text-slate-400">{selectedPeriod ? `${monthNames[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "Periodo"}</p>
            </>
          ) : (
            <p className="max-w-[90px] text-[11px] font-medium leading-snug text-amber-600">Crear contrato para calcular nomina</p>
          )}
        </div>
      </div>

      <p className={cn(
        "mb-3 rounded-2xl px-3 py-2 text-[11px] font-medium",
        complementaryAvailable ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500",
      )}>
        {complementaryAvailable
          ? "Empleado sin n\u00f3mina en este per\u00edodo liquidado."
          : "Sin nomina calculada en este periodo"}
      </p>

      {complementaryAvailable && (
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onComplementaryRun?.(employee)}
            className="rounded-xl bg-violet-50 px-4 py-2 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
          >
            Pagar complementaria
          </button>
        </div>
      )}
    </article>
  );
}

function DetailPanel({
  run,
  settlement,
  onLiquidateContract,
  contractLiquidated,
  settlementPosting,
}: {
  run?: PayrollRun;
  settlement?: Settlement;
  onTogglePayment: (run: PayrollRun) => void;
  selectedPeriod?: PayrollPeriod;
  onLiquidateContract?: (run: PayrollRun, settlement: Settlement) => void;
  contractLiquidated?: boolean;
  settlementPosting?: boolean;
}) {
  if (!run) {
    return (
      <aside className="hidden min-h-0 border-l border-black/5 bg-white p-6 lg:flex lg:flex-col lg:items-center lg:justify-center">
        <FileText className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">Selecciona un empleado</p>
      </aside>
    );
  }

  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l border-black/5 bg-white p-5 pb-36 lg:block">
      <SettlementPanel
        settlement={settlement}
        onLiquidate={run && settlement ? () => onLiquidateContract?.(run, settlement) : undefined}
        liquidated={contractLiquidated}
        posting={settlementPosting}
      />
    </aside>
  );
}

function EmployeeManagementSheet({
  open,
  onClose,
  employees,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Employee | null>(null);
  const [fullName, setFullName] = useState("");

  const [documentNumber, setDocumentNumber] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resetForm = () => {
    setEditing(null);
    setFullName("");

    setDocumentNumber("");
    setPosition("");
    setEmail("");
    setPhone("");
    setError(null);
  };

  const startEdit = (employee: Employee) => {
    setEditing(employee);
    setFullName(`${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim());

    setDocumentNumber(employee.documentNumber ?? "");
    setPosition(employee.position ?? "");
    setEmail(employee.email ?? "");
    setPhone(employee.phone ?? "");
    setError(null);
  };

  const save = async () => {
    if (!fullName.trim()) return setError("El nombre completo es obligatorio.");

    if (!documentNumber.trim()) return setError("El documento es obligatorio.");
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        firstName: fullName.trim().split(" ")[0] ?? "",
        lastName: fullName.trim().split(" ").slice(1).join(" "),
        documentNumber: documentNumber.trim(),
        position: position.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      };
      if (editing) {
        await payrollApi.updateEmployee(editing.id, payload);
        toast.success("Empleado actualizado");
      } else {
        await payrollApi.createEmployee(payload);
        toast.success("Empleado creado");
      }
      resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo guardar el empleado.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (employee: Employee) => {
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.deleteEmployee(employee.id);
      toast.success("Empleado inactivado");
      if (editing?.id === employee.id) resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo inactivar el empleado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#0fb18f]">Empleados</p>
            <h2 className="mt-1 text-lg font-medium text-slate-900">Gestionar personas</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-[24px] bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">{editing ? "Editar empleado" : "Nuevo empleado"}</p>
          <div className="space-y-2">
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nombre completo" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />

            <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Documento" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Cargo" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email opcional" type="email" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefono opcional" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
          </div>
          {error && <p className="mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={resetForm} className="h-11 rounded-2xl bg-white text-sm font-medium text-slate-600">Limpiar</button>
            <button type="button" onClick={save} disabled={submitting} className="h-11 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white disabled:opacity-60">{editing ? "Guardar" : "Crear"}</button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {employees.map((employee) => (
            <article key={employee.id} className="flex items-center gap-3 rounded-[22px] bg-white p-3 shadow-sm ring-1 ring-black/5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-sm font-medium text-[#0f8f76]">{initials(employee)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{employeeName(employee)}</p>
                <p className="truncate text-xs text-slate-500">{employee.position || "Sin cargo"} · {employee.documentNumber}</p>
              </div>
              <button type="button" onClick={() => startEdit(employee)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-50 text-slate-500" aria-label="Editar empleado"><Edit3 className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(employee)} className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-500" aria-label="Inactivar empleado"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmployeeFormSheet({
  open,
  onClose,
  employee,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  employee?: Employee | null;
  onChanged: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(employee ? employeeName(employee) : "");
    setDocumentNumber(employee?.documentNumber ?? "");
    setPosition(employee?.position ?? "");
    setEmail(employee?.email ?? "");
    setPhone(employee?.phone ?? "");
    setActive(employee?.isActive === false ? "INACTIVE" : "ACTIVE");
    setError(null);
  }, [employee, open]);

  const save = async () => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") || parts[0] || "";
    if (!fullName.trim()) return setError("El nombre completo es obligatorio.");
    if (!documentNumber.trim()) return setError("El documento es obligatorio.");
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        firstName,
        lastName,
        documentNumber: documentNumber.trim(),
        position: position.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      };
      if (employee) {
        await payrollApi.updateEmployee(employee.id, payload);
        toast.success("Empleado actualizado");
      } else {
        await payrollApi.createEmployee(payload);
        toast.success("Empleado creado");
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo guardar el empleado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetShell
      open={open}
      title={employee ? "Editar Empleado" : "Nuevo Empleado"}
      subtitle="Informacion basica"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-neutral-100 text-sm font-medium text-neutral-600">
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={submitting} className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white shadow-lg shadow-emerald-100 disabled:opacity-60">
            {submitting ? "Guardando..." : "Guardar empleado"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="space-y-3">
            <FieldBlock label="Nombre completo">
              <BigInput value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Juan Perez" />
            </FieldBlock>
            <div className="grid grid-cols-2 gap-3">
              <FieldBlock label="Documento">
                <BigInput value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="123456789" />
              </FieldBlock>
              <FieldBlock label="Cargo">
                <BigInput value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Auxiliar" />
              </FieldBlock>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldBlock label="Telefono">
                <BigInput value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="3001234567" />
              </FieldBlock>
              <FieldBlock label="Correo opcional">
                <BigInput value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@empresa.com" type="email" />
              </FieldBlock>
            </div>
            <div>
              <span className="mb-1.5 block px-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">Estado</span>
              <div className="grid grid-cols-2 gap-2">
                <SegmentedOption value="ACTIVE" current={active} onChange={setActive}>Activo</SegmentedOption>
                <SegmentedOption value="INACTIVE" current={active} onChange={setActive} disabled={!employee}>Inactivo</SegmentedOption>
              </div>
              {active === "INACTIVE" && (
                <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                  La inactivacion sigue las reglas de liquidacion del contrato.
                </p>
              )}
            </div>
          </div>
        </div>
        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </SheetShell>
  );
}

function ContractManagementSheet({
  open,
  onClose,
  employees,
  arlRisks,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  arlRisks: ArlRiskClass[];
  onChanged: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [salaryMonthly, setSalaryMonthly] = useState("");
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState("");
  const [contractType, setContractType] = useState<"INDEFINITE" | "FIXED_TERM">("INDEFINITE");
  const [arlRiskClassId, setArlRiskClassId] = useState("");
  const [applyLaw1819, setApplyLaw1819] = useState(true);
  const [isRemote, setIsRemote] = useState(false);
  const [paymentCycle, setPaymentCycle] = useState<"MONTHLY" | "BIWEEKLY">("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadContracts = useCallback(async () => {
    if (!employeeId) {
      setContracts([]);
      return;
    }
    const data = await payrollApi.listContracts(employeeId);
    setContracts(data);
  }, [employeeId]);

  useEffect(() => {
    if (!open) return;
    loadContracts().catch((err) => setError(err instanceof AppApiError ? err.message : "No se pudieron cargar contratos."));
  }, [loadContracts, open]);

  if (!open) return null;

  const resetForm = () => {
    setEditing(null);
    setSalaryMonthly("");
    setStartDate(todayIso);
    setEndDate("");
    setContractType("INDEFINITE");
    setArlRiskClassId("");
    setApplyLaw1819(true);
    setIsRemote(false);
    setPaymentCycle("MONTHLY");
    setError(null);
  };

  const startEdit = (contract: Contract) => {
    setEditing(contract);
    setSalaryMonthly(String(contract.salaryMonthly ?? ""));
    setStartDate(contract.startDate?.slice(0, 10) ?? todayIso);
    setEndDate(contract.endDate?.slice(0, 10) ?? "");
    setContractType((contract.contractType as "INDEFINITE" | "FIXED_TERM") ?? "INDEFINITE");
    setArlRiskClassId(contract.arlRiskClassId ?? contract.arlRiskClass?.id ?? "");
    setApplyLaw1819(contract.applyLaw1819 ?? true);
    setIsRemote(contract.isRemote ?? false);
    setPaymentCycle((contract.paymentCycle as "MONTHLY" | "BIWEEKLY") ?? "MONTHLY");
    setError(null);
  };

  const save = async () => {
    if (!employeeId) return setError("Selecciona un empleado.");
    if (numberValue(salaryMonthly) <= 0) return setError("El salario mensual debe ser mayor a 0.");
    if (!startDate) return setError("La fecha de ingreso es obligatoria.");
    if (!arlRiskClassId) return setError("Selecciona ARL.");
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        contractType,
        salaryMonthly: numberValue(salaryMonthly),
        startDate,
        endDate: endDate || undefined,
        isRemote,
        applyLaw1819,
        paymentCycle,
        arlRiskClassId,
      };
      if (editing) {
        await payrollApi.updateContract(editing.id, payload);
        toast.success("Contrato actualizado");
      } else {
        await payrollApi.createContract(employeeId, payload);
        toast.success("Contrato creado");
      }
      resetForm();
      await loadContracts();
      onChanged();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo guardar el contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (contract: Contract) => {
    setSubmitting(true);
    try {
      await payrollApi.deleteContract(contract.id);
      toast.success("Contrato inactivado");
      if (editing?.id === contract.id) resetForm();
      await loadContracts();
      onChanged();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo inactivar el contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-blue-500">Contratos</p>
            <h2 className="mt-1 text-lg font-medium text-slate-900">Historial laboral</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <select value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); resetForm(); }} className="mb-3 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-300">
          <option value="">Empleado</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.documentNumber}</option>)}
        </select>

        <div className="space-y-2 rounded-[24px] bg-slate-50 p-3">
          <input value={salaryMonthly} onChange={(event) => setSalaryMonthly(event.target.value)} placeholder="Salario mensual" type="number" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300" />
          <div className="grid grid-cols-2 gap-2">
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
            <input value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
          </div>
          <select value={contractType} onChange={(event) => setContractType(event.target.value as "INDEFINITE" | "FIXED_TERM")} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300">
            <option value="INDEFINITE">Contrato indefinido</option>
            <option value="FIXED_TERM">Termino fijo</option>
          </select>
          <select value={arlRiskClassId} onChange={(event) => setArlRiskClassId(event.target.value)} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300">
            <option value="">ARL</option>
            {arlRisks.map((risk) => <option key={risk.id} value={risk.id}>Riesgo {risk.level} - {Number(risk.rate ?? 0) * 100}%</option>)}
          </select>
          <select value={paymentCycle} onChange={(event) => setPaymentCycle(event.target.value as "MONTHLY" | "BIWEEKLY")} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-300">
            <option value="MONTHLY">Pago mensual</option>
            <option value="BIWEEKLY">Pago quincenal</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex h-11 items-center gap-2 rounded-2xl bg-white px-3 text-sm text-slate-700"><input type="checkbox" checked={applyLaw1819} onChange={(event) => setApplyLaw1819(event.target.checked)} /> Ley 1819</label>
            <label className="flex h-11 items-center gap-2 rounded-2xl bg-white px-3 text-sm text-slate-700"><input type="checkbox" checked={isRemote} onChange={(event) => setIsRemote(event.target.checked)} /> Remoto</label>
          </div>
          {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={resetForm} className="h-11 rounded-2xl bg-white text-sm font-medium text-slate-600">Limpiar</button>
            <button type="button" onClick={save} disabled={submitting} className="h-11 rounded-2xl bg-blue-500 text-sm font-medium text-white disabled:opacity-60">{editing ? "Guardar" : "Crear"}</button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {contracts.map((contract) => (
            <article key={contract.id} className="flex items-center gap-3 rounded-[22px] bg-white p-3 shadow-sm ring-1 ring-black/5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{money(contract.salaryMonthly)}</p>
                <p className="text-xs text-slate-500">{formatCivilDate(contract.startDate)} - {contract.endDate ? formatCivilDate(contract.endDate) : "Activo"} · {contract.paymentCycle === "BIWEEKLY" ? "Quincenal" : "Mensual"}</p>
              </div>
              <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", contract.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{contract.isActive ? "Activo" : "Inactivo"}</span>
              <button type="button" onClick={() => startEdit(contract)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-50 text-slate-500" aria-label="Editar contrato"><Edit3 className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(contract)} className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-500" aria-label="Inactivar contrato"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function PayrollRecordWizardSheet({
  open,
  onClose,
  onFinished,
  arlRisks,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  onFinished: (periodId: string) => void;
  arlRisks: ArlRiskClass[];
  employees: Employee[];
}) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const [step, setStep] = useState<WizardStep>(0);
  const [employeeId, setEmployeeId] = useState("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState("");
  const [year, setYear] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [workedDays, setWorkedDays] = useState("30");
  const [commissions, setCommissions] = useState("0");
  const [nonSalaryBonus, setNonSalaryBonus] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [overtimeHours, setOvertimeHours] = useState<Record<OvertimeType, string>>(defaultOvertimeHours);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !employeeId) {
      setContracts([]);
      setContractId("");
      return;
    }
    payrollApi
      .listContracts(employeeId)
      .then((data) => {
        const activeContracts = data.filter((contract) => contract.isActive !== false && !contract.endDate);
        setContracts(activeContracts);
        setContractId(activeContracts[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof AppApiError ? err.message : "No se pudieron cargar contratos."));
  }, [employeeId, open]);

  if (!open) return null;

  const reset = () => {
    setEmployeeId("");
    setContracts([]);
    setContractId("");
    setYear(String(today.getFullYear()));
    setMonth(String(today.getMonth() + 1));
    setWorkedDays("30");
    setCommissions("0");
    setNonSalaryBonus("0");
    setOtherDeductions("0");
    setAdvancedOpen(false);
    setOvertimeHours(defaultOvertimeHours());
    setStep(0);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const selectedEmployee = employees.find((item) => item.id === employeeId);
  const selectedContract = contracts.find((item) => item.id === contractId);
  const selectedArl = arlRisks.find((item) => item.id === selectedContract?.arlRiskClassId);
  const totalOvertimeHours = overtimeInputs.reduce(
    (sum, item) => sum + numberValue(overtimeHours[item.type]),
    0,
  );

  const validateCurrentStep = () => {
    if (step === 0) {
      if (!employeeId) return "Selecciona un empleado.";
    }
    if (step === 1) {
      if (!contractId) return "Selecciona un contrato activo.";
    }
    if (step === 2) {
      const parsedYear = Number(year);
      const parsedMonth = Number(month);
      if (!Number.isInteger(parsedYear) || parsedYear < 1900) return "El anio del periodo no es valido.";
      if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return "El mes del periodo no es valido.";
      const parsedWorkedDays = numberValue(workedDays);
      if (!Number.isInteger(parsedWorkedDays) || parsedWorkedDays < 1 || parsedWorkedDays > 30) {
        return "Los dias trabajados deben estar entre 1 y 30.";
      }
      if (totalOvertimeHours > 720) return "Las horas suplementarias no pueden superar 720.";
    }
    return null;
  };

  const nextStep = () => {
    const validation = validateCurrentStep();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, 3) as WizardStep);
  };

  const previousStep = () => {
    setError(null);
    setStep((current) => Math.max(current - 1, 0) as WizardStep);
  };

  const findExistingPeriod = async () => {
    const data = await payrollApi.findPeriods(Number(year), Number(month));
    return choosePrimaryMonthlyPeriod(data, Number(year), Number(month)) ?? undefined;
  };

  const handleSubmit = async () => {
    const validation = validateCurrentStep();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const periodPayload = {
        year: Number(year),
        month: Number(month),
        paymentCycle: "MONTHLY" as const,
        installmentNumber: 1,
      };

      let period: PayrollPeriod | undefined;
      try {
        period = await payrollApi.createPeriod(periodPayload);
      } catch (err) {
        if (err instanceof AppApiError && err.status === 409) {
          period = await findExistingPeriod();
          if (!period) throw err;
        } else {
          throw err;
        }
      }

      const overtimePayload = overtimeInputs
        .map((item) => ({
          type: item.type,
          quantity: numberValue(overtimeHours[item.type]),
        }))
        .filter((item) => item.quantity > 0);

      await payrollApi.calculateEmployee(period.id, employeeId, {
        workedDays: numberValue(workedDays || 30),
        commissions: numberValue(commissions),
        nonSalaryBonus: numberValue(nonSalaryBonus),
        otherDeductions: numberValue(otherDeductions),
        overtimeHours: overtimePayload.length ? overtimePayload : undefined,
      });

      reset();
      onFinished(period.id);
      onClose();
      toast.success("Registro de nomina creado");
    } catch (err) {
      if (err instanceof AppApiError && err.status === 409) {
        setError("Ya existe un empleado con ese documento.");
      } else if (err instanceof AppApiError) {
        setError(err.message);
      } else {
        console.error(err);
        setError("No se pudo completar el registro de nomina.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#0fb18f]">Paso {step + 1} de 4</p>
            <h2 className="mt-1 text-lg font-medium text-slate-900">Nuevo registro de nomina</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-1">
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              className={cn("h-1.5 flex-1 rounded-full", item <= step ? "bg-[#0fb18f]" : "bg-slate-100")}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="">Empleado</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeName(employee)} - {employee.position || "Sin cargo"}
                </option>
              ))}
            </select>
            {selectedEmployee && (
              <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
                {selectedEmployee.documentNumber} · {selectedEmployee.position || "Sin cargo"}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <select value={contractId} onChange={(event) => setContractId(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="">Contrato activo</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {money(contract.salaryMonthly)} · {contract.paymentCycle === "BIWEEKLY" ? "Quincenal" : "Mensual"}
                </option>
              ))}
            </select>
            {selectedContract ? (
              <div className="space-y-2 rounded-2xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-500">Ingreso</span><span className="font-medium text-slate-900">{formatCivilDate(selectedContract.startDate)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Salario</span><span className="font-medium text-slate-900">{money(selectedContract.salaryMonthly)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Ciclo</span><span className="font-medium text-slate-900">{selectedContract.paymentCycle === "BIWEEKLY" ? "Quincenal" : "Mensual"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">ARL</span><span className="font-medium text-slate-900">{selectedArl ? `Riesgo ${selectedArl.level}` : "Sin ARL"}</span></div>
              </div>
            ) : (
              <p className="rounded-2xl bg-amber-50 p-3 text-xs font-medium text-amber-700">Este empleado no tiene contrato activo. Crea uno desde Contratos.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={year} onChange={(event) => setYear(event.target.value)} placeholder="Anio" type="number" className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
              <input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="Mes" type="number" min="1" max="12" className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            </div>
            <input value={workedDays} onChange={(event) => setWorkedDays(event.target.value)} placeholder="Dias trabajados" type="number" min="1" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-slate-100 px-4 text-left text-sm font-medium text-slate-700"
            >
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[#0fb18f]" />
                Ajustes avanzados
              </span>
              <span className="text-xs text-slate-400">{totalOvertimeHours} h</span>
            </button>
            {advancedOpen && (
              <div className="space-y-3 rounded-[24px] bg-slate-50 p-3">
                <div className="grid grid-cols-1 gap-2">
                  <input value={commissions} onChange={(event) => setCommissions(event.target.value)} placeholder="Comisiones salariales" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
                  <input value={nonSalaryBonus} onChange={(event) => setNonSalaryBonus(event.target.value)} placeholder="Bonos no salariales Ley 1393" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
                  <input value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)} placeholder="Otras deducciones" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <p className="text-xs font-medium text-slate-700">Trabajo suplementario</p>
                    <p className={cn("text-xs", totalOvertimeHours > 720 ? "text-rose-500" : "text-slate-400")}>
                      {totalOvertimeHours}/720 h
                    </p>
                  </div>
                  {overtimeInputs.map((item) => (
                    <label key={item.type} className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-700">{item.label}</span>
                        <span className="text-[11px] text-slate-400">{item.hint}</span>
                      </span>
                      <input
                        value={overtimeHours[item.type]}
                        onChange={(event) =>
                          setOvertimeHours((current) => ({
                            ...current,
                            [item.type]: event.target.value,
                          }))
                        }
                        type="number"
                        min="0"
                        className="h-9 w-20 rounded-xl border border-slate-200 bg-slate-50 px-2 text-right text-sm outline-none focus:border-emerald-300"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Empleado</span><span className="font-medium text-slate-900">{selectedEmployee ? employeeName(selectedEmployee) : "-"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Salario mensual</span><span className="font-medium text-slate-900">{money(selectedContract?.salaryMonthly)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Periodo</span><span className="font-medium text-slate-900">{monthNames[Number(month) - 1]} {year}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Dias trabajados</span><span className="font-medium text-slate-900">{workedDays}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Horas suplementarias</span><span className="font-medium text-slate-900">{totalOvertimeHours}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Ley 1819</span><span className="font-medium text-slate-900">{selectedContract?.applyLaw1819 ? "Si aplica" : "No aplica"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">ARL</span><span className="max-w-[60%] truncate font-medium text-slate-900">{selectedArl ? `${selectedArl.level} - ${selectedArl.name}` : "Sin seleccionar"}</span></div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={step === 0 ? handleClose : previousStep}
            className="h-12 flex-1 rounded-2xl bg-slate-100 text-sm font-medium text-slate-600"
          >
            {step === 0 ? "Cancelar" : "Atras"}
          </button>
          <button
            type="button"
            onClick={step === 3 ? handleSubmit : nextStep}
            disabled={submitting}
            className="h-12 flex-1 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white shadow-lg shadow-emerald-100 disabled:opacity-60"
          >
            {submitting ? "Creando..." : step === 3 ? "Confirmar" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayrollNewsSheet({
  open,
  onClose,
  run,
  employee,
  contract,
  selectedPeriod,
  onPreview,
  onSettlementPreview,
  onFinished,
}: {
  open: boolean;
  onClose: () => void;
  run?: PayrollRun | null;
  employee?: Employee | null;
  contract?: Contract | null;
  selectedPeriod?: PayrollPeriod;
  onPreview?: (preview: PayrollRun) => void;
  onSettlementPreview?: (settlement: Settlement) => void;
  onFinished: (periodId: string) => void;
}) {
  const [workedDays, setWorkedDays] = useState("30");
  const [commissions, setCommissions] = useState("0");
  const [nonSalaryBonus, setNonSalaryBonus] = useState("0");
  const [loans, setLoans] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [simulatedEndDate, setSimulatedEndDate] = useState("");
  const [preview, setPreview] = useState<PayrollRun | null>(null);
  const [settlementPreview, setSettlementPreview] = useState<Settlement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [overtimeHours, setOvertimeHours] = useState<Record<OvertimeType, string>>(defaultOvertimeHours);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWorkedDays("30");
    setCommissions(String(run?.commissions ?? "0"));
    setNonSalaryBonus(String(run?.nonSalaryBonus ?? "0"));
    setLoans(String(runLoanDeductionValue(run)));
    setOtherDeductions(String(runOtherDeductionsValue(run)));
    setSimulatedEndDate(settlementDefaultEndDate(contract ?? run?.contract, selectedPeriod));
    setPreview(run?.preview ? run : null);
    setSettlementPreview(null);
    setOvertimeHours(defaultOvertimeHours());
    setError(null);
  }, [contract, open, run, selectedPeriod]);

  const totalOvertimeHours = overtimeInputs.reduce(
    (sum, item) => sum + numberValue(overtimeHours[item.type]),
    0,
  );

  const sheetEmployee = run?.employee ?? employee ?? null;
  const employeeId = run?.employeeId ?? sheetEmployee?.id;
  const sheetContract = run?.contract ?? contract ?? null;
  const editable = isPeriodEditable(selectedPeriod);

  const buildPayload = useCallback((): CalculatePayrollPayload | null => {
    const parsedWorkedDays = numberValue(workedDays);
    if (!Number.isInteger(parsedWorkedDays) || parsedWorkedDays < 1 || parsedWorkedDays > 30) {
      return null;
    }
    const overtimePayload = overtimeInputs
      .map((item) => ({
        type: item.type,
        quantity: numberValue(overtimeHours[item.type]),
      }))
      .filter((item) => item.quantity > 0);

    return {
      workedDays: parsedWorkedDays,
      commissions: numberValue(commissions),
      nonSalaryBonus: numberValue(nonSalaryBonus),
      loanDeduction: numberValue(loans),
      otherDeductions: numberValue(otherDeductions),
      overtimeHours: overtimePayload.length ? overtimePayload : undefined,
    };
  }, [commissions, loans, nonSalaryBonus, otherDeductions, overtimeHours, workedDays]);

  useEffect(() => {
    if (!open || !employeeId || !selectedPeriod) return;
    const payload = buildPayload();
    if (!payload) return;

    let alive = true;
    const timer = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const [payrollPreview, settlementResult] = await Promise.all([
          payrollApi.previewEmployee(selectedPeriod.id, employeeId, payload),
          sheetContract?.id
            ? payrollApi.simulateSettlement(
                sheetContract.id,
                {
                  ...(simulatedEndDate ? { endDate: simulatedEndDate } : {}),
                  calculationYear: selectedPeriod.year,
                },
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!alive) return;
        setPreview(payrollPreview);
        onPreview?.(payrollPreview);
        if (settlementResult) {
          setSettlementPreview(settlementResult);
          onSettlementPreview?.(settlementResult);
        }
        setError(null);
      } catch (err) {
        if (alive) setError(err instanceof AppApiError ? err.message : "No se pudo calcular la vista previa.");
      } finally {
        if (alive) setPreviewing(false);
      }
    }, 500);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [buildPayload, employeeId, onPreview, onSettlementPreview, open, selectedPeriod, sheetContract?.id, simulatedEndDate]);

  const save = async () => {
    if (!employeeId || !selectedPeriod) return setError("Selecciona un periodo con empleado activo.");
    if (!editable) return setError("Este per�odo ya fue liquidado. No se pueden modificar novedades.");
    const parsedWorkedDays = numberValue(workedDays);
    if (!Number.isInteger(parsedWorkedDays) || parsedWorkedDays < 1 || parsedWorkedDays > 30) {
      return setError("Los dias trabajados deben estar entre 1 y 30.");
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (!payload) return setError("Revisa los valores de novedades.");
      await payrollApi.calculateEmployee(selectedPeriod.id, employeeId, payload);

      onFinished(selectedPeriod.id);
      toast.success("Novedades guardadas");
      onClose();
    } catch (err) {
      const message = payrollErrorMessage(err, "No se pudieron guardar las novedades.");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetShell
      open={open}
      title="Novedades"
      subtitle={sheetEmployee ? employeeName(sheetEmployee) : "Empleado"}
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-neutral-100 text-sm font-medium text-neutral-600">
            Cancelar
          </button>
          {editable ? (
            <button type="button" onClick={save} disabled={submitting || !employeeId} className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white shadow-lg shadow-emerald-100 disabled:opacity-60">
              {submitting ? "Guardando..." : "Guardar novedades"}
            </button>
          ) : (
            <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-medium text-white shadow-lg shadow-emerald-100">
              Ver detalle
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {!editable && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Este per�odo ya fue liquidado. No se pueden modificar novedades. Vista previa, no modifica el período posteado.
          </p>
        )}
        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-900">{sheetEmployee ? employeeName(sheetEmployee) : "Empleado"}</p>
              <p className="text-xs font-medium text-neutral-400">{sheetEmployee?.position ?? "Sin cargo"}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
              {contract?.paymentCycle === "BIWEEKLY" || run?.contract?.paymentCycle === "BIWEEKLY" ? "Quincenal" : selectedPeriod ? `${monthNames[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "Sin periodo"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldBlock label="Dias trabajados">
              <BigInput value={workedDays} onChange={(event) => setWorkedDays(event.target.value)} type="number" min="1" max="30" disabled={!editable} />
            </FieldBlock>
            <FieldBlock label="Prestamos">
              <BigInput value={loans} onChange={(event) => setLoans(event.target.value)} type="number" min="0" disabled={!editable} />
            </FieldBlock>
            <FieldBlock label="Comisiones salariales">
              <BigInput value={commissions} onChange={(event) => setCommissions(event.target.value)} type="number" min="0" disabled={!editable} />
            </FieldBlock>
            <FieldBlock label="Bonos no salariales">
              <BigInput value={nonSalaryBonus} onChange={(event) => setNonSalaryBonus(event.target.value)} type="number" min="0" disabled={!editable} />
            </FieldBlock>
            <FieldBlock label="Otras deducciones">
              <BigInput value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)} type="number" min="0" disabled={!editable} />
            </FieldBlock>
            <FieldBlock label="Fecha salida simulada">
              <BigInput value={simulatedEndDate} onChange={(event) => setSimulatedEndDate(event.target.value)} type="date" />
            </FieldBlock>
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Trabajo suplementario</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-medium text-neutral-500">{totalOvertimeHours} h</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {overtimeInputs.map((item) => (
              <label key={item.type} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-medium text-neutral-700">{item.label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#0fb18f]">{item.hint}</span>
                </span>
                <input
                  value={overtimeHours[item.type]}
                  onChange={(event) =>
                    setOvertimeHours((current) => ({
                      ...current,
                      [item.type]: event.target.value,
                    }))
                  }
                  type="number"
                  min="0"
                  disabled={!editable}
                  className="mt-2 h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-right text-sm font-semibold outline-none focus:border-emerald-400"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <span className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-neutral-400">
            Resumen de novedades {previewing ? "calculando..." : ""}
          </span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-emerald-50 p-2">
              <p className="text-[10px] font-medium text-emerald-700">Comisiones</p>
              <p className="text-xs font-medium text-emerald-800">+{money(commissions)}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-2">
              <p className="text-[10px] font-medium text-rose-700">Prestamos</p>
              <p className="text-xs font-medium text-rose-800">-{money(loans)}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-2">
              <p className="text-[10px] font-medium text-blue-700">Extras</p>
              <p className="text-xs font-medium text-blue-800">{totalOvertimeHours} h</p>
            </div>
          </div>
        </div>

        {preview && (
          <div className="rounded-[24px] border border-emerald-100 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-emerald-600">Vista previa de nomina</span>
            <div className="space-y-1.5">
              <MoneyLine label="Devengados" value={preview.grossIncome} color="text-slate-600" />
              <MoneyLine label="Deducciones" value={preview.totalEmployeeDeductions} color="text-rose-500" sign="-" />
              <MoneyLine label="Prestaciones" value={preview.totalBenefits} color="text-violet-600" />
              <MoneyLine label="Neto" value={preview.netPay} color="text-slate-900" medium />
              <MoneyLine label="Costo empresa" value={preview.realEmployerCost} color="text-[#0fb18f]" medium />
            </div>
          </div>
        )}

        {settlementPreview && (
          <SettlementPanel settlement={settlementPreview} />
        )}

        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </SheetShell>
  );
}

function SettlementSimulationSheet({
  open,
  onClose,
  employees,
  selectedPeriod,
  onFinished,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  selectedPeriod?: PayrollPeriod;
  onFinished: (settlement: Settlement) => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState("");
  const [endDate, setEndDate] = useState("");
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !employeeId) {
      setContracts([]);
      setContractId("");
      return;
    }

    let alive = true;
    setLoadingContracts(true);
    payrollApi
      .listContracts(employeeId)
      .then((data) => {
        if (!alive) return;
        setContracts(data);
        const nextContract = data.find((contract) => !contract.endDate) ?? data[0];
        setContractId(nextContract?.id ?? "");
        setEndDate(isoDate(nextContract?.endDate));
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError("No se pudieron cargar los contratos del empleado.");
      })
      .finally(() => {
        if (alive) setLoadingContracts(false);
      });

    return () => {
      alive = false;
    };
  }, [employeeId, open]);

  const selectedContract = contracts.find((contract) => contract.id === contractId);

  useEffect(() => {
    if (!open || !selectedContract) return;
    setEndDate((current) => current || isoDate(selectedContract.endDate));
  }, [open, selectedContract]);

  const handleClose = () => {
    setEmployeeId("");
    setContracts([]);
    setContractId("");
    setEndDate("");
    setSettlement(null);
    setConfirmingPost(false);
    setError(null);
    onClose();
  };

  const handleSimulate = async () => {
    if (!employeeId) {
      setError("Selecciona un empleado.");
      return;
    }
    if (!contractId) {
      setError("Selecciona un contrato.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await payrollApi.simulateSettlement(contractId, {
        ...(endDate ? { endDate } : {}),
        ...(selectedPeriod ? { calculationYear: selectedPeriod.year } : {}),
      });
      setSettlement(result);
      onFinished(result);
      toast.success("Liquidacion simulada");
    } catch (err) {
      if (err instanceof AppApiError) {
        setError(err.message);
      } else {
        console.error(err);
        setError("No se pudo simular la liquidacion.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!open || !contractId) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      setSubmitting(true);
      setError(null);
      try {
        const result = await payrollApi.simulateSettlement(contractId, {
          ...(endDate ? { endDate } : {}),
          ...(selectedPeriod ? { calculationYear: selectedPeriod.year } : {}),
        });
        if (!alive) return;
        setSettlement(result);
        onFinished(result);
      } catch (err) {
        if (alive) setError(err instanceof AppApiError ? err.message : "No se pudo simular la liquidacion.");
      } finally {
        if (alive) setSubmitting(false);
      }
    }, 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [contractId, endDate, onFinished, open, selectedPeriod]);

  const handlePostSettlement = async () => {
    if (!contractId) return;
    if (!endDate) {
      setError("Para postear una liquidacion real debes indicar fecha de salida.");
      return;
    }
    if (!confirmingPost) {
      setConfirmingPost(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const posted = await payrollApi.createSettlement(contractId, {
        endDate,
        ...(selectedPeriod ? { calculationYear: selectedPeriod.year } : {}),
      });
      setSettlement(posted);
      onFinished(posted);
      toast.success("Liquidacion posteada");
      setConfirmingPost(false);
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo postear la liquidacion.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-500">Liquidacion</p>
            <h2 className="mt-1 text-lg font-medium text-slate-900">Simular contrato</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <select
            value={employeeId}
            onChange={(event) => {
              setEmployeeId(event.target.value);
              setSettlement(null);
            }}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300"
          >
            <option value="">Empleado</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employeeName(employee)} {employee.documentNumber ? `- ${employee.documentNumber}` : ""}
              </option>
            ))}
          </select>

          <select
            value={contractId}
            onChange={(event) => {
              setContractId(event.target.value);
              setSettlement(null);
            }}
            disabled={!employeeId || loadingContracts}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 disabled:opacity-60"
          >
            <option value="">{loadingContracts ? "Cargando contratos..." : "Contrato"}</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {formatCivilDate(contract.startDate)} - {contract.endDate ? formatCivilDate(contract.endDate) : "Activo"}
              </option>
            ))}
          </select>

          <label className="block rounded-2xl bg-slate-50 p-3">
            <span className="text-xs font-medium text-slate-500">Fecha de salida opcional</span>
            <input
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              type="date"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-300"
            />
            <span className="mt-2 block text-[11px] text-slate-400">
              Si dejás vacío este campo y el contrato no tiene fecha de salida, se proyecta al día actual.
            </span>
          </label>

          {confirmingPost && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              Esta acción generará la liquidación definitiva y cerrará el contrato.
            </div>
          )}

          {selectedContract && (
            <div className="rounded-2xl bg-violet-50 p-3 text-xs text-violet-800">
              Ingreso: {formatCivilDate(selectedContract.startDate)} · Salario: {money(selectedContract.salaryMonthly)}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
            {error}
          </p>
        )}

        {settlement && (
          <div className="mt-4">
            <SettlementPanel settlement={settlement} />
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="h-12 flex-1 rounded-2xl bg-slate-100 text-sm font-medium text-slate-600"
          >
            Cerrar
          </button>








        </div>
        {settlement && (
          <button
            type="button"
            onClick={handlePostSettlement}
            disabled={submitting}
            className="mt-2 h-12 w-full rounded-2xl bg-slate-900 text-sm font-medium text-white disabled:opacity-60"
          >
            {confirmingPost ? "Confirmar registro definitivo" : "Registrar liquidacion"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PayrollPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [arlRisks, setArlRisks] = useState<ArlRiskClass[]>([]);

  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [settlements, setSettlements] = useState<Record<string, Settlement>>({});
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [settlementsLoading, setSettlementsLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employeeSheetOpen, setEmployeeSheetOpen] = useState(false);
  const [quickSheetMode, setQuickSheetMode] = useState<Exclude<PayrollSheetMode, "editEmployee"> | null>(null);
  const [quickInitialEmployee, setQuickInitialEmployee] = useState<Employee | null>(null);
  const [newsSheetOpen, setNewsSheetOpen] = useState(false);
  const [settlementSheetOpen, setSettlementSheetOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [newsRun, setNewsRun] = useState<PayrollRun | null>(null);
  const [newsEmployee, setNewsEmployee] = useState<Employee | null>(null);
  const [newsContract, setNewsContract] = useState<Contract | null>(null);
  const [editorSheetOpen, setEditorSheetOpen] = useState(false);
  const [editorRun, setEditorRun] = useState<PayrollRun | null>(null);
  const [periodRefreshKey, setPeriodRefreshKey] = useState(0);
  const [simulationByEmployee, setSimulationByEmployee] = useState<Record<string, PayrollRun>>({});
  const [settlementPreviewByContract, setSettlementPreviewByContract] = useState<Record<string, Settlement>>({});
  const [visualPaidRuns, setVisualPaidRuns] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<
    | { type: "visual-payment"; run: PayrollRun; paid: boolean }
    | { type: "post-period" }
    | { type: "post-settlement"; run: PayrollRun; settlement: Settlement }
    | { type: "complementary-run"; employee: Employee }
    | null
  >(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [postingSettlementContractId, setPostingSettlementContractId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId && isPrimaryMonthlyPeriod(period)),
    [periods, selectedPeriodId],
  );

  const loadPeriods = useCallback(async () => {
    setPeriodsLoading(true);
    setError(null);
    try {
      const data = await payrollApi.listPeriods();
      let nextPeriods = data;
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;

      let fallbackPeriod = choosePrimaryMonthlyPeriod(nextPeriods, year, month);
      if (!fallbackPeriod) {
        fallbackPeriod = await payrollApi.createPeriod({ year, month, paymentCycle: "MONTHLY", installmentNumber: 1 })
          .catch(async (err) => {
            if (err instanceof AppApiError && err.status === 409) {
              const existingPeriods = await payrollApi.findPeriods(year, month);
              return choosePrimaryMonthlyPeriod(existingPeriods, year, month);
            }
            throw err;
          });
        if (fallbackPeriod && !nextPeriods.some((period) => period.id === fallbackPeriod?.id)) {
          nextPeriods = [fallbackPeriod, ...nextPeriods];
        }
      }

      setPeriods(nextPeriods);
      setSelectedPeriodId((current) => {
        const currentPeriod = nextPeriods.find((period) => period.id === current && isPrimaryMonthlyPeriod(period));
        if (currentPeriod) return current;
        return fallbackPeriod?.id ?? "";
      });
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar nomina");
    } finally {
      setPeriodsLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const data = await payrollApi.listEmployees();
      const withContracts = await Promise.all(
        data.map(async (employee) => ({
          ...employee,
          contracts: await payrollApi.listContracts(employee.id).catch(() => employee.contracts ?? []),
        })),
      );
      setEmployees(withContracts);
    } catch (err) {
      console.error(err);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  const loadCatalogs = useCallback(async () => {
    const [risks] = await Promise.allSettled([
      payrollApi.listArlRisks(),

    ]);
    if (risks.status === "fulfilled") setArlRisks(risks.value);

  }, []);

  useEffect(() => {
    loadPeriods();
    loadEmployees();
    loadCatalogs();
  }, [loadCatalogs, loadEmployees, loadPeriods]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setRuns([]);
      setSettlements({});
      setSettlementPreviewByContract({});
      setSelectedRunId(null);
      setRunsLoading(false);
      setSettlementsLoading(false);
      return;
    }

    let alive = true;
    setRuns([]);
    setSettlements({});
    setSettlementPreviewByContract({});
    setSelectedRunId(null);
    setVisualPaidRuns({});
    setRunsLoading(true);
    setSettlementsLoading(true);
    setError(null);
    const periodId = selectedPeriodId;

    Promise.all([
      payrollApi.listRuns(periodId),
      payrollApi.listSettlements(),
    ])
      .then(async ([runData, settlementList]) => {
        if (!alive) return;
        const runsWithPayments = await Promise.all(
          runData.map(async (run) => ({
            ...run,
            payments: run.payments?.length
              ? run.payments
              : await payrollApi.listRunPayments(run.id).catch(() => []),
          })),
        );
        if (!alive) return;
        const periodRuns = runsWithPayments.filter((run) => !run.payrollPeriodId || run.payrollPeriodId === periodId);
        setRuns(periodRuns);
        setSelectedRunId((current) => current ?? periodRuns[0]?.id ?? null);

        const latestByEmployee = new Map<string, Settlement>();
        for (const settlement of settlementList) {
          if (!latestByEmployee.has(settlement.employeeId)) {
            latestByEmployee.set(settlement.employeeId, settlement);
          }
        }

        const details = await Promise.all(
          Array.from(latestByEmployee.values()).map((settlement) =>
            payrollApi.getSettlement(settlement.id).catch(() => settlement),
          ),
        );

        if (!alive) return;
        setSettlements(
          details.reduce<Record<string, Settlement>>((acc, settlement) => {
            acc[settlement.employeeId] = settlement;
            return acc;
          }, {}),
        );
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError("No se pudo cargar el periodo seleccionado");
      })
      .finally(() => {
        if (alive) {
          setRunsLoading(false);
          setSettlementsLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [selectedPeriodId, periodRefreshKey]);

  const employeeRows = useMemo(() => {
    const employeeIds = new Set(employees.map((employee) => employee.id));
    const runByEmployeeId = new Map(runs.map((run) => [run.employeeId, run]));
    const rows = employees.map((employee) => {
      const run = runByEmployeeId.get(employee.id);
      const activeContract = run?.contract ?? findActiveContract(employee.contracts, selectedPeriod);
      const preview = !run && activeContract && selectedPeriod?.status !== "POSTED" && selectedPeriod?.status !== "CLOSED"
        ? simulationByEmployee[payrollSimulationKey(employee.id, activeContract.id, selectedPeriod?.id)]
        : null;
      return {
        key: run?.id ?? preview?.id ?? employee.id,
        employee,
        contract: activeContract,
        run: run ? { ...run, employee, contract: activeContract ?? run.contract } : preview,
      };
    });

    for (const run of runs) {
      if (employeeIds.has(run.employeeId)) continue;
      rows.push({
        key: run.id,
        employee: run.employee,
        contract: run.contract ?? null,
        run: { ...run, contract: run.contract ?? null },
      });
    }

    return rows;
  }, [employees, runs, selectedPeriod, simulationByEmployee]);

  useEffect(() => {
    if (
      !selectedPeriod ||
      employeesLoading ||
      runsLoading ||
      selectedPeriod.status === "POSTED" ||
      selectedPeriod.status === "CLOSED"
    ) {
      setPreviewLoading(false);
      return;
    }
    const missingRows = employees
      .map((employee) => ({
        employee,
        contract: findActiveContract(employee.contracts, selectedPeriod),
        hasRun: runs.some((run) => run.employeeId === employee.id),
      }))
      .filter((row) => row.contract && !row.hasRun && !simulationByEmployee[payrollSimulationKey(row.employee.id, row.contract?.id, selectedPeriod.id)]);

    if (!missingRows.length) {
      setPreviewLoading(false);
      return;
    }
    let alive = true;
    setPreviewLoading(true);
    const timer = window.setTimeout(async () => {
      const previews = await Promise.all(
        missingRows.map(async ({ employee, contract }) => {
          try {
            const [payrollPreview, settlementPreview] = await Promise.all([
              payrollApi.previewEmployee(selectedPeriod.id, employee.id, {
                workedDays: selectedPeriod.paymentCycle === "BIWEEKLY" ? 15 : 30,
                commissions: 0,
                nonSalaryBonus: 0,
                otherDeductions: 0,
              }),
              contract?.id
                ? payrollApi.simulateSettlement(contract.id, {
                    endDate: settlementDefaultEndDate(contract, selectedPeriod),
                    calculationYear: selectedPeriod.year,
                  }).catch(() => null)
                : Promise.resolve(null),
            ]);
            return { employeeId: employee.id, contractId: contract?.id, payrollPreview, settlementPreview };
          } catch {
            return null;
          }
        }),
      );
      if (!alive) return;
      setSimulationByEmployee((current) => {
        const next = { ...current };
        for (const item of previews) {
          if (item) next[payrollSimulationKey(item.employeeId, item.contractId, selectedPeriod.id)] = item.payrollPreview;
        }
        return next;
      });
      setSettlementPreviewByContract((current) => {
        const next = { ...current };
        for (const item of previews) {
          if (item?.contractId && item.settlementPreview) next[item.contractId] = item.settlementPreview;
        }
        return next;
      });
      setPreviewLoading(false);
    }, 500);

    return () => {
      alive = false;
      setPreviewLoading(false);
      window.clearTimeout(timer);
    };
  }, [employees, employeesLoading, runs, runsLoading, selectedPeriod, simulationByEmployee]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rowsWithContract = employeeRows.filter((row) => Boolean(row.contract || row.run));
    if (!term) return rowsWithContract;
    return rowsWithContract.filter((row) => {
      const fullName = employeeName(row.employee).toLowerCase();
      return (
        fullName.includes(term) ||
        row.employee.firstName?.toLowerCase().includes(term) ||
        row.employee.lastName?.toLowerCase().includes(term) ||
        row.employee.documentNumber?.toLowerCase().includes(term) ||
        row.employee.position?.toLowerCase().includes(term)
      );
    });
  }, [employeeRows, search]);

  const totals = useMemo(
    () => ({
      cost: filteredRows.reduce((acc, row) => acc + toNumber(row.run?.realEmployerCost), 0),
      net: filteredRows.reduce((acc, row) => acc + toNumber(row.run?.netPay), 0),
    }),
    [filteredRows],
  );

  const selectedRun = useMemo(() => {
    if (selectedRunId) {
      const found = filteredRows.find((row) => row.run?.id === selectedRunId);
      if (found?.run) return found.run;
    }
    return filteredRows.find((row) => row.run)?.run ?? undefined;
  }, [filteredRows, selectedRunId]);

  useEffect(() => {
    if (selectedRun?.id && selectedRun.id !== selectedRunId) {
      setSelectedRunId(selectedRun.id);
    } else if (!selectedRun && selectedRunId !== null) {
      setSelectedRunId(null);
    }
  }, [selectedRun, selectedRunId]);

  useEffect(() => {
    if (!selectedRun || runsLoading || settlementsLoading) return;
    const contractId = selectedRun.contractId ?? selectedRun.contract?.id;
    if (!contractId) return;

    if (settlements[selectedRun.employeeId] || settlementPreviewByContract[contractId]) {
      return;
    }

    let alive = true;
    payrollApi.simulateSettlement(contractId, {
      endDate: settlementDefaultEndDate(selectedRun.contract, selectedPeriod),
      ...(selectedPeriod ? { calculationYear: selectedPeriod.year } : {}),
    })
      .then((preview) => {
        if (!alive) return;
        if (preview) {
          setSettlementPreviewByContract((current) => ({
            ...current,
            [contractId]: preview,
          }));
        }
      })
      .catch((err) => {
        console.error("Failed to load settlement preview for contract:", contractId, err);
      });

    return () => {
      alive = false;
    };
  }, [selectedRun, runsLoading, settlementsLoading, settlements, settlementPreviewByContract, selectedPeriod]);

  const refreshRunPayments = useCallback(async (runId: string) => {
    const payments = await payrollApi.listRunPayments(runId);
    setRuns((current) =>
      current.map((run) => (run.id === runId ? { ...run, payments } : run)),
    );
  }, []);

  const togglePayment = useCallback(async (run: PayrollRun) => {
    try {
      const viewModel = payrollRunViewModel(run);
      if (!viewModel.salaryPayments.length) {
        toast.error("No hay pagos generados para esta nómina.");
        return;
      }
      const nextStatus = viewModel.allPaid ? "PENDING" : "PAID";
      await Promise.all(
        viewModel.salaryPayments.map((payment) =>
          payrollApi.updatePaymentStatus(payment.id, {
            status: nextStatus,
            paymentMethod: "BANK_TRANSFER",
          })
        )
      );
      await refreshRunPayments(run.id);
      toast.success(nextStatus === "PAID" ? "Pago registrado" : "Pago marcado pendiente");
    } catch (err) {
      setNotice(err instanceof AppApiError ? err.message : "No se pudo actualizar el pago.");
      window.setTimeout(() => setNotice(null), 2800);
    }
  }, [refreshRunPayments]);

  const handleCreateFromChat = () => {
    setQuickInitialEmployee(null);
    setQuickSheetMode("createEmployee");
  };

  const handleToggleVisualPayment = useCallback((run: PayrollRun, paid: boolean) => {
    setConfirmAction({ type: "visual-payment", run, paid });
  }, []);

  const handleLiquidateContractPrompt = useCallback((run: PayrollRun, settlement: Settlement) => {
    const existingSettlement = settlements[run.employeeId];
    if (existingSettlement && !existingSettlement.preview) {
      toast.error("Este contrato ya tiene una liquidacion registrada.");
      return;
    }
    setConfirmAction({ type: "post-settlement", run, settlement });
  }, [settlements]);


  const handlePayrollPreview = useCallback((preview: PayrollRun) => {
    setSimulationByEmployee((current) => ({
      ...current,
      [payrollSimulationKey(preview.employeeId, preview.contractId, selectedPeriodId)]: preview,
    }));
  }, [selectedPeriodId]);

  const handleSettlementPreview = useCallback((settlement: Settlement) => {
    if (settlement.preview) {
      setSettlementPreviewByContract((current) => ({
        ...current,
        [settlement.contractId]: settlement,
      }));
      return;
    }
    setSettlements((current) => ({
      ...current,
      [settlement.employeeId]: settlement,
    }));
  }, []);

  const refreshPeople = useCallback(async () => {
    await loadEmployees();
    setPeriodRefreshKey((value) => value + 1);
  }, [loadEmployees]);

  const handleInactivateContract = useCallback((contract: Contract) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-900">¿Inactivar este contrato?</p>
        <p className="text-xs text-slate-500">El contrato dejará de estar activo. El historial se conservará.</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button onClick={async () => {
            toast.dismiss(t.id);
            try {
              await payrollApi.deleteContract(contract.id);
              toast.success("Contrato inactivado");
              await refreshPeople();
            } catch (err) {
              toast.error(payrollErrorMessage(err, "No se pudo inactivar el contrato."), { duration: 4000 });
            }
          }} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Inactivar contrato</button>
        </div>
      </div>
    ), { duration: Infinity });
  }, [refreshPeople]);

  const handleInactivateEmployee = useCallback((employee: Employee) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-900">¿Inactivar este empleado?</p>
        <p className="text-xs text-slate-500">El empleado dejará de aparecer como activo. No se eliminará su historial.</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button onClick={async () => {
            toast.dismiss(t.id);
            try {
              await payrollApi.deleteEmployee(employee.id);
              toast.success("Empleado inactivado");
              await refreshPeople();
            } catch (err) {
              toast.error(payrollErrorMessage(err, "No se pudo inactivar el empleado."), { duration: 4000 });
            }
          }} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Inactivar empleado</button>
        </div>
      </div>
    ), { duration: Infinity });
  }, [refreshPeople]);

  const handleHardDeleteEmployee = useCallback((employee: Employee) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-900">¿Eliminar este empleado?</p>
        <p className="text-xs text-slate-500">Solo funciona si no tiene historial. Acción irreversible.</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button onClick={async () => {
            toast.dismiss(t.id);
            try {
              await payrollApi.hardDeleteEmployee(employee.id);
              toast.success("Empleado eliminado");
              await refreshPeople();
            } catch (err) {
              toast.error(payrollErrorMessage(err, "No se pudo eliminar definitivamente."), { duration: 4000 });
            }
          }} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Eliminar empleado</button>
        </div>
      </div>
    ), { duration: Infinity });
  }, [refreshPeople]);

  
  const handleCreateOrSelectPeriod = async (year: number, month: number) => {
    try {
      const existingPeriods = await payrollApi.findPeriods(year, month);
      const existingPeriod = choosePrimaryMonthlyPeriod(existingPeriods, year, month);
      if (existingPeriod) {
        setSelectedPeriodId(existingPeriod.id);
        return;
      }
      
      const newPeriod = await payrollApi.createPeriod({ year, month, paymentCycle: "MONTHLY", installmentNumber: 1 }).catch(async (err) => {
        if (err instanceof AppApiError && err.status === 409) {
          const existingPeriods = await payrollApi.findPeriods(year, month);
          const existing = choosePrimaryMonthlyPeriod(existingPeriods, year, month);
          if (existing) return existing;
        }
        throw err;
      });

      if (!newPeriod) return;
      setPeriods((prev) => (
        prev.some((p) => p.id === newPeriod.id)
          ? prev
          : [...prev, newPeriod]
      ));
      setSelectedPeriodId(newPeriod.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostPeriod = async () => {
    if (!selectedPeriodId) return;
    if (selectedPeriod?.status === "POSTED" || selectedPeriod?.status === "CLOSED") {
      toast("Este periodo ya fue liquidado.");
      return;
    }
    try {
      await payrollApi.liquidatePeriod(selectedPeriodId);
      toast.success("Nomina liquidada.");
      await loadPeriods();
      setPeriodRefreshKey((value) => value + 1);
    } catch (err) {
      const message = payrollErrorMessage(err, "No se pudo liquidar la nomina.");
      toast.error(message);
      setNotice(message);
      window.setTimeout(() => setNotice(null), 2800);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.type === "visual-payment") {
      setVisualPaidRuns((current) => ({
        ...current,
        [confirmAction.run.id]: confirmAction.paid,
      }));
      toast.success(confirmAction.paid ? "Nomina marcada como pagada." : "Nomina marcada como pendiente.");
      setConfirmAction(null);
      return;
    }

    setConfirmLoading(true);
    try {
      if (confirmAction.type === "post-period") {
        await handlePostPeriod();
        setConfirmAction(null);
        return;
      }

      if (confirmAction.type === "complementary-run") {
        if (!selectedPeriodId) {
          toast.error("Selecciona un periodo.");
          setConfirmAction(null);
          return;
        }
        const run = await payrollApi.createComplementaryRun(
          selectedPeriodId,
          confirmAction.employee.id,
          { reason: "Empleado cargado después de liquidar período" },
        );
        setRuns((current) => (
          current.some((item) => item.id === run.id) ? current : [run, ...current]
        ));
        await refreshPeople();
        setPeriodRefreshKey((value) => value + 1);
        setSelectedRunId(run.id);
        toast.success("Nómina complementaria generada.");
        setConfirmAction(null);
        return;
      }

      const { run, settlement } = confirmAction;
      const existingSettlement = settlements[run.employeeId];
      if (existingSettlement && !existingSettlement.preview) {
        toast.error("Este contrato ya tiene una liquidacion registrada.");
        setConfirmAction(null);
        return;
      }

      const contractId = run.contractId ?? run.contract?.id;
      if (!contractId) {
        toast.error("No se encontro contrato para liquidar.");
        setConfirmAction(null);
        return;
      }

      setPostingSettlementContractId(contractId);
      const salaryConceptsAmount = numberValue(
        settlement.usedParameters?.salaryConceptsAmount as string | number | null | undefined,
      );
      const posted = await payrollApi.createSettlement(contractId, {
        endDate: settlement.requestedEndDate ?? settlement.endDate ?? settlementDefaultEndDate(run.contract, selectedPeriod),
        calculationYear: settlement.calculationYear ?? selectedPeriod?.year,
        ...(salaryConceptsAmount > 0 ? { salaryConceptsAmount } : {}),
      });
      setSettlements((current) => ({
        ...current,
        [posted.employeeId]: posted,
      }));
      setSettlementPreviewByContract((current) => {
        const next = { ...current };
        delete next[contractId];
        return next;
      });
      await refreshPeople();
      toast.success("Contrato liquidado.");
      setConfirmAction(null);
    } catch (err) {
      const message = err instanceof AppApiError ? err.message : "No se pudo completar la liquidacion.";
      toast.error(message);
    } finally {
      setConfirmLoading(false);
      setPostingSettlementContractId(null);
    }
  };

  const hasLoadedPayrollData = Boolean(
    selectedPeriodId &&
    !periodsLoading &&
    !employeesLoading &&
    !runsLoading &&
    !settlementsLoading &&
    !previewLoading,
  );
  const hasPersistedRuns = runs.length > 0;
  const hasPayrollRows = filteredRows.some((row) => Boolean(row.run));
  const periodAlreadyPosted = hasLoadedPayrollData
    && hasPersistedRuns
    && (selectedPeriod?.status === "POSTED" || selectedPeriod?.status === "CLOSED");
  const canLiquidatePayroll = Boolean(
    hasLoadedPayrollData &&
    selectedPeriodId &&
    employees.length > 0 &&
    !periodAlreadyPosted,
  );
  
  const totalRowsInfo = useMemo(
    () => ({
      visible: filteredRows.length,
      total: employees.length,
    }),
    [filteredRows],
  );

  const isPayrollLoading = !error && !hasLoadedPayrollData;

  useEffect(() => {
    if (!isPayrollLoading && filteredRows.length > 0 && listRef.current) {
      window.requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    }
  }, [isPayrollLoading, filteredRows.length]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0">
        <AppHeader title="Nómina" showBack hrefBack="/home" rightContent={<HeaderCalendar periods={periods} selectedId={selectedPeriodId} onChange={setSelectedPeriodId} onCreateOrSelect={handleCreateOrSelectPeriod} />} />
      </div>

      <main className="min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(380px,520px)_minmax(360px,1fr)]">
        <section className="flex flex-col h-full min-h-0 px-4 pt-4 lg:pb-0">
          <div className="mx-auto flex w-full max-w-3xl flex-col min-h-0 h-full">
            <div className="shrink-0">
              {isPayrollLoading ? (
                <section className="rounded-[28px] bg-white p-5 shadow-sm">
                  <div className="h-5 w-36 rounded-full bg-slate-100" />
                  <div className="mt-6 h-9 w-48 rounded-full bg-slate-100" />
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="h-20 rounded-2xl bg-slate-100" />
                    <div className="h-20 rounded-2xl bg-slate-100" />
                  </div>
                </section>
              ) : (
                <SummaryCard period={selectedPeriod} totalCost={totals.cost} totalNet={totals.net} />
              )}

              <div className="mb-3 mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-medium text-slate-900">Planilla de pagos</h2>
                    <p className="text-xs text-slate-500">{filteredRows.length} empleados activos</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: "post-period" })}
                    disabled={!canLiquidatePayroll}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed",
                      periodAlreadyPosted
                        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                        : "border-emerald-100 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-400",
                    )}
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    {periodAlreadyPosted ? "Pagada" : "Pagar nomina"}
                  </button>
                </div>
              </div>
            </div>

            {isPayrollLoading && (
              <div className="py-16 text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400 shrink-0">
                Cargando nomina...
              </div>
            )}

            {!isPayrollLoading && error && (
              <div className="rounded-3xl bg-white p-5 text-center shadow-sm shrink-0">
                <AlertCircle className="mx-auto h-7 w-7 text-rose-400" />
                <p className="mt-2 text-sm font-medium text-slate-800">{error}</p>
              </div>
            )}

            {!isPayrollLoading && !error && filteredRows.length === 0 && (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm shrink-0">
                <Wallet className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No hay empleados activos</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Abre las acciones con el boton + para crear un empleado o contrato.
                </p>
              </div>
            )}

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto space-y-2.5 px-1 -mx-1 pb-44 lg:pb-[150px]">
              {!isPayrollLoading &&
                !error &&
                filteredRows.map((row) => {
                  if (!row.run) {
                    return (
                      <EmployeeStandaloneCard
                        key={row.key}
                        employee={row.employee}
                        contract={row.contract}
                        selectedPeriod={selectedPeriod}
                        complementaryAvailable={Boolean(
                          row.contract &&
                          (selectedPeriod?.status === "POSTED" || selectedPeriod?.status === "CLOSED")
                        )}
                        onComplementaryRun={(employee) => setConfirmAction({ type: "complementary-run", employee })}
                      />
                    );
                  }

                  const run = row.run;
                  return (
                    <EmployeeCarousel
                      key={row.key}
                      run={run}
                      settlement={settlements[run.employeeId] ?? settlementPreviewByContract[run.contractId]}
                      expanded={expandedRunId === run.id}
                      selected={selectedRun?.id === run.id}
                      onSelect={() => setSelectedRunId(run.id)}
                      onToggleExpanded={() => {
                        setSelectedRunId(run.id);
                        setExpandedRunId((current) => (current === run.id ? null : run.id));
                      }}
                      onTogglePayment={togglePayment}
                      selectedPeriod={selectedPeriod}
                      visualPaid={visualPaidRuns[run.id]}
                      onToggleVisualPaid={handleToggleVisualPayment}
                      onLiquidateContract={handleLiquidateContractPrompt}
                      contractLiquidated={Boolean(settlements[run.employeeId] && !settlements[run.employeeId].preview)}
                      settlementPosting={postingSettlementContractId === run.contractId}
                      onOpenEditor={(selectedRun) => {
                        setSelectedRunId(selectedRun.id);
                        setEditorRun(selectedRun);
                        setEditorSheetOpen(true);
                      }}
                    />
                  );
                })}
            </div>
          </div>
        </section>

        <DetailPanel
          run={!isPayrollLoading ? selectedRun : undefined}
          settlement={!isPayrollLoading && selectedRun ? (settlements[selectedRun.employeeId] ?? settlementPreviewByContract[selectedRun.contractId]) : undefined}
          onTogglePayment={togglePayment}
          selectedPeriod={selectedPeriod}
          onLiquidateContract={handleLiquidateContractPrompt}
          contractLiquidated={!isPayrollLoading && selectedRun ? Boolean(settlements[selectedRun.employeeId] && !settlements[selectedRun.employeeId].preview) : false}
          settlementPosting={!isPayrollLoading && selectedRun ? postingSettlementContractId === selectedRun.contractId : false}
        />
      </main>

      <PayrollChatActionBar
        searchValue={search}
        onSearchChange={setSearch}
        onCreateEmployee={handleCreateFromChat}
      />

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-white shadow-2xl">
          <Sparkles className="h-3.5 w-3.5 text-[#0fb18f]" />
          {notice}
        </div>
      )}

      <PayrollNewsSheet
        open={newsSheetOpen}
        onClose={() => {
          setNewsSheetOpen(false);
          setNewsRun(null);
          setNewsEmployee(null);
          setNewsContract(null);
        }}
        run={newsRun}
        employee={newsEmployee}
        contract={newsContract}
        selectedPeriod={selectedPeriod}
        onPreview={handlePayrollPreview}
        onSettlementPreview={handleSettlementPreview}
        onFinished={(periodId) => {
          loadEmployees();
          loadPeriods();
          setSelectedPeriodId(periodId);
          setPeriodRefreshKey((value) => value + 1);
        }}
      />
      <EmployeePayrollEditorSheet
        open={editorSheetOpen}
        onClose={() => {
          setEditorSheetOpen(false);
          setEditorRun(null);
        }}
        run={editorRun}
        arlRisks={arlRisks}
        selectedPeriod={selectedPeriod}
        onChanged={() => {
          loadEmployees();
          loadPeriods();
        }}
        onCreateContract={(employee) => {
          setQuickInitialEmployee(employee);
          setQuickSheetMode("createContractForEmployee");
        }}
        onInactivateContract={handleInactivateContract}
        onInactivateEmployee={handleInactivateEmployee}
        onHardDeleteEmployee={handleHardDeleteEmployee}
      />
      <PayrollQuickEmployeeSheet
        open={quickSheetMode !== null}
        mode={quickSheetMode}
        initialEmployee={quickInitialEmployee}
        employees={employees}
        arlRisks={arlRisks}
        selectedPeriod={selectedPeriod}
        onClose={() => {
          setQuickSheetMode(null);
          setQuickInitialEmployee(null);
        }}
        onChanged={() => {
          loadEmployees();
          loadPeriods();
          setPeriodRefreshKey((value) => value + 1);
        }}
      />
      <EmployeeFormSheet
        open={employeeSheetOpen}
        onClose={() => {
          setEmployeeSheetOpen(false);
          setEmployeeToEdit(null);
        }}
        employee={employeeToEdit}
        onChanged={loadEmployees}
      />

      <SettlementSimulationSheet
        open={settlementSheetOpen}
        onClose={() => setSettlementSheetOpen(false)}
        employees={employees}
        selectedPeriod={selectedPeriod}
        onFinished={handleSettlementPreview}
      />
      <PayrollConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === "visual-payment"
            ? (confirmAction.paid ? "Marcar esta nomina como pagada?" : "Marcar esta nomina como pendiente?")
            : confirmAction?.type === "post-period"
              ? "Pagar la nomina mensual de este periodo?"
              : confirmAction?.type === "complementary-run"
                ? "¿Pagar nómina complementaria?"
                : "Pagar este contrato?"
        }
        description={
          confirmAction?.type === "visual-payment"
            ? (confirmAction.paid
              ? "Esta accion solo cambia el estado visual de pago. No crea asientos ni pagos de prestaciones."
              : "Esta accion solo devuelve el estado visual a pendiente. No modifica contabilidad.")
            : confirmAction?.type === "post-period"
              ? "Esta accion generara la liquidacion del periodo y los asientos contables correspondientes. No uses este boton si solo quieres marcar el pago como realizado."
              : confirmAction?.type === "complementary-run"
                ? "Se generará una liquidación adicional solo para este empleado y se registrará un asiento contable independiente. No se modificará la nómina original del período."
                : "Esta accion registrara la liquidacion del contrato y generara los asientos contables correspondientes. La estimacion contempla unicamente prestaciones causadas desde el ultimo corte anual."
        }
        confirmLabel={
          confirmAction?.type === "visual-payment"
            ? (confirmAction.paid ? "Marcar pagada" : "Marcar pendiente")
            : confirmAction?.type === "post-period"
              ? "Confirmar liquidacion"
              : confirmAction?.type === "complementary-run"
                ? "Confirmar"
                : "Confirmar liquidacion"
        }
        intent={
          confirmAction?.type === "visual-payment"
            ? "visual"
            : confirmAction?.type === "post-period"
              ? "payroll"
              : confirmAction?.type === "complementary-run"
                ? "payroll"
                : "settlement"
        }
        loading={confirmLoading}
        onConfirm={handleConfirmAction}
        onCancel={() => !confirmLoading && setConfirmAction(null)}
      />
    </div>
  );
}



