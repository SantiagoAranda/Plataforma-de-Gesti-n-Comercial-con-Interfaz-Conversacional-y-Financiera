"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import toast from "react-hot-toast";
import {
  calculateSimpleTaxPeriod,
  getSimpleTaxConfig,
  listSimpleTaxPeriods,
  paySimpleTaxPeriod,
  postSimpleTaxPeriod,
  updateSimpleTaxConfig,
  type SimpleTaxCalculation,
  type SimpleTaxConfig,
  type SimpleTaxPeriod,
} from "@/src/lib/simple-tax/api";

const ENABLE_SIMPLE_TAX_MANUAL_ADJUSTMENTS = false;
const ENABLE_SIMPLE_TAX_ANNUAL_UI = false;

const PERIODS = [
  { value: 1, label: "Enero - febrero" },
  { value: 2, label: "Marzo - abril" },
  { value: 3, label: "Mayo - junio" },
  { value: 4, label: "Julio - agosto" },
  { value: 5, label: "Septiembre - octubre" },
  { value: 6, label: "Noviembre - diciembre" },
];

function formatCurrency(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatRate(value: number | string | null | undefined) {
  return `${(Number(value ?? 0) * 100).toFixed(2).replace(".00", "")}%`;
}

function formatUvt(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("es-CO");
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold ${accent ? "text-emerald-700" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}

export default function RegimenSimplePage() {
  const [config, setConfig] = useState<SimpleTaxConfig | null>(null);
  const [periods, setPeriods] = useState<SimpleTaxPeriod[]>([]);
  const [taxYear, setTaxYear] = useState("2026");
  const [periodNumber, setPeriodNumber] = useState(1);
  const [calculation, setCalculation] = useState<SimpleTaxCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK">("BANK");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");

  const loadData = async (year = Number(taxYear) || 2026) => {
    setLoading(true);
    try {
      const [loadedConfig, loadedPeriods] = await Promise.all([
        getSimpleTaxConfig().catch(() => null),
        listSimpleTaxPeriods(year).catch(() => []),
      ]);
      setConfig(loadedConfig);
      setPeriods(loadedPeriods);
      if (loadedConfig?.taxYear && String(loadedConfig.taxYear) !== taxYear) {
        setTaxYear(String(loadedConfig.taxYear));
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "No se pudo cargar Regimen Simple.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(Number(taxYear) || 2026);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear]);

  const selectedStoredPeriod = useMemo(
    () =>
      periods.find(
        (period) =>
          Number(period.taxYear) === Number(taxYear) &&
          Number(period.periodNumber) === periodNumber,
      ),
    [periodNumber, periods, taxYear],
  );

  useEffect(() => {
    setCalculation(selectedStoredPeriod ?? null);
  }, [selectedStoredPeriod]);

  const groupResolution = config?.groupResolution ?? calculation?.groupResolution ?? null;
  const rutActivity = config?.rutActivity;
  const responsibilityActive = Boolean(config?.hasSimpleTaxResponsibility);
  const isAnnualException = config?.filingMode === "ANNUAL_EXCEPTION";
  const groupDetected = groupResolution?.status === "RESOLVED";
  const groupStatusMessage = (() => {
    if (groupResolution?.status === "RESOLVED") {
      return `Grupo ${groupResolution.groupCode}${groupResolution.groupName ? ` - ${groupResolution.groupName}` : ""}`;
    }
    if (groupResolution?.status === "AMBIGUOUS") {
      return "Ambiguo / requiere revision";
    }
    if (groupResolution?.status === "NO_RUT_ACTIVITY") {
      return "Sin actividad RUT";
    }
    return "No encontrado";
  })();
  const groupHelpMessage = (() => {
    if (groupResolution?.status === "AMBIGUOUS") {
      return "La actividad economica tiene mas de un grupo RST posible. Requiere revision.";
    }
    if (groupResolution?.status === "NO_RUT_ACTIVITY" || !rutActivity?.ciiuCode) {
      return "No hay actividad economica configurada en el RUT.";
    }
    if (groupResolution?.status === "NOT_FOUND") {
      return "No se pudo determinar automaticamente el grupo RST para esta actividad economica.";
    }
    return null;
  })();
  const periodStatus = calculation?.status;
  const periodLocked = periodStatus === "POSTED" || periodStatus === "PAID";
  const netSimpleTax = Number(calculation?.netSimpleTax ?? 0);
  const includedSales =
    calculation?.includedSales ?? calculation?.calculationSnapshot?.includedSales ?? [];
  const includedSalesTotal = includedSales.reduce(
    (total, sale) => total + Number(sale.subtotal ?? 0),
    0,
  );
  const appliedBracket =
    calculation?.bracket ?? calculation?.calculationSnapshot?.bracket ?? null;
  const paymentAccountCode = paymentMethod === "CASH" ? "110505" : "111005";
  const canCalculate =
    Boolean(config?.enabled) &&
    responsibilityActive &&
    groupDetected &&
    !isAnnualException &&
    !periodLocked;

  const mergePeriod = (period: SimpleTaxPeriod) => {
    setCalculation((prev) => ({
      ...(prev ?? {}),
      ...period,
      bracket: period.bracket ?? prev?.bracket ?? period.calculationSnapshot?.bracket ?? null,
      includedSales:
        period.includedSales ??
        prev?.includedSales ??
        period.calculationSnapshot?.includedSales ??
        [],
    }) as SimpleTaxCalculation);
    setPeriods((prev) => [...prev.filter((item) => item.id !== period.id), period]);
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const result = await calculateSimpleTaxPeriod({
        taxYear: Number(taxYear) || 2026,
        periodNumber,
        ...(ENABLE_SIMPLE_TAX_MANUAL_ADJUSTMENTS
          ? {}
          : {
              manualGrossIncome: 0,
              excludedIncome: 0,
              electronicPaymentsIncome: 0,
              pensionContributionsDiscount: 0,
            }),
      });
      setCalculation(result);
      setPeriods((prev) => [
        ...prev.filter((period) => period.id !== result.id),
        result as SimpleTaxPeriod,
      ]);
      toast.success("Anticipo RST calculado.");
    } catch (err: any) {
      setError(err.message || "No se pudo calcular el anticipo RST.");
    } finally {
      setCalculating(false);
    }
  };

  const handleResetToBimonthly = async () => {
    if (!config) return;
    try {
      const updated = await updateSimpleTaxConfig({
        enabled: config.enabled,
        taxYear: config.taxYear,
        groupCode: config.groupCode,
        activityLabel: config.activityLabel,
        ciiuCode: config.ciiuCode,
        filingMode: "BIMONTHLY_ADVANCE",
      });
      setConfig(updated);
      toast.success("Modalidad bimestral restaurada.");
    } catch (err: any) {
      setError(err.message || "No se pudo restaurar la modalidad bimestral.");
    }
  };

  const handlePostPeriod = async () => {
    if (!calculation?.id) return;
    setPosting(true);
    setError(null);
    try {
      const posted = await postSimpleTaxPeriod(calculation.id);
      mergePeriod(posted);
      toast.success("Impuesto RST presentado.");
    } catch (err: any) {
      setError(err.message || "No se pudo presentar el impuesto RST.");
    } finally {
      setPosting(false);
    }
  };

  const handlePayPeriod = async () => {
    if (!calculation?.id) return;
    setPaying(true);
    setError(null);
    try {
      const paid = await paySimpleTaxPeriod(calculation.id, {
        paymentDate,
        paymentMethod,
        paymentAccountCode,
        paidAmount: netSimpleTax,
        notes: paymentNotes || null,
      });
      mergePeriod(paid);
      setPaymentOpen(false);
      setPaymentNotes("");
      toast.success("Pago RST registrado.");
    } catch (err: any) {
      setError(err.message || "No se pudo registrar el pago RST.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8 text-slate-950">
      <AppHeader title="Regimen Simple" subtitle="Anticipo bimestral" showBack />

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 pt-4">
        {ENABLE_SIMPLE_TAX_ANNUAL_UI ? null : null}

        {loading ? (
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            Cargando configuracion...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {isAnnualException ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">
              Este negocio quedo configurado en modalidad anual por pruebas previas. Para operar anticipos bimestrales, restaura la modalidad bimestral.
            </p>
            <button
              type="button"
              onClick={handleResetToBimonthly}
              className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200"
            >
              Restaurar anticipos bimestrales
            </button>
          </div>
        ) : null}

        <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Datos tomados del RUT</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Responsabilidad 47"
              value={responsibilityActive ? "Activa" : "No activa"}
              accent={responsibilityActive}
            />
            <Metric
              label="Actividad economica"
              value={
                rutActivity?.ciiuCode
                  ? `${rutActivity.ciiuCode} - ${rutActivity.ciiuDescription || "Sin descripcion"}`
                  : "No configurada"
              }
            />
            <Metric
              label="Grupo RST"
              value={
                groupDetected
                  ? `Grupo ${groupResolution.groupCode}${groupResolution.groupName ? ` - ${groupResolution.groupName}` : ""}`
                  : groupStatusMessage
              }
              accent={groupDetected}
            />
          </div>

          {groupHelpMessage ? (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {groupHelpMessage}
              {groupResolution?.status === "NO_RUT_ACTIVITY" || !rutActivity?.ciiuCode ? (
                <>
                  {" "}
                  <a href="/configuracion/rut-impuestos" className="font-bold underline">
                    Completar RUT
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Datos del bimestre</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Ano
              </span>
              <input
                type="number"
                min="2026"
                value={taxYear}
                onChange={(event) => setTaxYear(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-emerald-500"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Bimestre
              </span>
              <select
                value={periodNumber}
                onChange={(event) => setPeriodNumber(Number(event.target.value))}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-emerald-500"
              >
                {PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Metric label="Ventas del sistema" value={formatCurrency(calculation?.salesGrossIncome)} />
            <Metric label="Ventas incluidas" value={`${includedSales.length}`} />
          </div>

          <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Ver ventas incluidas
            </summary>
            <div className="mt-3 space-y-2">
              {includedSales.length > 0 ? (
                includedSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-3 rounded-lg bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-slate-500">{sale.fiscalDate}</span>
                    <span className="min-w-0 truncate font-medium text-slate-700">
                      {sale.customerName || sale.displayNumber || sale.id}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(sale.subtotal)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs font-medium text-slate-500">
                  Calcula el anticipo para ver las ventas incluidas.
                </p>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
                <span className="font-medium text-slate-500">Subtotal ventas del sistema</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(includedSalesTotal)}
                </span>
              </div>
            </div>
          </details>
        </section>

        <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Liquidacion</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Metric label="Base gravable" value={formatCurrency(calculation?.taxableGrossIncome)} />
            <Metric label="Base UVT" value={`${formatUvt(calculation?.taxableGrossIncomeUvt)} UVT`} />
            <Metric label="Tarifa aplicada" value={formatRate(calculation?.appliedRate)} />
            <Metric label="Impuesto" value={formatCurrency(calculation?.netSimpleTax)} accent />
          </div>

          {appliedBracket ? (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Rango aplicado: {formatUvt(appliedBracket.lowerUvt)} a{" "}
              {appliedBracket.upperUvt === null ? "sin limite" : formatUvt(appliedBracket.upperUvt)} UVT.
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Acciones</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canCalculate || calculating}
              onClick={handleCalculate}
              className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {periodLocked ? "Periodo cerrado" : calculating ? "Calculando..." : "Calcular anticipo"}
            </button>

            <button
              type="button"
              disabled={periodStatus !== "CALCULATED" || !groupDetected || !responsibilityActive || posting}
              onClick={handlePostPeriod}
              className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {posting ? "Presentando..." : "Presentar impuesto"}
            </button>

            <button
              type="button"
              disabled={periodStatus !== "POSTED" || !groupDetected || !responsibilityActive || netSimpleTax <= 0}
              onClick={() => setPaymentOpen(true)}
              className="h-10 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Registrar pago
            </button>
          </div>

          {periodStatus ? (
            <p className="mt-3 text-xs font-medium text-slate-500">Estado actual: {periodStatus}</p>
          ) : null}
        </section>

        {paymentOpen ? (
          <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-blue-950">Registrar pago</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  Medio de pago
                </span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "BANK")}
                  className="h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
                >
                  <option value="BANK">Banco - 111005</option>
                  <option value="CASH">Caja - 110505</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  Fecha de pago
                </span>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  className="h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <label className="mt-3 block space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                Notas / comprobante
              </span>
              <input
                type="text"
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
                className="h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={paying}
                onClick={handlePayPeriod}
                className="h-10 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {paying ? "Registrando..." : `Pagar ${formatCurrency(netSimpleTax)}`}
              </button>
              <button
                type="button"
                onClick={() => setPaymentOpen(false)}
                className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-blue-800 ring-1 ring-blue-100"
              >
                Cancelar
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
