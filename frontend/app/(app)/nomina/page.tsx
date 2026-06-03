"use client";

import { type InputHTMLAttributes, type ReactNode, useCallback, useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
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

const overtimeInputs: Array<{ type: OvertimeType; label: string; hint: string }> = [
  { type: "OVERTIME_DAY", label: "Extra diurna", hint: "+25%" },
  { type: "OVERTIME_NIGHT", label: "Extra nocturna", hint: "+75%" },
  { type: "NIGHT_SURCHARGE", label: "Recargo nocturno", hint: "+35%" },
  { type: "SUNDAY_HOLIDAY_EXTRA_DAY", label: "Extra dom/festiva diurna", hint: "+100%" },
  { type: "SUNDAY_HOLIDAY_EXTRA_NIGHT", label: "Extra dom/festiva nocturna", hint: "+150%" },
  { type: "SUNDAY_HOLIDAY_DAY", label: "Recargo dominical/festivo", hint: "+75%" },
];

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
            <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
            <p className={cn("mt-0.5 text-[10px] font-bold uppercase tracking-widest", accent)}>
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
      <span className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
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
        "h-10 rounded-xl px-3 text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
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

function shortMoney(value: MoneyLike) {
  const n = toNumber(value);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return money(n);
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



function SummaryCard({
  period,
  totalCost,
  totalNet,
  onPost,
}: {
  period?: PayrollPeriod;
  totalCost: number;
  totalNet: number;
  onPost?: () => void;
}) {
  const diff = totalCost - totalNet;
  const percent = totalNet > 0 ? (diff / totalNet) * 100 : 0;

  let statusText = "Sin periodo";
  if (period?.status === "POSTED") statusText = "Liquidado";
  else if (period?.status === "CALCULATED") statusText = "Sin liquidar";
  else if (period?.status === "OPEN") statusText = "Abierto";
  else if (period?.status === "CLOSED") statusText = "Cerrado";

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#0fb18f] bg-[linear-gradient(135deg,#0fb18f_0%,#26c7a6_48%,#80dcc7_100%)] p-5 text-white shadow-[0_18px_42px_rgba(15,177,143,0.28)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {period ? `${monthNames[period.month - 1]} ${period.year}` : "Nómina"}
          </h1>
        </div>
        <span className="rounded-full bg-white/18 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
          {statusText}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/78">Costo laboral real</p>
          <p className="text-3xl font-bold tabular-nums">{money(totalCost)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/14 p-3 backdrop-blur">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/78">Neto a pagar</p>
            <p className="text-lg font-bold tabular-nums">{money(totalNet)}</p>
          </div>
          <div className="rounded-2xl bg-white/14 p-3 backdrop-blur">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/78">Deducciones, cargas y provisiones</p>
            <div className="flex flex-col gap-1">
              <p className="text-lg font-bold tabular-nums">{money(diff)}</p>
              <span className="self-start rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white">
                {percent.toFixed(1)}% sobre neto
              </span>
            </div>
          </div>
        </div>

        {period?.status === "CALCULATED" && onPost && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <button
              type="button"
              onClick={onPost}
              className="w-full rounded-2xl border border-white/20 bg-white/18 py-3 text-sm font-medium text-white transition hover:bg-white/30 active:scale-[0.98]"
            >
              Liquidar nómina mensual
            </button>
          </div>
        )}
      </div>
    </section>
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
  const selectedPeriod = periods.find(p => p.id === selectedId);
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
              const periodExists = periods.find(p => p.year === viewYear && p.month === month);
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
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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

  // Tab 1: Horas/Ajustes State
  const [workedDays, setWorkedDays] = useState("30");
  const [commissions, setCommissions] = useState("0");
  const [nonSalaryBonus, setNonSalaryBonus] = useState("0");
  const [loans, setLoans] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [simulatedEndDate, setSimulatedEndDate] = useState("");
  const [preview, setPreview] = useState<PayrollRun | null>(null);
  const [settlementPreview, setSettlementPreview] = useState<Settlement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [overtimeHours, setOvertimeHours] = useState<Record<OvertimeType, string>>({
    OVERTIME_DAY: "0",
    OVERTIME_NIGHT: "0",
    NIGHT_SURCHARGE: "0",
    SUNDAY_HOLIDAY_EXTRA_DAY: "0",
    SUNDAY_HOLIDAY_EXTRA_NIGHT: "0",
    SUNDAY_HOLIDAY_DAY: "0",
  });

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
  const [fullName, setFullName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  useEffect(() => {
    if (!open || !run) return;
    setError(null);
    setActiveTab("horas");

    // Initialize Tab 1 (Novedades)
    setWorkedDays(String(run.usedParameters?.workedDays ?? "30"));
    setCommissions(String(run.commissions ?? "0"));
    setNonSalaryBonus(String(run.nonSalaryBonus ?? "0"));
    
    const totalDeductions = numberValue(run.otherDeductions);
    setLoans("0");
    setOtherDeductions(String(totalDeductions));
    
    setSimulatedEndDate(settlementDefaultEndDate(run.contract, selectedPeriod));
    setPreview(run.preview ? run : null);
    setSettlementPreview(null);
    
    const defaultOvertime: Record<OvertimeType, string> = {
      OVERTIME_DAY: "0",
      OVERTIME_NIGHT: "0",
      NIGHT_SURCHARGE: "0",
      SUNDAY_HOLIDAY_EXTRA_DAY: "0",
      SUNDAY_HOLIDAY_EXTRA_NIGHT: "0",
      SUNDAY_HOLIDAY_DAY: "0",
    };
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
    setFullName(employeeName(run.employee));
    setDocumentNumber(run.employee.documentNumber ?? "");
    setPosition(run.employee.position ?? "");
    setEmail(run.employee.email ?? "");
    setPhone(run.employee.phone ?? "");
    setActive(run.employee.isActive === false ? "INACTIVE" : "ACTIVE");
  }, [open, run, selectedPeriod, todayIso]);

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
      otherDeductions: numberValue(loans) + numberValue(otherDeductions),
      overtimeHours: overtimePayload.length ? overtimePayload : undefined,
    };
  }, [workedDays, commissions, nonSalaryBonus, loans, otherDeductions, overtimeHours]);

  // Preview effect for Tab 1
  useEffect(() => {
    if (!open || !run || activeTab !== "horas" || !selectedPeriod) return;
    const payload = buildPayload();
    if (!payload) return;

    let alive = true;
    const timer = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const [payrollPreview, settlementResult] = await Promise.all([
          payrollApi.previewEmployee(selectedPeriod.id, run.employeeId, payload),
          run.contract?.id
            ? payrollApi.simulateSettlement(
                run.contract.id,
                {
                  ...(simulatedEndDate ? { endDate: simulatedEndDate } : {}),
                  calculationYear: selectedPeriod.year,
                },
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!alive) return;
        setPreview(payrollPreview);
        if (settlementResult) {
          setSettlementPreview(settlementResult);
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
  }, [open, run, activeTab, selectedPeriod, buildPayload, simulatedEndDate]);

  if (!open || !run) return null;

  const editable = isPeriodEditable(selectedPeriod);

  const totalOvertimeHours = overtimeInputs.reduce(
    (sum, item) => sum + numberValue(overtimeHours[item.type]),
    0,
  );

  const saveNews = async () => {
    if (!selectedPeriod) return setError("Selecciona un periodo.");
    if (!editable) return setError("Este período ya está posteado.");
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
      setError(err instanceof AppApiError ? err.message : "No se pudieron guardar las novedades.");
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
        paymentCycle,
        arlRiskClassId,
      };
      await payrollApi.updateContract(run.contractId, payload);
      toast.success("Contrato actualizado");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo guardar el contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  const saveEmployee = async () => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") || parts[0] || "";
    if (!fullName.trim()) return setError("El nombre completo es obligatorio.");
    if (!documentNumber.trim()) return setError("El documento es obligatorio.");
    setSubmitting(true);
    try {
      const payload = {
        firstName,
        lastName,
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
      <div className="fixed bottom-0 left-0 right-0 z-[70] mx-auto max-w-3xl rounded-t-[28px] bg-white p-5 shadow-2xl transition-transform animate-in slide-in-from-bottom max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{employeeName(run.employee)}</h2>
            <p className="text-xs font-medium text-slate-500">
              {run.employee.documentNumber ?? "Sin doc."} • {employeeRole(run.employee, run.contract)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab("horas")}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors", activeTab === "horas" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Horas/Ajustes
          </button>
          <button
            onClick={() => setActiveTab("contrato")}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors", activeTab === "contrato" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Contrato
          </button>
          <button
            onClick={() => setActiveTab("empleado")}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors", activeTab === "empleado" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Empleado
          </button>
        </div>

        {/* Form Body */}
        <div className="min-h-[200px] pb-6 space-y-4">
          {activeTab === "horas" && (
            <div className="space-y-3">
              {!editable && (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                  Este período ya está posteado. No se pueden modificar novedades.
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
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Trabajo suplementario</span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-500">{totalOvertimeHours} h</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {overtimeInputs.map((item) => (
                    <label key={item.type} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-2">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] font-bold text-neutral-700">{item.label}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#0fb18f]">{item.hint}</span>
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

              {/* Calculations previews */}
              {preview && (
                <div className="rounded-[24px] border border-emerald-100 bg-white p-4 shadow-sm">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-emerald-600">Vista previa de nomina</span>
                  <div className="space-y-1.5">
                    <MoneyLine label="Devengados" value={preview.grossIncome} color="text-slate-600" />
                    <MoneyLine label="Deducciones" value={preview.totalEmployeeDeductions} color="text-rose-500" sign="-" />
                    <MoneyLine label="Prestaciones" value={preview.totalBenefits} color="text-violet-600" />
                    <MoneyLine label="Neto" value={preview.netPay} color="text-slate-900" medium />
                    <MoneyLine label="Costo empresa" value={preview.realEmployerCost} color="text-[#0fb18f]" medium />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "contrato" && (
            <div className="space-y-3">
              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo contrato</span>
                <div className="grid grid-cols-3 gap-2">
                  <SegmentedOption value="INDEFINITE" current={contractType} onChange={setContractType}>Indefinido</SegmentedOption>
                  <SegmentedOption value="FIXED_TERM" current={contractType} onChange={setContractType}>Fijo</SegmentedOption>
                  <button type="button" disabled className="h-10 rounded-xl border border-neutral-200 bg-neutral-50 px-2 text-xs font-bold text-neutral-400">
                    Obra labor
                  </button>
                </div>
              </div>

              <FieldBlock label="Salario mensual">
                <BigInput value={salaryMonthly} onChange={(event) => setSalaryMonthly(event.target.value)} placeholder="3000000" type="number" />
              </FieldBlock>

              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">ARL</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((level) => {
                    const risk = arlRisks.find((item) => item.level === level);
                    const selected = arlRiskClassId === risk?.id;
                    return (
                      <button
                        key={level}
                        type="button"
                        disabled={!risk}
                        onClick={() => risk && setArlRiskClassId(risk.id)}
                        className={cn(
                          "h-10 rounded-xl text-[11px] font-bold transition disabled:opacity-40",
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
                <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Ciclo de pago</span>
                <div className="grid grid-cols-2 gap-2">
                  <SegmentedOption value="MONTHLY" current={paymentCycle} onChange={setPaymentCycle}>Mensual</SegmentedOption>
                  <SegmentedOption value="BIWEEKLY" current={paymentCycle} onChange={setPaymentCycle}>Quincenal</SegmentedOption>
                </div>
              </div>

              <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
                <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Configuracion adicional</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setIsRemote((value) => !value)} className={cn("h-11 rounded-xl text-xs font-bold", isRemote ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
                    Trabajo remoto
                  </button>
                  <button type="button" onClick={() => setApplyLaw1819((value) => !value)} className={cn("h-11 rounded-xl text-xs font-bold", applyLaw1819 ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
                    Exonerado Ley 1819
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FieldBlock label="Fecha ingreso">
                  <BigInput value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
                </FieldBlock>
                <FieldBlock label="Fecha salida">
                  <BigInput value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" />
                </FieldBlock>
              </div>

              {/* Secondary Actions */}
              <div className="flex gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => { onClose(); onCreateContract?.(run.employee); }}
                  className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-100"
                >
                  Nuevo contrato
                </button>
                <button
                  type="button"
                  disabled={!run.contract || run.contract.isActive === false}
                  onClick={() => { onClose(); if (run.contract) onInactivateContract?.(run.contract); }}
                  className="flex-1 rounded-xl border border-amber-200 bg-amber-50/50 py-2.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  Inactivar contrato
                </button>
              </div>
            </div>
          )}

          {activeTab === "empleado" && (
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

              {/* Secondary Actions */}
              <div className="flex gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => { onClose(); onInactivateEmployee?.(run.employee); }}
                  className="flex-1 rounded-xl border border-orange-200 bg-orange-50/50 py-2.5 text-xs font-bold text-orange-700 transition hover:bg-orange-100"
                >
                  Inactivar empleado
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); onHardDeleteEmployee?.(run.employee); }}
                  className="flex-1 rounded-xl border border-rose-200 bg-rose-50/50 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                >
                  Eliminar empleado
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mb-4 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}

        {/* Footer */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-2xl bg-neutral-100 text-sm font-bold text-neutral-600 hover:bg-neutral-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-bold text-white shadow-lg shadow-emerald-100 hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Guardando..." : "Guardar"}
          </button>
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
  benefitPayments = [],
  onRegisterPrima,
  onOpenEditor,
}: {
  run: PayrollRun;
  expanded: boolean;
  onToggleExpanded: () => void;
  onTogglePayment: (payment: PayrollPayment) => void;
  selectedPeriod?: PayrollPeriod;
  benefitPayments?: PayrollBenefitPayment[];
  onRegisterPrima?: (run: PayrollRun, amount: number) => void;
  onOpenEditor?: (run: PayrollRun) => void;
}) {
  const extras = [
    { label: "Horas extras", value: run.overtimeAmount },
    { label: "Comisiones", value: run.commissions },
    { label: "Bonificaciones", value: run.nonSalaryBonus },
  ].filter((item) => toNumber(item.value) > 0);
  const deductions =
    toNumber(run.employeeHealth) +
    toNumber(run.employeePension) +
    toNumber(run.solidarityFund) +
    toNumber(run.withholdingTax);

  const longPress = useLongPress({
    onLongPress: () => onOpenEditor?.(run),
    delay: 600,
  });

  const isBiweekly = run.contract?.paymentCycle === "BIWEEKLY";
  const payments = run.payments ?? [];
  const salaryPayments = payments
    .filter((payment) => payment.type === "SALARY_PAYMENT")
    .sort((a, b) => (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1));
  const allPaid = salaryPayments.length > 0 && salaryPayments.every((payment) => payment.status === "PAID");
  const canCalculateNews = run.contract?.isActive !== false && !run.contract?.endDate;

  const isPrimaMonth = selectedPeriod?.month === 6 || selectedPeriod?.month === 12;
  const primaAmount = toNumber(run.serviceBonusPreview);
  const isPrimaPaid = benefitPayments.some((bp) => bp.type === "PRIMA" && bp.status === "PAID");
  const hasPrima = isPrimaMonth && primaAmount > 0;

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
            <p className="truncate text-[15px] font-bold text-slate-900">{employeeName(run.employee)}</p>
            <p className="mt-0.5 text-[12px] font-medium uppercase text-slate-500">{employeeRole(run.employee, run.contract)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{run.employee.documentNumber ?? "Sin documento"}</p>
          </div>
          <div className="text-right">
            <p className="text-[16px] font-bold tabular-nums text-[#0fb18f]">{money(run.netPay)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transferencia neta</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Devengado mensual</p>
          <MoneyLine label="Sueldo básico" value={run.salaryEarned} color="text-slate-800" valueColor="text-slate-900" medium />
          
          {extras.length > 0 && (
            <div className="my-2 ml-4 space-y-1.5 rounded-2xl bg-[#c3975c]/10 px-3 py-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#ba965e]">Desglose de extras</p>
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
            label="Auxilio transporte"
            value={run.transportAllowance}
            color="text-[#43856f]"
            valueColor="text-[#43856f]"
            sign="+"
          />
          <MoneyLine
            label="Deducciones salud/pensión"
            value={deductions}
            color="text-[#e5a5ba]"
            valueColor="text-[#d985a1]"
            sign="-"
          />

          {hasPrima && (
            <>
              <div className="border-t border-slate-100 my-2 pt-2" />
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Prima de servicios</p>
                  <p className="text-[11px] text-slate-400">
                    {selectedPeriod?.month === 6 ? "1 ene – 30 jun · Pago en junio" : "1 jul – 31 dic · Pago en diciembre"}
                  </p>
                </div>
                <p className="text-[13px] font-bold text-amber-600">{money(primaAmount)}</p>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Costo real empresa</p>
            <p className="text-[15px] font-bold tabular-nums text-slate-800">{money(run.realEmployerCost)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
            {hasPrima && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isPrimaPaid && onRegisterPrima) {
                    onRegisterPrima(run, primaAmount);
                  }
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  isPrimaPaid 
                    ? "bg-emerald-50 text-emerald-700" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer"
                )}
              >
                {isPrimaPaid ? "Pagado" : "Pendiente"}
              </span>
            )}
          </div>
        </div>

        <div className={cn("grid transition-all duration-300", expanded ? "grid-rows-[1fr] pt-4 opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="min-h-0 overflow-hidden space-y-3">
            {salaryPayments.length > 0 && (
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Detalle de pagos</p>
                <div className="space-y-1.5">
                  {salaryPayments.map((payment, index) => (
                    <button
                      key={payment.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePayment(payment);
                      }}
                      className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left shadow-sm border border-slate-100 hover:border-slate-200 transition"
                    >
                      <div>
                        <span className="block text-[11px] font-semibold text-slate-700">
                          {isBiweekly ? `Quincena ${payment.installmentNumber ?? index + 1}` : "Mensualidad"}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-slate-400">
                          {payment.status === "PAID" ? "Pagado" : "Pendiente"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-bold text-slate-900">{money(payment.amount)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
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
    : (totalWorkedDays / 20);
  const formattedVacationDays = (Math.floor(rawVacDays * 2) / 2).toString().replace(".", ",");

  let hourlyRateVal = toNumber(settlement.hourlyRate ?? params.hourlyRate);
  if (hourlyRateVal === 0) {
    const salary = toNumber(params.salaryMonthly ?? params.contract?.salaryMonthly);
    if (salary > 0) {
      hourlyRateVal = salary / 240;
    }
  }

  const formattedHourlyRate = hourlyRateVal > 0 
    ? hourlyRateVal.toFixed(1).split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (hourlyRateVal.toFixed(1).split(".")[1] || "0")
    : "0,0";

  return (
    <article className="min-w-full snap-start rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <h3 className="text-sm font-bold text-slate-900 mb-4">Liquidación año vigente</h3>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha corte inicial</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{startDateStr}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha liquidación</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{endDateStr}</p>
        </div>
      </div>

      <div className="border-b border-slate-100 pb-3 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Días causados</p>
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
        <span className="text-[13px] font-bold text-slate-800">Total</span>
        <span className="text-base font-bold text-violet-700">{money(calculatedTotal)}</span>
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

function SettlementPanel({ settlement }: { settlement?: Settlement }) {
  const [showInfo, setShowInfo] = useState(false);

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
  const formattedVacationDays = (Math.floor(rawVacDays * 2) / 2).toString().replace(".", ",");

  let hourlyRateVal = toNumber(settlement.hourlyRate ?? params.hourlyRate);
  if (hourlyRateVal === 0) {
    const salary = toNumber(params.salaryMonthly ?? params.contractSnapshot?.salaryMonthly);
    if (salary > 0) hourlyRateVal = salary / 240;
  }
  const formattedHourlyRate = hourlyRateVal > 0
    ? hourlyRateVal.toFixed(1).split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (hourlyRateVal.toFixed(1).split(".")[1] || "0")
    : "0,0";

  return (
    <article className="min-w-full snap-start rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <div className="relative mb-4 flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900">Liquidacion año vigente</h3>
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
            Esta estimacion contempla unicamente prestaciones causadas desde el ultimo corte anual. No incluye historicos de anos anteriores. El calculo usa año laboral de 360 dias: meses de 30 dias.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha de ingreso</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{startDateStr}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {hasMvpCutoff ? "Fecha salida solicitada" : "Fecha de salida"}
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{requestedEndDateStr}</p>
        </div>
      </div>

      {hasMvpCutoff && (
        <div className="border-b border-slate-100 pb-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Corte calculado hasta</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{effectiveEndDateStr}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dias laborados semestre I</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{semester1Days}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dias laborados semestre II</p>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{semester2Days}</p>
        </div>
      </div>

      <div className="space-y-2 pb-3 mb-3 border-b border-slate-100">
        <MoneyLine label="Cesantias" value={settlement.severance} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Intereses cesantias" value={settlement.severanceInterest} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Prima de servicios I" value={serviceBonusSemester1} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Prima de servicios II" value={serviceBonusSemester2} color="text-slate-600" valueColor="text-slate-800" />
        <MoneyLine label="Vacaciones" value={settlement.vacation} color="text-slate-600" valueColor="text-slate-800" />
      </div>

      <div className="flex justify-between items-center mb-4 pt-1">
        <span className="text-[13px] font-bold text-slate-800">Total</span>
        <span className="text-base font-bold text-violet-700">{money(backendTotal)}</span>
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
  benefitPayments = [],
  onRegisterPrima,
  onOpenEditor,
}: {
  run: PayrollRun;
  settlement?: Settlement;
  expanded: boolean;
  onToggleExpanded: () => void;
  onTogglePayment: (payment: PayrollPayment) => void;
  selected?: boolean;
  onSelect?: () => void;
  selectedPeriod?: PayrollPeriod;
  benefitPayments?: PayrollBenefitPayment[];
  onRegisterPrima?: (run: PayrollRun, amount: number) => void;
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
          benefitPayments={benefitPayments}
          onRegisterPrima={onRegisterPrima}
          onOpenEditor={onOpenEditor}
        />
        <SettlementPanel settlement={settlement} />
      </div>
    </div>
  );
}

function EmployeeStandaloneCard({
  employee,
  contract,
  selectedPeriod,
  onEditEmployee,
  onEditContract,
  onOpenNews,
  onInactivateContract,
  onInactivateEmployee,
  onHardDeleteEmployee,
}: {
  employee: Employee;
  contract?: Contract | null;
  selectedPeriod?: PayrollPeriod;
  onEditEmployee: (employee: Employee) => void;
  onEditContract: (employee: Employee, contract?: Contract | null) => void;
  onOpenNews: (employee: Employee, contract?: Contract | null) => void;
  onInactivateContract?: (contract: Contract) => void;
  onInactivateEmployee?: (employee: Employee) => void;
  onHardDeleteEmployee?: (employee: Employee) => void;
}) {
  const hasContract = Boolean(contract);
  const isBiweekly = contract?.paymentCycle === "BIWEEKLY";
  const canCalculateNews = contract?.isActive !== false && !contract?.endDate;

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
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Activo
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                hasContract ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
              )}
            >
              {hasContract ? "Contrato activo" : "Sin contrato"}
            </span>
            {hasContract && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {isBiweekly ? "Quincenal" : "Mensual"}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          {hasContract ? (
            <>
              <p className="text-[15px] font-medium tabular-nums text-[#0fb18f]">{money(contract?.salaryMonthly)}</p>
              <p className="text-[11px] text-slate-400">{selectedPeriod ? `${monthNames[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "Periodo"}</p>
            </>
          ) : (
            <p className="max-w-[90px] text-[11px] font-medium leading-snug text-amber-600">Crear contrato para calcular nomina</p>
          )}
        </div>
      </div>

      <p className="mb-3 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
        {hasContract ? "Sin nomina calculada en este periodo" : "Empleado activo visible sin contrato activo"}
      </p>

      <div className={cn("grid gap-1.5 border-t border-slate-100 pt-3", hasContract ? "grid-cols-4" : "grid-cols-2")}>
        <button type="button" onClick={() => onEditEmployee(employee)} className="rounded-xl bg-slate-50 px-2 py-2 text-[10px] font-bold text-slate-600">
          Editar
        </button>
        <button type="button" onClick={() => onEditContract(employee, contract)} className="rounded-xl bg-blue-50 px-2 py-2 text-[10px] font-bold text-blue-700">
          {hasContract ? "Contrato" : "Crear contrato"}
        </button>
        {hasContract && (
          <>
            <button type="button" disabled={!canCalculateNews} onClick={() => canCalculateNews && onOpenNews(employee, contract)} className="rounded-xl bg-emerald-50 px-2 py-2 text-[10px] font-bold text-emerald-700 disabled:text-emerald-300">
              Novedades
            </button>
            <button type="button" className="rounded-xl bg-violet-50 px-2 py-2 text-[10px] font-bold text-violet-300" disabled>
              Liquidar
            </button>
          </>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {contract && (
          <button type="button" disabled={contract.isActive === false} onClick={() => onInactivateContract?.(contract)} className="rounded-xl bg-amber-50 px-2 py-2 text-[10px] font-bold text-amber-700 disabled:text-amber-300">
            Inactivar contrato
          </button>
        )}
        <button type="button" onClick={() => onInactivateEmployee?.(employee)} className="rounded-xl bg-orange-50 px-2 py-2 text-[10px] font-bold text-orange-700">
          Inactivar emp.
        </button>
        <button type="button" onClick={() => onHardDeleteEmployee?.(employee)} className="rounded-xl bg-rose-50 px-2 py-2 text-[10px] font-bold text-rose-700">
          Eliminar
        </button>
      </div>
    </article>
  );
}

function DetailPanel({
  run,
  settlement,
}: {
  run?: PayrollRun;
  settlement?: Settlement;
  onTogglePayment: (payment: PayrollPayment) => void;
  selectedPeriod?: PayrollPeriod;
  benefitPayments?: PayrollBenefitPayment[];
  onRegisterPrima?: (run: PayrollRun, amount: number) => void;
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
      <SettlementPanel settlement={settlement} />
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
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-neutral-100 text-sm font-bold text-neutral-600">
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={submitting} className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-bold text-white shadow-lg shadow-emerald-100 disabled:opacity-60">
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
              <span className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</span>
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
        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}
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

function ContractFormSheet({
  open,
  onClose,
  employees,
  arlRisks,
  initialEmployee,
  contract,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  arlRisks: ArlRiskClass[];
  initialEmployee?: Employee | null;
  contract?: Contract | null;
  onChanged: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState("");
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

  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployee?.id ?? contract?.employeeId ?? "");
    setSalaryMonthly(String(contract?.salaryMonthly ?? ""));
    setStartDate(contract?.startDate?.slice(0, 10) ?? todayIso);
    setEndDate(contract?.endDate?.slice(0, 10) ?? "");
    setContractType((contract?.contractType as "INDEFINITE" | "FIXED_TERM") ?? "INDEFINITE");
    setArlRiskClassId(contract?.arlRiskClassId ?? contract?.arlRiskClass?.id ?? "");
    setApplyLaw1819(contract?.applyLaw1819 ?? true);
    setIsRemote(contract?.isRemote ?? false);
    setPaymentCycle((contract?.paymentCycle as "MONTHLY" | "BIWEEKLY") ?? "MONTHLY");
    setError(null);
  }, [contract, initialEmployee, open, todayIso]);

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
      if (contract) {
        await payrollApi.updateContract(contract.id, payload);
        toast.success("Contrato actualizado");
      } else {
        await payrollApi.createContract(employeeId, payload);
        toast.success("Contrato creado");
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof AppApiError ? err.message : "No se pudo guardar el contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetShell
      open={open}
      title="Contrato Laboral"
      subtitle="Configuracion contractual"
      accent="text-blue-500"
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <button type="button" onClick={save} disabled={submitting} className="h-12 w-full rounded-2xl bg-blue-500 text-sm font-bold text-white shadow-lg shadow-blue-100 disabled:opacity-60">
          {submitting ? "Guardando..." : "Guardar contrato"}
        </button>
      }
    >
      <div className="space-y-3">
        {!initialEmployee && (
          <FieldBlock label="Empleado">
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 outline-none focus:border-blue-300">
              <option value="">Selecciona empleado</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.documentNumber}</option>
              ))}
            </select>
          </FieldBlock>
        )}

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo contrato</span>
          <div className="grid grid-cols-3 gap-2">
            <SegmentedOption value="INDEFINITE" current={contractType} onChange={setContractType}>Indefinido</SegmentedOption>
            <SegmentedOption value="FIXED_TERM" current={contractType} onChange={setContractType}>Fijo</SegmentedOption>
            <button type="button" disabled className="h-10 rounded-xl border border-neutral-200 bg-neutral-50 px-2 text-xs font-bold text-neutral-400">
              Obra labor
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <FieldBlock label="Salario mensual">
            <BigInput value={salaryMonthly} onChange={(event) => setSalaryMonthly(event.target.value)} placeholder="3000000" type="number" />
          </FieldBlock>
        </div>

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">ARL</span>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((level) => {
              const risk = arlRisks.find((item) => item.level === level);
              const selected = arlRiskClassId === risk?.id;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={!risk}
                  onClick={() => risk && setArlRiskClassId(risk.id)}
                  className={cn(
                    "h-10 rounded-xl text-[11px] font-bold transition disabled:opacity-40",
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
          <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Ciclo de pago</span>
          <div className="grid grid-cols-2 gap-2">
            <SegmentedOption value="MONTHLY" current={paymentCycle} onChange={setPaymentCycle}>Mensual</SegmentedOption>
            <SegmentedOption value="BIWEEKLY" current={paymentCycle} onChange={setPaymentCycle}>Quincenal</SegmentedOption>
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <span className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Configuracion adicional</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setIsRemote((value) => !value)} className={cn("h-11 rounded-xl text-xs font-bold", isRemote ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
              Trabajo remoto
            </button>
            <button type="button" onClick={() => setApplyLaw1819((value) => !value)} className={cn("h-11 rounded-xl text-xs font-bold", applyLaw1819 ? "bg-[#0fb18f] text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-700")}>
              Exonerado Ley 1819
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <FieldBlock label="Fecha ingreso">
              <BigInput value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
            </FieldBlock>
            <FieldBlock label="Fecha salida">
              <BigInput value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" />
            </FieldBlock>
          </div>
        </div>

        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}
      </div>
    </SheetShell>
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
  const [overtimeHours, setOvertimeHours] = useState<Record<OvertimeType, string>>({
    OVERTIME_DAY: "0",
    OVERTIME_NIGHT: "0",
    NIGHT_SURCHARGE: "0",
    SUNDAY_HOLIDAY_EXTRA_DAY: "0",
    SUNDAY_HOLIDAY_EXTRA_NIGHT: "0",
    SUNDAY_HOLIDAY_DAY: "0",
  });
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
    setOvertimeHours({
      OVERTIME_DAY: "0",
      OVERTIME_NIGHT: "0",
      NIGHT_SURCHARGE: "0",
      SUNDAY_HOLIDAY_EXTRA_DAY: "0",
      SUNDAY_HOLIDAY_EXTRA_NIGHT: "0",
      SUNDAY_HOLIDAY_DAY: "0",
    });
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
    return data.find(
      (period) =>
        period.paymentCycle === "MONTHLY" &&
        (period.installmentNumber ?? 1) === 1,
    );
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
                  <input value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)} placeholder="Otras deducciones / prestamos" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-300" />
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
  const [overtimeHours, setOvertimeHours] = useState<Record<OvertimeType, string>>({
    OVERTIME_DAY: "0",
    OVERTIME_NIGHT: "0",
    NIGHT_SURCHARGE: "0",
    SUNDAY_HOLIDAY_EXTRA_DAY: "0",
    SUNDAY_HOLIDAY_EXTRA_NIGHT: "0",
    SUNDAY_HOLIDAY_DAY: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWorkedDays("30");
    setCommissions("0");
    setNonSalaryBonus("0");
    setLoans("0");
    setOtherDeductions("0");
    setSimulatedEndDate(settlementDefaultEndDate(contract ?? run?.contract, selectedPeriod));
    setPreview(run?.preview ? run : null);
    setSettlementPreview(null);
    setOvertimeHours({
      OVERTIME_DAY: "0",
      OVERTIME_NIGHT: "0",
      NIGHT_SURCHARGE: "0",
      SUNDAY_HOLIDAY_EXTRA_DAY: "0",
      SUNDAY_HOLIDAY_EXTRA_NIGHT: "0",
      SUNDAY_HOLIDAY_DAY: "0",
    });
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
      otherDeductions: numberValue(loans) + numberValue(otherDeductions),
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
    if (!editable) return setError("Este período ya está posteado. No se pueden modificar novedades.");
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
      setError(err instanceof AppApiError ? err.message : "No se pudieron guardar las novedades.");
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
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-neutral-100 text-sm font-bold text-neutral-600">
            Cancelar
          </button>
          {editable ? (
            <button type="button" onClick={save} disabled={submitting || !employeeId} className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-bold text-white shadow-lg shadow-emerald-100 disabled:opacity-60">
              {submitting ? "Guardando..." : "Guardar novedades"}
            </button>
          ) : (
            <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-[#0fb18f] text-sm font-bold text-white shadow-lg shadow-emerald-100">
              Ver detalle
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {!editable && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            Este período ya está posteado. No se pueden modificar novedades. Vista previa, no modifica el período posteado.
          </p>
        )}
        <div className="rounded-[24px] border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-neutral-900">{sheetEmployee ? employeeName(sheetEmployee) : "Empleado"}</p>
              <p className="text-xs font-medium text-neutral-400">{sheetEmployee?.position ?? "Sin cargo"}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
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
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Trabajo suplementario</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-500">{totalOvertimeHours} h</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {overtimeInputs.map((item) => (
              <label key={item.type} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-bold text-neutral-700">{item.label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#0fb18f]">{item.hint}</span>
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
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Resumen de novedades {previewing ? "calculando..." : ""}
          </span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-emerald-50 p-2">
              <p className="text-[10px] font-bold text-emerald-700">Comisiones</p>
              <p className="text-xs font-bold text-emerald-800">+{money(commissions)}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-2">
              <p className="text-[10px] font-bold text-rose-700">Prestamos</p>
              <p className="text-xs font-bold text-rose-800">-{money(loans)}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-2">
              <p className="text-[10px] font-bold text-blue-700">Extras</p>
              <p className="text-xs font-bold text-blue-800">{totalOvertimeHours} h</p>
            </div>
          </div>
        </div>

        {preview && (
          <div className="rounded-[24px] border border-emerald-100 bg-white p-4 shadow-sm">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-emerald-600">Vista previa de nomina</span>
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

        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}
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
      const calculated = await payrollApi.createSettlement(contractId, {
        endDate,
        ...(selectedPeriod ? { calculationYear: selectedPeriod.year } : {}),
      });
      const posted = await payrollApi.postSettlement(calculated.id);
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
            {confirmingPost ? "Confirmar liquidación definitiva" : "Liquidar contrato"}
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
  const [benefitPayments, setBenefitPayments] = useState<Record<string, PayrollBenefitPayment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employeeSheetOpen, setEmployeeSheetOpen] = useState(false);
  const [contractSheetOpen, setContractSheetOpen] = useState(false);
  const [newsSheetOpen, setNewsSheetOpen] = useState(false);
  const [settlementSheetOpen, setSettlementSheetOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);
  const [contractEmployee, setContractEmployee] = useState<Employee | null>(null);
  const [newsRun, setNewsRun] = useState<PayrollRun | null>(null);
  const [newsEmployee, setNewsEmployee] = useState<Employee | null>(null);
  const [newsContract, setNewsContract] = useState<Contract | null>(null);
  const [editorSheetOpen, setEditorSheetOpen] = useState(false);
  const [editorRun, setEditorRun] = useState<PayrollRun | null>(null);
  const [periodRefreshKey, setPeriodRefreshKey] = useState(0);
  const [simulationByEmployee, setSimulationByEmployee] = useState<Record<string, PayrollRun>>({});
  const [settlementPreviewByContract, setSettlementPreviewByContract] = useState<Record<string, Settlement>>({});

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId),
    [periods, selectedPeriodId],
  );

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await payrollApi.listPeriods();
      setPeriods(data);
      setSelectedPeriodId((current) => {
        if (current) return current;
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const currentPeriod = data.find((p) => p.year === year && p.month === month);
        if (currentPeriod) return currentPeriod.id;
        
        payrollApi.createPeriod({ year, month, paymentCycle: "MONTHLY", installmentNumber: 1 })
          .catch(async (err) => {
            if (err instanceof AppApiError && err.status === 409) {
              const existingPeriods = await payrollApi.findPeriods(year, month);
              const existingPeriod = existingPeriods.find(
                (period) =>
                  period.paymentCycle === "MONTHLY" &&
                  (period.installmentNumber ?? 1) === 1,
              );
              if (existingPeriod) return existingPeriod;
            }
            throw err;
          })
          .then((newPeriod) => {
            if (!newPeriod) return;
            setPeriods((prev) => (
              prev.some((period) => period.id === newPeriod.id)
                ? prev
                : [...prev, newPeriod]
            ));
            setSelectedPeriodId(newPeriod.id);
          })
          .catch(() => {
            // Silently handle fallback error
          });
          
        return data[0]?.id || "";
      });
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar nomina");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
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
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    Promise.all([
      payrollApi.listRuns(selectedPeriodId),
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
        setRuns(runsWithPayments);
        setSelectedRunId((current) => current ?? runData[0]?.id ?? null);

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

        // Load benefit payments for each run's contract
        const benefitListPromises = runData.map(async (run) => {
          try {
            const list = await payrollApi.listBenefitPayments(run.contractId);
            return { contractId: run.contractId, list };
          } catch {
            return { contractId: run.contractId, list: [] };
          }
        });
        const benefitsResult = await Promise.all(benefitListPromises);
        if (!alive) return;
        const benefitsMap = benefitsResult.reduce<Record<string, PayrollBenefitPayment[]>>((acc, item) => {
          acc[item.contractId] = item.list;
          return acc;
        }, {});
        setBenefitPayments(benefitsMap);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError("No se pudo cargar el periodo seleccionado");
      })
      .finally(() => {
        if (alive) setLoading(false);
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
      const preview = !run && activeContract
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
    if (!selectedPeriod) return;
    const missingRows = employees
      .map((employee) => ({
        employee,
        contract: findActiveContract(employee.contracts, selectedPeriod),
        hasRun: runs.some((run) => run.employeeId === employee.id),
      }))
      .filter((row) => row.contract && !row.hasRun && !simulationByEmployee[payrollSimulationKey(row.employee.id, row.contract?.id, selectedPeriod.id)]);

    if (!missingRows.length) return;
    let alive = true;
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
    }, 500);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [employees, runs, selectedPeriod, simulationByEmployee]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employeeRows;
    return employeeRows.filter((row) => {
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
    if (!selectedRun) return;
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
  }, [selectedRun, settlements, settlementPreviewByContract, selectedPeriod]);

  const refreshRunPayments = useCallback(async (runId: string) => {
    const payments = await payrollApi.listRunPayments(runId);
    setRuns((current) =>
      current.map((run) => (run.id === runId ? { ...run, payments } : run)),
    );
  }, []);

  const togglePayment = useCallback(async (payment: PayrollPayment) => {
    try {
      const nextStatus = payment.status === "PAID" ? "PENDING" : "PAID";
      await payrollApi.updatePaymentStatus(payment.id, {
        status: nextStatus,
        paymentMethod: "BANK_TRANSFER",
      });
      await refreshRunPayments(payment.payrollRunId);
      toast.success(nextStatus === "PAID" ? "Pago registrado" : "Pago marcado pendiente");
    } catch (err) {
      setNotice(err instanceof AppApiError ? err.message : "No se pudo actualizar el pago.");
      window.setTimeout(() => setNotice(null), 2800);
    }
  }, [refreshRunPayments]);

  const handleAction = (action: string) => {
    if (action === "employees") {
      setActionsOpen(false);
      setEmployeeToEdit(null);
      setEmployeeSheetOpen(true);
      return;
    }
    if (action === "contracts") {
      setActionsOpen(false);
      setContractToEdit(null);
      setContractEmployee(null);
      setContractSheetOpen(true);
      return;
    }

    setNotice("Accion no disponible en este flujo.");
    window.setTimeout(() => setNotice(null), 2400);
  };

  const handleRegisterPrima = useCallback(async (run: PayrollRun, amount: number) => {
    if (!selectedPeriodId) return;
    if (!amount || amount <= 0) {
      toast.error("Falta el monto de la prima en el desglose. No se puede registrar un pago vacío.");
      return;
    }
    
    const currentBenefits = benefitPayments[run.contractId] ?? [];
    if (currentBenefits.some(bp => bp.type === "PRIMA" && bp.status === "PAID")) {
      toast.error("La prima ya está registrada como pagada.");
      return;
    }

    try {
      const response = await payrollApi.createBenefitPayment(run.contractId, {
        type: "PRIMA",
        amount,
        paidAt: new Date().toISOString().split("T")[0],
        periodId: selectedPeriodId,
        payrollRunId: run.id,
        status: "PAID",
      });

      setBenefitPayments(prev => ({
        ...prev,
        [run.contractId]: [...(prev[run.contractId] ?? []), response]
      }));

      toast.success("Prima registrada como pagada");
    } catch (err) {
      console.error(err);
      const msg = err instanceof AppApiError ? err.message : "No se pudo registrar la prima.";
      toast.error(msg);
    }
  }, [selectedPeriodId, benefitPayments]);

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

  const handleInactivateContract = useCallback(async (contract: Contract) => {
    if (!window.confirm("Inactivar este contrato?")) return;
    try {
      await payrollApi.deleteContract(contract.id);
      toast.success("Contrato inactivado");
      await refreshPeople();
    } catch (err) {
      toast.error(err instanceof AppApiError ? err.message : "No se pudo inactivar el contrato.");
    }
  }, [refreshPeople]);

  const handleInactivateEmployee = useCallback(async (employee: Employee) => {
    if (!window.confirm("Inactivar este empleado?")) return;
    try {
      await payrollApi.deleteEmployee(employee.id);
      toast.success("Empleado inactivado");
      await refreshPeople();
    } catch (err) {
      toast.error(err instanceof AppApiError ? err.message : "No se pudo inactivar el empleado.");
    }
  }, [refreshPeople]);

  const handleHardDeleteEmployee = useCallback(async (employee: Employee) => {
    if (!window.confirm("Eliminar definitivamente este empleado? Solo funciona si no tiene historial.")) return;
    try {
      await payrollApi.hardDeleteEmployee(employee.id);
      toast.success("Empleado eliminado");
      await refreshPeople();
    } catch (err) {
      toast.error(err instanceof AppApiError ? err.message : "No se pudo eliminar definitivamente.");
    }
  }, [refreshPeople]);

  
  const handleCreateOrSelectPeriod = async (year: number, month: number) => {
    try {
      const existingPeriods = await payrollApi.findPeriods(year, month);
      const existingPeriod = existingPeriods.find(
        (period) =>
          period.paymentCycle === "MONTHLY" &&
          (period.installmentNumber ?? 1) === 1,
      );
      if (existingPeriod) {
        setSelectedPeriodId(existingPeriod.id);
        return;
      }
      
      const newPeriod = await payrollApi.createPeriod({ year, month, paymentCycle: "MONTHLY", installmentNumber: 1 }).catch(async (err) => {
        if (err instanceof AppApiError && err.status === 409) {
          const existingPeriods = await payrollApi.findPeriods(year, month);
          const existing = existingPeriods.find(
            (p) =>
              p.paymentCycle === "MONTHLY" &&
              (p.installmentNumber ?? 1) === 1,
          );
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
    try {
      await payrollApi.updatePeriodStatus(selectedPeriodId, "POSTED");
      toast.success("Nomina posteada");
      await loadPeriods();
    } catch (err) {
      setNotice(err instanceof AppApiError ? err.message : "No se pudo postear la nomina.");
      window.setTimeout(() => setNotice(null), 2800);
    }
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#f7f3ed]">
      <div className="shrink-0">
        <AppHeader title="Nómina" showBack hrefBack="/home" rightContent={<HeaderCalendar periods={periods} selectedId={selectedPeriodId} onChange={setSelectedPeriodId} onCreateOrSelect={handleCreateOrSelectPeriod} />} />
      </div>

      <main className="min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(380px,520px)_minmax(360px,1fr)]">
        <section className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-44 lg:pb-[150px]">
          <div className="mx-auto max-w-3xl">
            
            <SummaryCard period={selectedPeriod} totalCost={totals.cost} totalNet={totals.net} onPost={handlePostPeriod} />

            <div className="mb-3 mt-5">
              <div>
                <h2 className="text-base font-medium text-slate-900">Planilla de pagos</h2>
                <p className="text-xs text-slate-500">{filteredRows.length} empleados activos</p>
              </div>
            </div>

            {loading && (
              <div className="py-16 text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Cargando...
              </div>
            )}

            {!loading && error && (
              <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
                <AlertCircle className="mx-auto h-7 w-7 text-rose-400" />
                <p className="mt-2 text-sm font-medium text-slate-800">{error}</p>
              </div>
            )}

            {!loading && !error && filteredRows.length === 0 && (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
                <Wallet className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No hay empleados activos</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Abre las acciones con el boton + para crear un empleado o contrato.
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              {!loading &&
                !error &&
                filteredRows.map((row) => {
                  if (!row.run) {
                    return (
                      <EmployeeStandaloneCard
                        key={row.key}
                        employee={row.employee}
                        contract={row.contract}
                        selectedPeriod={selectedPeriod}
                        onEditEmployee={(employee) => {
                          setEmployeeToEdit(employee);
                          setEmployeeSheetOpen(true);
                        }}
                        onEditContract={(employee, contract) => {
                          setContractEmployee(employee);
                          setContractToEdit(contract ?? null);
                          setContractSheetOpen(true);
                        }}
                        onOpenNews={(employee, contract) => {
                          setNewsRun(null);
                          setNewsEmployee(employee);
                          setNewsContract(contract ?? null);
                          setNewsSheetOpen(true);
                        }}
                        onInactivateContract={handleInactivateContract}
                        onInactivateEmployee={handleInactivateEmployee}
                        onHardDeleteEmployee={handleHardDeleteEmployee}
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
                      benefitPayments={benefitPayments[run.contractId] ?? []}
                      onRegisterPrima={handleRegisterPrima}
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
          run={selectedRun}
          settlement={selectedRun ? (settlements[selectedRun.employeeId] ?? settlementPreviewByContract[selectedRun.contractId]) : undefined}
          onTogglePayment={togglePayment}
          selectedPeriod={selectedPeriod}
          benefitPayments={selectedRun ? (benefitPayments[selectedRun.contractId] ?? []) : []}
          onRegisterPrima={handleRegisterPrima}
        />
      </main>

      <PayrollChatActionBar
        open={actionsOpen}
        searchValue={search}
        onSearchChange={setSearch}
        onToggle={() => setActionsOpen((value) => !value)}
        onAction={handleAction}
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
          setContractEmployee(employee);
          setContractToEdit(null);
          setContractSheetOpen(true);
        }}
        onInactivateContract={handleInactivateContract}
        onInactivateEmployee={handleInactivateEmployee}
        onHardDeleteEmployee={handleHardDeleteEmployee}
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
      <ContractFormSheet
        open={contractSheetOpen}
        onClose={() => {
          setContractSheetOpen(false);
          setContractToEdit(null);
          setContractEmployee(null);
        }}
        employees={employees}
        arlRisks={arlRisks}
        initialEmployee={contractEmployee}
        contract={contractToEdit}
        onChanged={() => {
          loadEmployees();
          loadPeriods();
        }}
      />
      <SettlementSimulationSheet
        open={settlementSheetOpen}
        onClose={() => setSettlementSheetOpen(false)}
        employees={employees}
        selectedPeriod={selectedPeriod}
        onFinished={handleSettlementPreview}
      />
    </div>
  );
}
