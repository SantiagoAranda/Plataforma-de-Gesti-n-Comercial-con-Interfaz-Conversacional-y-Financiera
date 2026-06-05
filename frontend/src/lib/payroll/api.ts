import { AppApiError, api } from "@/src/lib/api";

export type MoneyLike = number | string | null | undefined;

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  contracts?: Contract[];
};

export type Contract = {
  id: string;
  employeeId?: string;
  salaryMonthly?: MoneyLike;
  startDate?: string;
  endDate?: string | null;
  isRemote?: boolean;
  applyLaw1819?: boolean;
  arlRiskClassId?: string | null;
  arlRiskClass?: ArlRiskClass | null;
  contractType?: "INDEFINITE" | "FIXED_TERM" | string;
  paymentCycle?: "MONTHLY" | "BIWEEKLY" | string;
  isActive?: boolean;
};

export type PayrollPeriod = {
  id: string;
  year: number;
  month: number;
  paymentCycle: "MONTHLY" | "BIWEEKLY" | string;
  installmentNumber?: number;
  status: string;
};

export type PayrollRunUsedParameters = Record<string, unknown> & {
  serviceBonusPreview?: MoneyLike;
  serviceBonusProjected?: MoneyLike;
  loanDeduction?: MoneyLike;
  otherDeductions?: MoneyLike;
  deductionsBreakdown?: {
    loanDeduction?: MoneyLike;
    otherDeductions?: MoneyLike;
  };
};

export type PayrollRun = {
  id: string;
  payrollPeriodId?: string;
  employeeId: string;
  contractId: string;
  employee: Employee;
  contract?: Contract | null;
  salaryEarned: MoneyLike;
  transportAllowance: MoneyLike;
  connectivityAllowance?: MoneyLike;
  grossIncome?: MoneyLike;
  commissions: MoneyLike;
  nonSalaryBonus: MoneyLike;
  overtimeAmount: MoneyLike;
  employeeHealth: MoneyLike;
  employeePension: MoneyLike;
  solidarityFund: MoneyLike;
  withholdingTax: MoneyLike;
  loanDeduction?: MoneyLike;
  otherDeductions?: MoneyLike;
  totalEmployeeDeductions?: MoneyLike;
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
  totalBenefits?: MoneyLike;
  realEmployerCost: MoneyLike;
  usedParameters?: PayrollRunUsedParameters;
  payments?: PayrollPayment[];
  preview?: boolean;
  warnings?: string[];
};

export type PayrollPayment = {
  id: string;
  payrollRunId: string;
  employeeId: string;
  contractId: string;
  installmentNumber?: number | null;
  paymentCycle: "MONTHLY" | "BIWEEKLY" | string;
  type: "SALARY_PAYMENT" | "ADVANCE" | "ADJUSTMENT" | string;
  status: "PENDING" | "PAID" | "CANCELLED" | string;
  amount: MoneyLike;
  paidAt?: string | null;
  paymentMethod?: "CASH" | "BANK_TRANSFER" | "OTHER" | string | null;
  notes?: string | null;
};

