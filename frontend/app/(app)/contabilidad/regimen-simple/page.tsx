"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import {
  calculateSimpleTaxPeriod,
  getSimpleTaxConfig,
  listSimpleTaxPeriods,
  paySimpleTaxPeriod,
  postSimpleTaxPeriod,
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

function validateNonNegative(label: string, value: number) {
  if (value < 0) return `${label} no puede ser negativo.`;
  return null;
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
  const [posting, setPosting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK">("BANK");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");

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
    if (!selectedStoredPeriod) {
      setCalculation(null);
      setManualGrossIncome("0");
      setExcludedIncome("0");
      setElectronicPaymentsIncome("0");
      setPensionContributionsDiscount("0");
      return;
    }

    setManualGrossIncome(String(selectedStoredPeriod.manualGrossIncome ?? 0));
    setExcludedIncome(String(selectedStoredPeriod.excludedIncome ?? 0));
    setElectronicPaymentsIncome(String(selectedStoredPeriod.electronicPaymentsIncome ?? 0));
    setPensionContributionsDiscount(String(selectedStoredPeriod.pensionContributionsDiscount ?? 0));
    setCalculation(selectedStoredPeriod);
  }, [selectedStoredPeriod?.id]);

  const appliedBracket =
    calculation?.bracket ?? calculation?.calculationSnapshot?.bracket ?? null;
  const includedSales =
    calculation?.includedSales ?? calculation?.calculationSnapshot?.includedSales ?? [];
  const includedSalesTotal = includedSales.reduce(
    (total, sale) => total + Number(sale.subtotal ?? 0),
    0,
  );
  const periodStatus = calculation?.status;
  const periodLocked = periodStatus === "POSTED" || periodStatus === "PAID";
  const isAnnualException = config?.filingMode === "ANNUAL_EXCEPTION";
  const netSimpleTax = Number(calculation?.netSimpleTax ?? 0);
  const paymentAccountCode = paymentMethod === "CASH" ? "110505" : "111005";

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
    setPeriods((prev) => [
      ...prev.filter((item) => item.id !== period.id),
      period,
    ]);
  };

  const handleCalculate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCalculating(true);
    setError(null);

    try {
      if (periodLocked) {
        throw new Error("El periodo ya esta cerrado y no puede recalcularse.");
      }

      if (!config?.enabled || !config.groupCode) {
        throw new Error("Configura el grupo RST en RUT Digital antes de calcular.");
      }

      const manualAmount = parseNumber(manualGrossIncome);
      const excludedAmount = parseNumber(excludedIncome);
      const electronicAmount = parseNumber(electronicPaymentsIncome);
      const pensionAmount = parseNumber(pensionContributionsDiscount);
      const validationError =
        validateNonNegative("Ingresos manuales", manualAmount) ??
        validateNonNegative("Ingresos excluidos", excludedAmount) ??
        validateNonNegative("Ingresos por pagos electronicos", electronicAmount) ??
        validateNonNegative("Aportes pension empleador", pensionAmount);

      if (validationError) throw new Error(validationError);

      const estimatedSalesIncome = Number(calculation?.salesGrossIncome ?? 0);
      const estimatedTaxableIncome = Math.max(
        estimatedSalesIncome + manualAmount - excludedAmount,
        0,
      );
      if (calculation && electronicAmount > estimatedTaxableIncome) {
        throw new Error(
          "Los ingresos por pagos electronicos no pueden superar la base gravable estimada.",
        );
      }

      const result = await calculateSimpleTaxPeriod({
        taxYear: Number(taxYear) || 2026,
        periodNumber,
        manualGrossIncome: manualAmount,
        excludedIncome: excludedAmount,
        electronicPaymentsIncome: electronicAmount,
        pensionContributionsDiscount: pensionAmount,
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

  const handlePostPeriod = async () => {
    if (!calculation?.id) return;
    setPosting(true);
    setError(null);

    try {
      if (isAnnualException) {
        throw new Error("Este negocio esta configurado con modalidad anual. El bimestre es informativo y no genera presentacion ni asiento contable.");
      }
      const posted = await postSimpleTaxPeriod(calculation.id);
      mergePeriod(posted);
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
      if (isAnnualException) {
        throw new Error("Este negocio esta configurado con modalidad anual. No permite pago bimestral.");
      }
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
    } catch (err: any) {
      setError(err.message || "No se pudo registrar el pago RST.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8 text-slate-950">
      <AppHeader
        title="Regimen Simple"
        subtitle={isAnnualException ? "Calculo informativo anual" : "Anticipo bimestral estimado"}
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

        {config?.enabled && isAnnualException ? (
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <span className="font-semibold">Modalidad anual.</span>{" "}
            Este periodo se muestra solo como calculo informativo y no genera asiento bimestral.
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
                disabled={periodLocked}
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
                disabled={periodLocked}
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
                disabled={periodLocked}
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
                disabled={periodLocked}
                onChange={(event) => setPensionContributionsDiscount(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
              />
            </label>

            <button
              type="submit"
              disabled={calculating || periodLocked}
              className="h-11 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {periodLocked ? "Periodo cerrado" : calculating ? "Calculando..." : "Calcular anticipo"}
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
              {config?.enabled ? (
                <div className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {isAnnualException ? "Modalidad anual" : "Anticipos bimestrales"}
                </div>
              ) : null}
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

                <details className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                    Ventas incluidas en el bimestre
                  </summary>
                  <div className="mt-3 space-y-2">
                    {includedSales.length > 0 ? (
                      includedSales.map((sale) => (
                        <div
                          key={sale.id}
                          className="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-slate-500">
                            {sale.fiscalDate}
                          </span>
                          <span className="min-w-0 truncate font-medium text-slate-700">
                            {sale.customerName || sale.displayNumber || sale.id}
                          </span>
                          <span className="font-semibold text-slate-800">
                            {formatCurrency(sale.subtotal)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                        No hay ventas del sistema incluidas en este bimestre.
                      </p>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                      <span className="font-medium text-slate-500">
                        Total ventas del sistema
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(includedSalesTotal)}
                      </span>
                    </div>
                  </div>
                </details>

                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Estado contable
                  </div>

                  {isAnnualException ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-semibold text-sky-700">
                        Calculo informativo
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        Este periodo no genera asiento bimestral porque el negocio esta configurado con modalidad anual.
                      </p>
                    </div>
                  ) : null}

                  {!isAnnualException && (periodStatus === "CALCULATED" || !periodStatus) ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm font-medium text-slate-600">
                        Esto registrara el gasto y el impuesto por pagar en Contabilidad.
                      </p>
                      <button
                        type="button"
                        disabled={posting || !calculation.id}
                        onClick={handlePostPeriod}
                        className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {posting ? "Presentando..." : "Presentar impuesto"}
                      </button>
                    </div>
                  ) : null}

                  {!isAnnualException && periodStatus === "POSTED" ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Periodo cerrado
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        Impuesto simple por pagar: {formatCurrency(netSimpleTax)}
                      </p>
                      {netSimpleTax > 0 ? (
                        <button
                          type="button"
                          onClick={() => setPaymentOpen(true)}
                          className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
                        >
                          Registrar pago del impuesto
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-slate-500">
                          No requiere pago porque el impuesto neto es cero.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {!isAnnualException && periodStatus === "PAID" ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-semibold text-emerald-700">
                        Impuesto pagado
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        Fecha: {calculation.paidAt ? String(calculation.paidAt).slice(0, 10) : "No disponible"}
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        Valor: {formatCurrency(calculation.paidAmount)}
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        Cuenta: {calculation.paymentAccountCode || "No disponible"}
                      </p>
                    </div>
                  ) : null}
                </div>

                {paymentOpen && !isAnnualException ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-emerald-950">
                      Registrar pago del impuesto
                    </h3>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Medio de pago
                        </span>
                        <select
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "BANK")}
                          className="h-10 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500"
                        >
                          <option value="BANK">Transferencia/Banco - 111005</option>
                          <option value="CASH">Efectivo - 110505</option>
                        </select>
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Fecha de pago
                        </span>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(event) => setPaymentDate(event.target.value)}
                          className="h-10 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500"
                        />
                      </label>
                    </div>

                    <label className="mt-3 block space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Valor a pagar
                      </span>
                      <input
                        type="text"
                        value={formatCurrency(netSimpleTax)}
                        disabled
                        className="h-10 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm font-medium text-slate-500 outline-none"
                      />
                    </label>

                    <label className="mt-3 block space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Notas
                      </span>
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={(event) => setPaymentNotes(event.target.value)}
                        className="h-10 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500"
                      />
                    </label>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={handlePayPeriod}
                        disabled={paying}
                        className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {paying ? "Registrando..." : "Confirmar pago"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentOpen(false)}
                        className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
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
