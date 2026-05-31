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

export type PayrollRun = {
  id: string;
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
  usedParameters?: Record<string, unknown>;
  payments?: PayrollPayment[];
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
  lines?: Array<{ code: string; name: string; amount: MoneyLike }>;
  usedParameters?: Record<string, unknown>;
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
};

export type ArlRiskClass = {
  id: string;
  level: number;
  name: string;
  rate?: MoneyLike;
};

export type CiiuActivity = {
  id: string;
  code: string;
  description: string;
};

export type OvertimeType =
  | "OVERTIME_DAY"
  | "OVERTIME_NIGHT"
  | "NIGHT_SURCHARGE"
  | "SUNDAY_HOLIDAY_EXTRA_DAY"
  | "SUNDAY_HOLIDAY_EXTRA_NIGHT"
  | "SUNDAY_HOLIDAY_DAY";

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
  ciiuId?: string;
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
  otherDeductions: number;
  overtimeHours?: Array<{ type: OvertimeType; quantity: number }>;
};

export type SimulateSettlementPayload = {
  endDate?: string;
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
      console.error("[payroll] error", {
        endpoint,
        payload,
        error:
          error instanceof AppApiError
            ? { status: error.status, message: error.message, details: error.details }
            : error,
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
  listCiiu(limit = 100) {
    return payrollRequest<CiiuActivity[]>(`/payroll/ciiu?limit=${limit}`);
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
    return payrollRequest<PayrollRun>(`/payroll/periods/${periodId}/calculate/${employeeId}`, {
      method: "POST",
      body: JSON.stringify(payload),
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
  createSettlement(contractId: string, payload: { endDate: string }) {
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