export type Settlement = {
  id: string;
  employeeId: string;
  contractId: string;
  startDate: string;
  endDate: string;
  cutoffStartDate?: string;
  settlementDate?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  causedDays?: number;
  semester1Days?: number;
  semester2Days?: number;
  semesterOneDays?: number;
  semesterTwoDays?: number;
  totalWorkedDays: number;
  severance: MoneyLike;
  severanceInterest: MoneyLike;
  serviceBonus?: MoneyLike;
  serviceBonusSemester1?: MoneyLike;
  serviceBonusSemester2?: MoneyLike;
  serviceBonusSemesterOne?: MoneyLike;
  serviceBonusSemesterTwo?: MoneyLike;
  serviceBonusTotal?: MoneyLike;
  vacation: MoneyLike;
  grossSalaryAccrued?: MoneyLike;
  grossSalaryPaid?: MoneyLike;
  grossSalaryPending?: MoneyLike;
  netSalaryAccrued?: MoneyLike;
  netSalaryPaid?: MoneyLike;
  netSalaryPending?: MoneyLike;
  salaryPending?: MoneyLike;
  salaryPendingAvailable?: boolean;
  benefitsTotal?: MoneyLike;
  settlementTotalPayable?: MoneyLike;
  totalEstimated?: MoneyLike;
  benefitsProvisioned?: Record<string, MoneyLike>;
  benefitsCalculated?: Record<string, MoneyLike>;
  reconciliationDifference?: MoneyLike;
  reconciliationPercent?: MoneyLike;
  benefitsReconciliation?: Record<string, unknown>;
  requestedEndDate?: string;
  calculationEndDate?: string;
  calculationYear?: number;
  settlementScope?: "CURRENT_YEAR" | "CURRENT_SEMESTER_CUTOFF" | string;
  totalAmount: MoneyLike;
  vacationDays: MoneyLike;
  hourlyRate: MoneyLike;
  calculatedAt?: string;
  lines?: Array<{ code: string; name: string; amount: MoneyLike }>;
  usedParameters?: Record<string, unknown>;
  preview?: boolean;
};

export type PayrollBenefitPayment = {
  id: string;
  employeeId: string;
  contractId: string;
  type: "PRIMA" | "CESANTIAS" | "INTERESES_CESANTIAS" | "VACACIONES" | string;
  amount: MoneyLike;
  status: "PENDING" | "PAID" | "CANCELLED" | string;
  paidAt?: string | null;
  notes?: string | null;
  year?: number | null;
  semester?: number | null;
  paymentMethod?: string | null;
};

export type ArlRiskClass = {
  id: string;
  level: number;
  name: string;
  rate?: MoneyLike;
};

export type LiquidatePayrollPeriodResult = {
  period: PayrollPeriod;
  runs: PayrollRun[];
  totalEmployees: number;
  calculatedRuns: number;
  skippedEmployees: Array<{ employeeId: string; reason: string }>;
};

export type CiiuActivity = {
  id: string;
  code: string;
  description: string;
};

export type OvertimeType =
  | "HORA_EXTRA_DIURNA"
  | "HORA_EXTRA_NOCTURNO"
  | "HORA_ORDINARIA_NOCTURNA"
  | "HORA_EXTRA_DOM_FESTIVO"
  | "HORA_EXTRA_NOCTURNO_DOM_FESTIVO"
  | "HORA_DOMINICAL_FESTIVO"
  | "HORA_DOM_FESTIVO_NOCTURNO";

export type CreateEmployeePayload = {
  firstName: string;
  lastName: string;
  documentNumber: string;
  position?: string;
  email?: string;
  phone?: string;
};

export type UpdateEmployeePayload = Partial<CreateEmployeePayload>;

export type CreateContractPayload = {
  contractType: "INDEFINITE" | "FIXED_TERM";
  salaryMonthly: number;
  startDate: string;
  endDate?: string;
  isRemote: boolean;
  applyLaw1819: boolean;
  paymentCycle: "MONTHLY" | "BIWEEKLY";
  arlRiskClassId: string;
};

export type UpdateContractPayload = Partial<CreateContractPayload> & {
  isActive?: boolean;
};

export type CreatePayrollPeriodPayload = {
  year: number;
  month: number;
  paymentCycle: "MONTHLY" | "BIWEEKLY";
  installmentNumber: number;
};

export type CalculatePayrollPayload = {
  workedDays: number;
  commissions: number;
  nonSalaryBonus: number;
  loanDeduction?: number;
  otherDeductions: number;
  overtimeHours?: Array<{ type: OvertimeType; quantity: number }>;
};

export type SimulateSettlementPayload = {
  endDate?: string;
  calculationYear?: number;
  salaryConceptsAmount?: number;
};

export type CreateSettlementPayload = {
  endDate: string;
  calculationYear?: number;
  salaryConceptsAmount?: number;
};

