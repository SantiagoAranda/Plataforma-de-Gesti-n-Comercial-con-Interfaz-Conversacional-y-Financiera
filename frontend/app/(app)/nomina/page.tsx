"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  FileText,
  ReceiptText,
  Sparkles,
  X,
  Wallet,
} from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import { PayrollChatActionBar } from "@/src/components/payroll/PayrollChatActionBar";
import { AppApiError, api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";

type MoneyLike = number | string | null | undefined;

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Contract = {
  id: string;
  startDate?: string;
  endDate?: string | null;
};

type PayrollPeriod = {
  id: string;
  year: number;
  month: number;
  paymentCycle: string;
  installmentNumber?: number;
  status: string;
};

type PayrollRun = {
  id: string;
  employeeId: string;
  contractId: string;
  employee: Employee;
  contract?: Contract | null;
  salaryEarned: MoneyLike;
  transportAllowance: MoneyLike;
  commissions: MoneyLike;
  nonSalaryBonus: MoneyLike;
  overtimeAmount: MoneyLike;
  employeeHealth: MoneyLike;
  employeePension: MoneyLike;
  solidarityFund: MoneyLike;
  withholdingTax: MoneyLike;
  netPay: MoneyLike;
  employerHealth: MoneyLike;
  employerPension: MoneyLike;
  employerArl: MoneyLike;
  compensationFund: MoneyLike;
  sena: MoneyLike;
  icbf: MoneyLike;
  severance: MoneyLike;
  severanceInterest: MoneyLike;
  serviceBonus: MoneyLike;
  vacation: MoneyLike;
  realEmployerCost: MoneyLike;
};

type Settlement = {
  id: string;
  employeeId: string;
  contractId: string;
  startDate: string;
  endDate: string;
  semesterOneDays: number;
  semesterTwoDays: number;
  totalWorkedDays: number;
  severance: MoneyLike;
  severanceInterest: MoneyLike;
  serviceBonusSemesterOne: MoneyLike;
  serviceBonusSemesterTwo: MoneyLike;
  vacation: MoneyLike;
  totalAmount: MoneyLike;
  vacationDays: MoneyLike;
  hourlyRate: MoneyLike;
  calculatedAt?: string;
};

type ArlRiskClass = {
  id: string;
  level: number;
  name: string;
  rate?: MoneyLike;
};

type CiiuActivity = {
  id: string;
  code: string;
  description: string;
};

type WizardStep = 0 | 1 | 2 | 3;

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

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function employeeName(employee: Employee) {
  return `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "Empleado";
}

function initials(employee: Employee) {
  return `${employee.firstName?.[0] ?? ""}${employee.lastName?.[0] ?? ""}`.toUpperCase() || "N";
}

function employeeRole(_employee: Employee, _contract?: Contract | null) {
  // TODO: conectar cargo/trabajo real cuando el backend lo exponga.
  return "Empleado";
}

function PeriodSelector({
  periods,
  selectedId,
  onChange,
}: {
  periods: PayrollPeriod[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  if (!periods.length) return null;

  return (
    <label className="mb-3 flex items-center gap-2 rounded-2xl border border-white/70 bg-white/75 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
      <CalendarDays className="h-4 w-4 text-[#0fb18f]" />
      <select
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent font-medium text-slate-800 outline-none"
      >
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {monthNames[period.month - 1]} {period.year}
            {period.installmentNumber ? ` - cuota ${period.installmentNumber}` : ""} - {period.status}
          </option>
        ))}
      </select>
    </label>
  );
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
  const diff = totalCost - totalNet;
  const percent = totalNet > 0 ? (diff / totalNet) * 100 : 0;

  return (
    <section className="overflow-hidden rounded-[28px] bg-[#0fb18f] bg-[linear-gradient(135deg,#0fb18f_0%,#26c7a6_48%,#80dcc7_100%)] p-5 text-white shadow-[0_18px_42px_rgba(15,177,143,0.28)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/75">
            Resumen del periodo
          </p>
          <h1 className="mt-1 text-xl font-medium">
            {period ? `${monthNames[period.month - 1]} ${period.year}` : "Nomina"}
          </h1>
        </div>
        <span className="rounded-full bg-white/18 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
          {period?.status ?? "Sin periodo"}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-3xl font-medium tabular-nums">{money(totalCost)}</p>
          <p className="mt-1 text-sm text-white/78">Costo laboral total</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/14 p-3 backdrop-blur">
            <p className="text-lg font-medium tabular-nums">{shortMoney(totalNet)}</p>
            <p className="mt-1 text-[11px] text-white/78">Pago a empleados</p>
          </div>
          <div className="rounded-2xl bg-white/14 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-medium tabular-nums">{shortMoney(diff)}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#0f8f76]">
                {percent.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-white/78">Cargas + provisiones</p>
          </div>
        </div>
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

function PaymentToggle({
  paid,
  onToggle,
}: {
  paid: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-[11px] font-medium transition",
        paid ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
      )}
    >
      <span className={cn("h-5 w-9 rounded-full p-0.5 transition", paid ? "bg-[#0fb18f]" : "bg-slate-300")}>
        <span className={cn("block h-4 w-4 rounded-full bg-white shadow-sm transition", paid && "translate-x-4")} />
      </span>
      {paid ? "Pagado" : "Pendiente"}
    </button>
  );
}

function PayrollSummaryPanel({
  run,
  expanded,
  paid,
  onToggleExpanded,
  onTogglePaid,
}: {
  run: PayrollRun;
  expanded: boolean;
  paid: boolean;
  onToggleExpanded: () => void;
  onTogglePaid: () => void;
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
      <article className="overflow-hidden rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0fb18f]/12 text-sm font-medium text-[#0f8f76]">
            {initials(run.employee)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-slate-900">{employeeName(run.employee)}</p>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">{employeeRole(run.employee, run.contract)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{run.employee.documentNumber ?? "Sin documento"}</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-medium tabular-nums text-[#0fb18f]">{money(run.netPay)}</p>
            <p className="text-[11px] text-slate-400">Neto a transferir</p>
          </div>
        </div>

        <div className="space-y-2">
          <MoneyLine label="Sueldo basico" value={run.salaryEarned} color="text-[#1f2937]" />
          {extras.length > 0 && (
            <div className="ml-4 space-y-1.5 rounded-2xl bg-[#c3975c]/10 px-3 py-2">
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
            label="Deducciones salud/pension"
            value={deductions}
            color="text-[#e5a5ba]"
            valueColor="text-[#d985a1]"
            sign="-"
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] text-slate-400">Costo real empresa</p>
            <p className="text-[13px] font-medium tabular-nums text-slate-800">{money(run.realEmployerCost)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
            <PaymentToggle paid={paid} onToggle={onTogglePaid} />
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

function SettlementPanel({ settlement }: { settlement?: Settlement }) {
  if (!settlement) {
    return (
      <article className="flex min-w-full snap-start flex-col justify-center rounded-[24px] border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
        <ReceiptText className="mx-auto h-7 w-7 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">Liquidacion contrato</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          No hay una liquidacion registrada para este empleado.
        </p>
      </article>
    );
  }

  const concepts = [
    { label: "Cesantias", value: settlement.severance },
    { label: "Intereses cesantias", value: settlement.severanceInterest },
    { label: "Prima I", value: settlement.serviceBonusSemesterOne },
    { label: "Prima II", value: settlement.serviceBonusSemesterTwo },
    { label: "Vacaciones", value: settlement.vacation },
  ];

  return (
    <article className="min-w-full snap-start rounded-[24px] border border-violet-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-400">Liquidacion contrato</p>
          <h3 className="mt-1 text-base font-medium text-slate-900">Fechas</h3>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-medium text-violet-700">
          {money(settlement.totalAmount)}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-slate-50 p-2">
          <p className="text-[10px] text-slate-400">Ingreso</p>
          <p className="mt-1 text-[11px] font-medium text-slate-800">{formatDate(settlement.startDate)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-2">
          <p className="text-[10px] text-slate-400">Salida</p>
          <p className="mt-1 text-[11px] font-medium text-slate-800">{formatDate(settlement.endDate)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-2">
          <p className="text-[10px] text-slate-400">Dias</p>
          <p className="mt-1 text-[11px] font-medium text-slate-800">{settlement.totalWorkedDays}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">
          Semestre I: {settlement.semesterOneDays}
        </span>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">
          Semestre II: {settlement.semesterTwoDays}
        </span>
      </div>

      <div className="space-y-2">
        {concepts.map((item) => (
          <MoneyLine key={item.label} label={item.label} value={item.value} color="text-slate-600" />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[10px] text-slate-400">Dias vacaciones</p>
          <p className="text-sm font-medium text-slate-800">{toNumber(settlement.vacationDays).toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400">Valor hora</p>
          <p className="text-sm font-medium text-slate-800">{money(settlement.hourlyRate)}</p>
        </div>
      </div>
    </article>
  );
}

function EmployeeCarousel({
  run,
  settlement,
  expanded,
  paid,
  onToggleExpanded,
  onTogglePaid,
  selected,
  onSelect,
}: {
  run: PayrollRun;
  settlement?: Settlement;
  expanded: boolean;
  paid: boolean;
  onToggleExpanded: () => void;
  onTogglePaid: () => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      onMouseDown={onSelect}
      className={cn(
        "overflow-hidden rounded-[26px] transition",
        selected && "bg-[#0fb18f]/18 p-[2px]",
      )}
    >
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <PayrollSummaryPanel
          run={run}
          expanded={expanded}
          paid={paid}
          onToggleExpanded={onToggleExpanded}
          onTogglePaid={onTogglePaid}
        />
        <SettlementPanel settlement={settlement} />
      </div>
    </div>
  );
}

function DetailPanel({
  run,
  settlement,
  paid,
  onTogglePaid,
}: {
  run?: PayrollRun;
  settlement?: Settlement;
  paid: boolean;
  onTogglePaid: () => void;
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
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#0fb18f]/12 text-base font-medium text-[#0f8f76]">
          {initials(run.employee)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-medium text-slate-900">{employeeName(run.employee)}</h2>
          <p className="text-sm font-medium text-slate-500">{employeeRole(run.employee, run.contract)}</p>
          <p className="text-xs text-slate-400">{run.employee.documentNumber ?? "Sin documento"}</p>
          <div className="mt-3">
            <PaymentToggle paid={paid} onToggle={onTogglePaid} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-600">Neto</p>
            <p className="mt-1 text-base font-medium text-emerald-700">{money(run.netPay)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Costo empresa</p>
            <p className="mt-1 text-base font-medium text-slate-800">{money(run.realEmployerCost)}</p>
          </div>
        </div>

        <SettlementPanel settlement={settlement} />

        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-[12px] font-medium text-slate-800">Acciones rapidas</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm"
            >
              Ver contrato
            </button>
            <button
              type="button"
              className="rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm"
            >
              Liquidacion
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PayrollRecordWizardSheet({
  open,
  onClose,
  onFinished,
  arlRisks,
  ciiuActivities,
}: {
  open: boolean;
  onClose: () => void;
  onFinished: (periodId: string) => void;
  arlRisks: ArlRiskClass[];
  ciiuActivities: CiiuActivity[];
}) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const [step, setStep] = useState<WizardStep>(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contractType, setContractType] = useState("INDEFINITE");
  const [salaryMonthly, setSalaryMonthly] = useState("");
  const [startDate, setStartDate] = useState(todayIso);
  const [isRemote, setIsRemote] = useState(false);
  const [applyLaw1819, setApplyLaw1819] = useState(true);
  const [contractPaymentCycle, setContractPaymentCycle] = useState("MONTHLY");
  const [arlRiskClassId, setArlRiskClassId] = useState("");
  const [ciiuId, setCiiuId] = useState("");
  const [year, setYear] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [periodPaymentCycle, setPeriodPaymentCycle] = useState("MONTHLY");
  const [installmentNumber, setInstallmentNumber] = useState("1");
  const [workedDays, setWorkedDays] = useState("30");
  const [commissions, setCommissions] = useState("0");
  const [nonSalaryBonus, setNonSalaryBonus] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setFirstName("");
    setLastName("");
    setDocumentNumber("");
    setEmail("");
    setPhone("");
    setContractType("INDEFINITE");
    setSalaryMonthly("");
    setStartDate(todayIso);
    setIsRemote(false);
    setApplyLaw1819(true);
    setContractPaymentCycle("MONTHLY");
    setArlRiskClassId("");
    setCiiuId("");
    setYear(String(today.getFullYear()));
    setMonth(String(today.getMonth() + 1));
    setPeriodPaymentCycle("MONTHLY");
    setInstallmentNumber("1");
    setWorkedDays("30");
    setCommissions("0");
    setNonSalaryBonus("0");
    setOtherDeductions("0");
    setStep(0);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const selectedArl = arlRisks.find((item) => item.id === arlRiskClassId);
  const selectedCiiu = ciiuActivities.find((item) => item.id === ciiuId);

  const validateCurrentStep = () => {
    if (step === 0) {
      if (!firstName.trim()) return "El nombre es obligatorio.";
      if (!lastName.trim()) return "El apellido es obligatorio.";
      if (!documentNumber.trim()) return "El documento es obligatorio.";
    }
    if (step === 1) {
      if (!salaryMonthly || Number(salaryMonthly) <= 0) return "El salario mensual debe ser mayor a 0.";
      if (!startDate) return "La fecha de inicio es obligatoria.";
    }
    if (step === 2) {
      const parsedYear = Number(year);
      const parsedMonth = Number(month);
      if (!Number.isInteger(parsedYear) || parsedYear < 1900) return "El anio del periodo no es valido.";
      if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return "El mes del periodo no es valido.";
      if (!workedDays || Number(workedDays) < 1) return "Los dias trabajados deben ser mayores a 0.";
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
    const data = await api<PayrollPeriod[]>(`/payroll/periods?year=${Number(year)}&month=${Number(month)}`);
    const normalizedInstallment = periodPaymentCycle === "BIWEEKLY" ? Number(installmentNumber || 1) : 1;
    return data.find(
      (period) =>
        period.paymentCycle === periodPaymentCycle &&
        (period.installmentNumber ?? 1) === normalizedInstallment,
    );
  };

  const handleSubmit = async () => {
    const validation = validateCurrentStep();
    if (validation) {
      setError(validation);
      return;
    }
    if (!firstName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!lastName.trim()) {
      setError("El apellido es obligatorio.");
      return;
    }
    if (!documentNumber.trim()) {
      setError("El documento es obligatorio.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const employee = await api<Employee>("/payroll/employees", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          documentNumber: documentNumber.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const contract = await api<Contract>(`/payroll/employees/${employee.id}/contracts`, {
        method: "POST",
        body: JSON.stringify({
          contractType,
          salaryMonthly: Number(salaryMonthly),
          startDate,
          isRemote,
          applyLaw1819,
          paymentCycle: contractPaymentCycle,
          arlRiskClassId: arlRiskClassId || undefined,
          ciiuId: ciiuId || undefined,
        }),
      });

      const periodPayload = {
        year: Number(year),
        month: Number(month),
        paymentCycle: periodPaymentCycle,
        installmentNumber: periodPaymentCycle === "BIWEEKLY" ? Number(installmentNumber || 1) : 1,
      };

      let period: PayrollPeriod | undefined;
      try {
        period = await api<PayrollPeriod>("/payroll/periods", {
          method: "POST",
          body: JSON.stringify(periodPayload),
        });
      } catch (err) {
        if (err instanceof AppApiError && err.status === 409) {
          period = await findExistingPeriod();
          if (!period) throw err;
        } else {
          throw err;
        }
      }

      await api<PayrollRun>(`/payroll/periods/${period.id}/calculate/${employee.id}`, {
        method: "POST",
        body: JSON.stringify({
          workedDays: Number(workedDays || 30),
          commissions: Number(commissions || 0),
          nonSalaryBonus: Number(nonSalaryBonus || 0),
          otherDeductions: Number(otherDeductions || 0),
        }),
      });

      await api<Settlement>(`/payroll/contracts/${contract.id}/settlements/simulate`, {
        method: "POST",
        body: JSON.stringify({}),
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
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Nombre" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Apellido" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Documento" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email opcional" type="email" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefono opcional" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <select value={contractType} onChange={(event) => setContractType(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="INDEFINITE">Contrato indefinido</option>
              <option value="FIXED_TERM">Termino fijo</option>
            </select>
            <input value={salaryMonthly} onChange={(event) => setSalaryMonthly(event.target.value)} placeholder="Salario mensual" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex h-12 items-center gap-2 rounded-2xl bg-slate-50 px-3 text-sm text-slate-700">
                <input type="checkbox" checked={isRemote} onChange={(event) => setIsRemote(event.target.checked)} />
                Remoto
              </label>
              <label className="flex h-12 items-center gap-2 rounded-2xl bg-slate-50 px-3 text-sm text-slate-700">
                <input type="checkbox" checked={applyLaw1819} onChange={(event) => setApplyLaw1819(event.target.checked)} />
                Ley 1819
              </label>
            </div>
            <select value={contractPaymentCycle} onChange={(event) => setContractPaymentCycle(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="MONTHLY">Pago mensual</option>
              <option value="BIWEEKLY">Pago quincenal</option>
            </select>
            <select value={arlRiskClassId} onChange={(event) => setArlRiskClassId(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="">ARL sin seleccionar</option>
              {arlRisks.map((risk) => (
                <option key={risk.id} value={risk.id}>ARL {risk.level} - {risk.name}</option>
              ))}
            </select>
            <select value={ciiuId} onChange={(event) => setCiiuId(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="">CIIU sin seleccionar</option>
              {ciiuActivities.map((activity) => (
                <option key={activity.id} value={activity.id}>{activity.code} - {activity.description}</option>
              ))}
            </select>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={year} onChange={(event) => setYear(event.target.value)} placeholder="Anio" type="number" className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
              <input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="Mes" type="number" min="1" max="12" className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            </div>
            <select value={periodPaymentCycle} onChange={(event) => setPeriodPaymentCycle(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
              <option value="MONTHLY">Periodo mensual</option>
              <option value="BIWEEKLY">Periodo quincenal</option>
            </select>
            {periodPaymentCycle === "BIWEEKLY" && (
              <select value={installmentNumber} onChange={(event) => setInstallmentNumber(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300">
                <option value="1">Quincena 1</option>
                <option value="2">Quincena 2</option>
              </select>
            )}
            <input value={workedDays} onChange={(event) => setWorkedDays(event.target.value)} placeholder="Dias trabajados" type="number" min="1" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={commissions} onChange={(event) => setCommissions(event.target.value)} placeholder="Comisiones" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={nonSalaryBonus} onChange={(event) => setNonSalaryBonus(event.target.value)} placeholder="Bonificaciones no salariales" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
            <input value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)} placeholder="Otras deducciones" type="number" min="0" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-300" />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Nombre</span><span className="font-medium text-slate-900">{firstName} {lastName}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Salario mensual</span><span className="font-medium text-slate-900">{money(salaryMonthly)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Periodo</span><span className="font-medium text-slate-900">{monthNames[Number(month) - 1]} {year}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Dias trabajados</span><span className="font-medium text-slate-900">{workedDays}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Ley 1819</span><span className="font-medium text-slate-900">{applyLaw1819 ? "Si aplica" : "No aplica"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">ARL</span><span className="max-w-[60%] truncate font-medium text-slate-900">{selectedArl ? `${selectedArl.level} - ${selectedArl.name}` : "Sin seleccionar"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">CIIU</span><span className="max-w-[60%] truncate font-medium text-slate-900">{selectedCiiu ? `${selectedCiiu.code} - ${selectedCiiu.description}` : "Sin seleccionar"}</span></div>
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

export default function PayrollPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [, setEmployees] = useState<Employee[]>([]);
  const [arlRisks, setArlRisks] = useState<ArlRiskClass[]>([]);
  const [ciiuActivities, setCiiuActivities] = useState<CiiuActivity[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [settlements, setSettlements] = useState<Record<string, Settlement>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [paidByRunId, setPaidByRunId] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [recordWizardOpen, setRecordWizardOpen] = useState(false);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId),
    [periods, selectedPeriodId],
  );

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PayrollPeriod[]>("/payroll/periods");
      setPeriods(data);
      setSelectedPeriodId((current) => current || data[0]?.id || "");
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar nomina");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await api<Employee[]>("/payroll/employees?isActive=true");
      setEmployees(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadCatalogs = useCallback(async () => {
    const [risks, ciiu] = await Promise.allSettled([
      api<ArlRiskClass[]>("/payroll/arl-risks"),
      api<CiiuActivity[]>("/payroll/ciiu?limit=100"),
    ]);
    if (risks.status === "fulfilled") setArlRisks(risks.value);
    if (ciiu.status === "fulfilled") setCiiuActivities(ciiu.value);
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
      api<PayrollRun[]>(`/payroll/periods/${selectedPeriodId}/runs`),
      api<Settlement[]>("/payroll/settlements"),
    ])
      .then(async ([runData, settlementList]) => {
        if (!alive) return;
        setRuns(runData);
        setSelectedRunId((current) => current ?? runData[0]?.id ?? null);

        const latestByEmployee = new Map<string, Settlement>();
        for (const settlement of settlementList) {
          if (!latestByEmployee.has(settlement.employeeId)) {
            latestByEmployee.set(settlement.employeeId, settlement);
          }
        }

        const details = await Promise.all(
          Array.from(latestByEmployee.values()).map((settlement) =>
            api<Settlement>(`/payroll/settlements/${settlement.id}`).catch(() => settlement),
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
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedPeriodId]);

  const filteredRuns = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return runs;
    return runs.filter((run) => {
      const fullName = employeeName(run.employee).toLowerCase();
      return (
        fullName.includes(term) ||
        run.employee.firstName?.toLowerCase().includes(term) ||
        run.employee.lastName?.toLowerCase().includes(term) ||
        run.employee.documentNumber?.toLowerCase().includes(term)
      );
    });
  }, [runs, search]);

  const totals = useMemo(
    () => ({
      cost: filteredRuns.reduce((acc, run) => acc + toNumber(run.realEmployerCost), 0),
      net: filteredRuns.reduce((acc, run) => acc + toNumber(run.netPay), 0),
    }),
    [filteredRuns],
  );

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? filteredRuns[0],
    [filteredRuns, runs, selectedRunId],
  );

  const togglePaid = useCallback((runId: string) => {
    setPaidByRunId((prev) => ({ ...prev, [runId]: !prev[runId] }));
  }, []);

  const handleAction = (action: string) => {
    if (action === "new-record") {
      setActionsOpen(false);
      setRecordWizardOpen(true);
      return;
    }

    setNotice("Accion no disponible en este flujo.");
    window.setTimeout(() => setNotice(null), 2400);
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#f7f3ed]">
      <div className="shrink-0">
        <AppHeader title="Nomina" showBack hrefBack="/home" />
      </div>

      <main className="min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(380px,520px)_minmax(360px,1fr)]">
        <section className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-44 lg:pb-[150px]">
          <div className="mx-auto max-w-3xl">
            <PeriodSelector periods={periods} selectedId={selectedPeriodId} onChange={setSelectedPeriodId} />
            <SummaryCard period={selectedPeriod} totalCost={totals.cost} totalNet={totals.net} />

            <div className="mb-3 mt-5">
              <div>
                <h2 className="text-base font-medium text-slate-900">Planilla de pagos</h2>
                <p className="text-xs text-slate-500">{filteredRuns.length} empleados calculados</p>
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

            {!loading && !error && filteredRuns.length === 0 && (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
                <Wallet className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No hay nominas calculadas</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Abre las acciones con el boton + para preparar el calculo del periodo.
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              {!loading &&
                !error &&
                filteredRuns.map((run) => (
                  <EmployeeCarousel
                    key={run.id}
                    run={run}
                    settlement={settlements[run.employeeId]}
                    expanded={expandedRunId === run.id}
                    paid={!!paidByRunId[run.id]}
                    selected={selectedRun?.id === run.id}
                    onSelect={() => setSelectedRunId(run.id)}
                    onToggleExpanded={() => setExpandedRunId((current) => (current === run.id ? null : run.id))}
                    onTogglePaid={() => togglePaid(run.id)}
                  />
                ))}
            </div>
          </div>
        </section>

        <DetailPanel
          run={selectedRun}
          settlement={selectedRun ? settlements[selectedRun.employeeId] : undefined}
          paid={selectedRun ? !!paidByRunId[selectedRun.id] : false}
          onTogglePaid={() => selectedRun && togglePaid(selectedRun.id)}
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

      <PayrollRecordWizardSheet
        open={recordWizardOpen}
        onClose={() => setRecordWizardOpen(false)}
        arlRisks={arlRisks}
        ciiuActivities={ciiuActivities}
        onFinished={(periodId) => {
          loadEmployees();
          loadPeriods();
          setSelectedPeriodId(periodId);
        }}
      />
    </div>
  );
}
