"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import {
  calculateSimpleTaxPeriod,
  getSimpleTaxConfig,
  listSimpleTaxPeriods,
  type SimpleTaxCalculation,
  type SimpleTaxConfig,
  type SimpleTaxPeriod,
} from "@/src/lib/simple-tax/api";

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

function parseNumber(value: string) {
  const parsed = Number(value.replace(/\$/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
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
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
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
  const [manualGrossIncome, setManualGrossIncome] = useState("0");
  const [excludedIncome, setExcludedIncome] = useState("0");
  const [electronicPaymentsIncome, setElectronicPaymentsIncome] = useState("0");
  const [pensionContributionsDiscount, setPensionContributionsDiscount] = useState("0");
  const [calculation, setCalculation] = useState<SimpleTaxCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const year = Number(taxYear) || 2026;
        const [loadedConfig, loadedPeriods] = await Promise.all([
          getSimpleTaxConfig().catch(() => null),
          listSimpleTaxPeriods(year).catch(() => []),
        ]);
        setConfig(loadedConfig);
        setPeriods(loadedPeriods);
        if (loadedConfig?.taxYear) setTaxYear(String(loadedConfig.taxYear));
      } catch (err: any) {
        setError(err.message || "No se pudo cargar Regimen Simple.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

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
    if (!selectedStoredPeriod) return;

    setManualGrossIncome(String(selectedStoredPeriod.manualGrossIncome ?? 0));
    setExcludedIncome(String(selectedStoredPeriod.excludedIncome ?? 0));
    setElectronicPaymentsIncome(String(selectedStoredPeriod.electronicPaymentsIncome ?? 0));
    setPensionContributionsDiscount(String(selectedStoredPeriod.pensionContributionsDiscount ?? 0));
    setCalculation(selectedStoredPeriod);
  }, [selectedStoredPeriod?.id]);

  const appliedBracket =
    calculation?.bracket ?? calculation?.calculationSnapshot?.bracket ?? null;

  const handleCalculate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCalculating(true);
    setError(null);

    try {
      const result = await calculateSimpleTaxPeriod({
        taxYear: Number(taxYear) || 2026,
        periodNumber,
        manualGrossIncome: parseNumber(manualGrossIncome),
        excludedIncome: parseNumber(excludedIncome),
        electronicPaymentsIncome: parseNumber(electronicPaymentsIncome),
        pensionContributionsDiscount: parseNumber(pensionContributionsDiscount),
      });
      setCalculation(result);
      setPeriods((prev) => [
        ...prev.filter((period) => period.id !== result.id),
        result as SimpleTaxPeriod,
      ]);
    } catch (err: any) {
      setError(err.message || "No se pudo calcular el anticipo RST.");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8 text-slate-950">
      <AppHeader
        title="Regimen Simple"
        subtitle="Anticipo bimestral estimado"
        showBack
      />

      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 pt-4">
        {loading ? (
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            Cargando configuracion...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {!config?.enabled ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Activa la responsabilidad 47 y configura el grupo RST en RUT Digital antes de cerrar periodos.
          </div>
        ) : null}

        <form onSubmit={handleCalculate} className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Datos del bimestre
            </h2>

            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Ano
                </span>
                <input
                  type="number"
                  min="2026"
                  value={taxYear}
                  onChange={(event) => setTaxYear(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Bimestre
                </span>
                <select
                  value={periodNumber}
                  onChange={(event) => setPeriodNumber(Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                >
                  {PERIODS.map((period) => (
                    <option key={period.value} value={period.value}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Ingresos manuales
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={manualGrossIncome}
                onChange={(event) => setManualGrossIncome(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Ingresos excluidos
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={excludedIncome}
                onChange={(event) => setExcludedIncome(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Ingresos por pagos electronicos
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={electronicPaymentsIncome}
                onChange={(event) => setElectronicPaymentsIncome(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Aportes pension empleador
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={pensionContributionsDiscount}
                onChange={(event) => setPensionContributionsDiscount(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
              />
            </label>

            <button
              type="submit"
              disabled={calculating}
              className="h-11 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {calculating ? "Calculando..." : "Calcular anticipo"}
            </button>
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Configuracion
              </div>
              <div className="mt-1 text-sm font-medium text-slate-700">
                Grupo {config?.groupCode || "sin configurar"}
                {config?.activityLabel ? ` - ${config.activityLabel}` : ""}
              </div>
            </div>

            {calculation ? (
              <>
                {calculation.warnings?.length ? (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {calculation.warnings.join(" ")}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Ventas del sistema" value={formatCurrency(calculation.salesGrossIncome)} />
                  <Metric label="Base gravable" value={formatCurrency(calculation.taxableGrossIncome)} />
                  <Metric label="Base UVT" value={calculation.taxableGrossIncomeUvt.toLocaleString("es-CO")} />
                  <Metric label="Tarifa aplicada" value={formatRate(calculation.appliedRate)} />
                  <Metric label="Impuesto bruto" value={formatCurrency(calculation.grossSimpleTax)} />
                  <Metric label="Descuento pagos electronicos" value={formatCurrency(calculation.electronicPaymentsDiscount)} />
                  <Metric label="Descuento pension" value={formatCurrency(calculation.pensionContributionsDiscount)} />
                  <Metric label="Impuesto neto" value={formatCurrency(calculation.netSimpleTax)} accent />
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Rango aplicado
                  </div>
                  {appliedBracket ? (
                    <div className="mt-2 text-sm font-medium text-slate-700">
                      {formatUvt(appliedBracket.lowerUvt)} a{" "}
                      {appliedBracket.upperUvt === null
                        ? "sin limite"
                        : formatUvt(appliedBracket.upperUvt)}{" "}
                      UVT - {formatRate(appliedBracket.rate)}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm font-medium text-slate-700">
                        Rango no disponible
                      </p>
                      <p className="text-xs font-medium text-slate-500">
                        Recalcular para ver el rango aplicado.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Ingresa los valores del bimestre para calcular el anticipo.
              </div>
            )}
          </section>
        </form>
      </main>
    </div>
  );
}