export type UpdatePayrollPaymentStatusPayload = {
  status: "PENDING" | "PAID" | "CANCELLED";
  paymentMethod?: "CASH" | "BANK_TRANSFER" | "OTHER";
  paidAt?: string;
  notes?: string;
};

const shouldLogPayroll = process.env.NODE_ENV === "development";

function normalizeNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function numberValue(value: string | number | null | undefined) {
  return normalizeNumber(value);
}

function nonNegativeNumber(value: string | number | null | undefined) {
  return Math.max(0, normalizeNumber(value));
}

function normalizeCalculatePayrollPayload(
  payload: CalculatePayrollPayload,
): CalculatePayrollPayload {
  const workedDays = Math.trunc(nonNegativeNumber(payload.workedDays));
  const overtimeHours = (payload.overtimeHours ?? [])
    .map((item) => ({
      type: item.type,
      quantity: nonNegativeNumber(item.quantity),
    }))
    .filter((item) => item.quantity > 0);

  return {
    workedDays,
    commissions: nonNegativeNumber(payload.commissions),
    nonSalaryBonus: nonNegativeNumber(payload.nonSalaryBonus),
    loanDeduction: nonNegativeNumber(payload.loanDeduction),
    otherDeductions: nonNegativeNumber(payload.otherDeductions),
    ...(overtimeHours.length ? { overtimeHours } : {}),
  };
}

async function payrollRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const payload =
    typeof options.body === "string" ? safeJsonParse(options.body) : undefined;
  if (shouldLogPayroll) {
    console.info("[payroll] request", { endpoint, payload });
  }
  try {
    const response = await api<T>(endpoint, options);
    if (shouldLogPayroll) {
      console.info("[payroll] response", { endpoint, response });
    }
    return response;
  } catch (error) {
    if (shouldLogPayroll) {
      const appError = error instanceof AppApiError ? error : null;
      const detailsMessage = Array.isArray(appError?.details?.message)
        ? appError?.details?.message.join(" | ")
        : appError?.details?.message;
      console.error("[payroll] error", {
        endpoint,
        status: appError?.status,
        message: appError?.message,
        detailsMessage,
        detailsError: appError?.details?.error,
        details: appError?.details,
        payload,
        raw: appError?.raw,
        error: appError ? undefined : error,
      });
    }
    throw error;
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const payrollApi = {
  listPeriods() {
    return payrollRequest<PayrollPeriod[]>("/payroll/periods");
  },
  findPeriods(year: number, month: number) {
    return payrollRequest<PayrollPeriod[]>(
      `/payroll/periods?year=${year}&month=${month}`,
    );
  },
  createPeriod(payload: CreatePayrollPeriodPayload) {
    return payrollRequest<PayrollPeriod>("/payroll/periods", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listEmployees() {
    return payrollRequest<Employee[]>("/payroll/employees?isActive=true");
  },
  getEmployee(employeeId: string) {
    return payrollRequest<Employee>(`/payroll/employees/${employeeId}`);
  },
  createEmployee(payload: CreateEmployeePayload) {
    return payrollRequest<Employee>("/payroll/employees", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateEmployee(employeeId: string, payload: UpdateEmployeePayload) {
    return payrollRequest<Employee>(`/payroll/employees/${employeeId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteEmployee(employeeId: string) {
    return payrollRequest<{ ok: boolean }>(`/payroll/employees/${employeeId}`, {
      method: "DELETE",
    });
  },
  hardDeleteEmployee(employeeId: string) {
    return payrollRequest<{ ok: boolean }>(`/payroll/employees/${employeeId}/hard`, {
      method: "DELETE",
    });
  },
  createContract(employeeId: string, payload: CreateContractPayload) {
    return payrollRequest<Contract>(`/payroll/employees/${employeeId}/contracts`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listContracts(employeeId: string) {
    return payrollRequest<Contract[]>(`/payroll/employees/${employeeId}/contracts`);
  },
  updateContract(contractId: string, payload: UpdateContractPayload) {
    return payrollRequest<Contract>(`/payroll/contracts/${contractId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteContract(contractId: string) {
    return payrollRequest<{ ok: boolean }>(`/payroll/contracts/${contractId}`, {
      method: "DELETE",
    });
  },
  listArlRisks() {
    return payrollRequest<ArlRiskClass[]>("/payroll/arl-risks");
  },
  listRuns(periodId: string) {
    return payrollRequest<PayrollRun[]>(`/payroll/periods/${periodId}/runs`);
  },
  listRunPayments(runId: string) {
    return payrollRequest<PayrollPayment[]>(`/payroll/runs/${runId}/payments`);
  },
  updatePaymentStatus(paymentId: string, payload: UpdatePayrollPaymentStatusPayload) {
    return payrollRequest<PayrollPayment>(`/payroll/payments/${paymentId}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  calculateEmployee(periodId: string, employeeId: string, payload: CalculatePayrollPayload) {
    const normalizedPayload = normalizeCalculatePayrollPayload(payload);
    return payrollRequest<PayrollRun>(`/payroll/periods/${periodId}/calculate/${employeeId}`, {
      method: "POST",
      body: JSON.stringify(normalizedPayload),
    });
  },
  liquidatePeriod(periodId: string) {
    return payrollRequest<LiquidatePayrollPeriodResult>(`/payroll/periods/${periodId}/runs`, {
      method: "POST",
    });
  },
  createComplementaryRun(periodId: string, employeeId: string, payload: { reason?: string } = {}) {
    return payrollRequest<PayrollRun>(
      `/payroll/periods/${periodId}/runs/complementary/${employeeId}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
  previewEmployee(periodId: string, employeeId: string, payload: CalculatePayrollPayload) {
    const normalizedPayload = normalizeCalculatePayrollPayload(payload);
    return payrollRequest<PayrollRun>(`/payroll/periods/${periodId}/preview/${employeeId}`, {
      method: "POST",
      body: JSON.stringify(normalizedPayload),
    });
  },
  updatePeriodStatus(periodId: string, status: "OPEN" | "CALCULATED" | "POSTED" | "CLOSED") {
    return payrollRequest<PayrollPeriod>(`/payroll/periods/${periodId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  listSettlements() {
    return payrollRequest<Settlement[]>("/payroll/settlements");
  },
  getSettlement(id: string) {
    return payrollRequest<Settlement>(`/payroll/settlements/${id}`);
  },
  simulateSettlement(contractId: string, payload: SimulateSettlementPayload = {}) {
    return payrollRequest<Settlement>(`/payroll/contracts/${contractId}/settlements/simulate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  createSettlement(contractId: string, payload: CreateSettlementPayload) {
    return payrollRequest<Settlement>(`/payroll/contracts/${contractId}/settlements`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  postSettlement(settlementId: string) {
    return payrollRequest<Settlement>(`/payroll/settlements/${settlementId}/post`, {
      method: "POST",
    });
  },
  listBenefitPayments(contractId: string) {
    return payrollRequest<PayrollBenefitPayment[]>(
      `/payroll/contracts/${contractId}/benefit-payments`,
    );
  },
  createBenefitPayment(
    contractId: string,
    payload: {
      type: "PRIMA" | "CESANTIAS" | "INTERESES_CESANTIAS" | "VACACIONES" | string;
      amount: number;
      paidAt?: string | null;
      periodId?: string | null;
      payrollRunId?: string | null;
      status?: "PENDING" | "PAID" | "CANCELLED" | string;
      notes?: string | null;
      year?: number;
      semester?: number;
      paymentMethod?: "CASH" | "BANK_TRANSFER" | "OTHER" | string | null;
      regularizeMissingProvision?: boolean;
    },
  ) {
    return payrollRequest<PayrollBenefitPayment>(
      `/payroll/contracts/${contractId}/benefit-payments`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
};
