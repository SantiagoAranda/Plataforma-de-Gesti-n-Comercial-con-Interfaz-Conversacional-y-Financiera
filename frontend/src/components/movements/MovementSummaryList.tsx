"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { AccountingSummary } from "@/src/services/accounting";

function formatARS(v: number) {
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

type MovementSummaryListProps = {
  metrics: AccountingSummary;
};

export function MovementSummaryList({ metrics }: MovementSummaryListProps) {
  // 1. Pre-procesamiento de Valores Redondeados en Cadena
  const operacion = metrics?.operacionComercial || {
    ventasNetas: 0,
    costosMercancia: 0,
    utilidadBruta: 0,
    devoluciones: 0,
  };

  const gastos = metrics?.gastosAdministrativos || {
    nominaSueldos: 0,
    insumosOperativos: 0,
    serviciosFijos: 0,
  };

  const impuestos = metrics?.impuestosReservas || {
    iva: 0,
    retenciones: 0,
    fondosReserva: 0,
  };

  const ventasNetasRaw = Math.round(operacion.ventasNetas || 0);
  const devoluciones = Math.abs(Math.round(operacion.devoluciones || 0));
  const ventasBrutas = ventasNetasRaw + devoluciones; // El 100% universal
  const ventasNetas = ventasBrutas - devoluciones; // Debe dar el valor neto real

  const costos = Math.abs(Math.round(operacion.costosMercancia || 0));
  const utilidadBruta = ventasNetas - costos;

  // --- ESCUDO DEFENSIVO DE VALORES ABSOLUTOS ---
  const nominaSueldos = Math.abs(Math.round(gastos.nominaSueldos || 0));
  const insumosOperativos = Math.abs(Math.round(gastos.insumosOperativos || 0));
  const serviciosFijos = Math.abs(Math.round(gastos.serviciosFijos || 0));
  const totalGastosOperacionales = nominaSueldos + insumosOperativos + serviciosFijos;

  const utilidadOperacional = utilidadBruta - totalGastosOperacionales;

  const ingresosNoOperacionales = Math.abs(Math.round((metrics as any)?.ingresosNoOperacionales || 0));
  const gastosNoOperacionales = Math.abs(Math.round((metrics as any)?.gastosNoOperacionales || 0));
  const utilidadAntesDeImpuestos = utilidadOperacional + ingresosNoOperacionales - gastosNoOperacionales;

  const iva = Math.abs(Math.round(impuestos.iva || 0));
  const retenciones = Math.abs(Math.round(impuestos.retenciones || 0));
  const provisionesImpuesto = iva + retenciones;

  const utilidadLiquida = utilidadAntesDeImpuestos - provisionesImpuesto;

  const reservaLegal = Math.abs(Math.round(impuestos.fondosReserva || 0));

  // ¡AQUÍ SE CLAVA EL CIERRE CONSTANTE!
  const utilidadDelEjercicio = utilidadLiquida - reservaLegal;

  // 2. Helper function to calculate percentage relative to Ventas Brutas
  const calcularPorcentajeValor = (valorItem: number) => {
    if (ventasBrutas <= 0) return 0;
    const pct = (valorItem / ventasBrutas) * 100;
    return Math.min(Math.max(Math.round(pct), 0), 100); // Acotado seguro entre 0 y 100
  };

  // 3. Recálculo del Análisis Vertical por Arrastre
  const pctDevoluciones = calcularPorcentajeValor(devoluciones);
  const pctVentasNetas = Math.min(Math.max(100 - pctDevoluciones, 0), 100);
  const pctCostos = calcularPorcentajeValor(costos);
  const pctUtilidadBruta = Math.min(Math.max(pctVentasNetas - pctCostos, 0), 100);
  const pctTotalGastosOperacionales = calcularPorcentajeValor(totalGastosOperacionales);
  const pctUtilidadOperacional = Math.min(Math.max(pctUtilidadBruta - pctTotalGastosOperacionales, 0), 100);
  const pctIngresosNoOperacionales = calcularPorcentajeValor(ingresosNoOperacionales);
  const pctGastosNoOperacionales = calcularPorcentajeValor(gastosNoOperacionales);
  const pctUtilidadAntesDeImpuestos = Math.min(
    Math.max(pctUtilidadOperacional + pctIngresosNoOperacionales - pctGastosNoOperacionales, 0),
    100
  );
  const pctProvisionesImpuesto = calcularPorcentajeValor(provisionesImpuesto);
  const pctUtilidadLiquida = Math.min(Math.max(pctUtilidadAntesDeImpuestos - pctProvisionesImpuesto, 0), 100);
  const pctReservaLegal = calcularPorcentajeValor(reservaLegal);
  const pctUtilidadDelEjercicio = Math.min(Math.max(pctUtilidadLiquida - pctReservaLegal, 0), 100);

  // 4. Define the sequential rows
  const rows = [
    {
      label: "Ventas Brutas",
      value: ventasBrutas,
      isDeduction: false,
      pct: 100,
    },
    {
      label: "Devoluciones",
      value: devoluciones,
      isDeduction: true,
      pct: pctDevoluciones,
    },
    {
      label: "Ventas Netas",
      value: ventasNetas,
      isDeduction: false,
      pct: pctVentasNetas,
    },
    {
      label: "Costos",
      value: costos,
      isDeduction: true,
      pct: pctCostos,
    },
    {
      label: "Utilidad Bruta",
      value: utilidadBruta,
      isDeduction: false,
      pct: pctUtilidadBruta,
    },
    {
      label: "Total Gastos Operacionales",
      value: totalGastosOperacionales,
      isDeduction: true,
      pct: pctTotalGastosOperacionales,
    },
    {
      label: "Utilidad Operacional",
      value: utilidadOperacional,
      isDeduction: false,
      pct: pctUtilidadOperacional,
    },
    {
      label: "Ingresos No Operacionales",
      value: ingresosNoOperacionales,
      isDeduction: false,
      pct: pctIngresosNoOperacionales,
    },
    {
      label: "Gastos No Operacionales",
      value: gastosNoOperacionales,
      isDeduction: true,
      pct: pctGastosNoOperacionales,
    },
    {
      label: "Utilidad antes de Impuestos",
      value: utilidadAntesDeImpuestos,
      isDeduction: false,
      pct: pctUtilidadAntesDeImpuestos,
    },
    {
      label: "Provisiones Impuesto de Renta",
      value: provisionesImpuesto,
      isDeduction: true,
      pct: pctProvisionesImpuesto,
    },
    {
      label: "Utilidad Líquida",
      value: utilidadLiquida,
      isDeduction: false,
      pct: pctUtilidadLiquida,
    },
    {
      label: "Reserva Legal",
      value: reservaLegal,
      isDeduction: true,
      pct: pctReservaLegal,
    },
    {
      label: "Utilidad del Ejercicio",
      value: utilidadDelEjercicio,
      isDeduction: false,
      pct: pctUtilidadDelEjercicio,
    },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Main single P&L container block */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-slate-500 text-xs tracking-wider font-semibold uppercase mb-6">
          ESTADO DE RESULTADOS (P&L)
        </h3>

        <div className="space-y-5">
          {rows.map((row, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between">
                {/* Left side: Mini-Icon + Concept label */}
                <div className="flex items-center gap-3">
                  {row.isDeduction ? (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                      <ArrowDownRight className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  )}
                  <span className="text-slate-700 text-sm font-medium">
                    {row.label}
                  </span>
                </div>

                {/* Right side: Formatted Amount */}
                <span className="text-slate-900 text-sm font-semibold">
                  {formatARS(row.value)}
                </span>
              </div>

              {/* Progress bar and inline percentage */}
              <div className="flex items-center gap-3 w-full mt-1.5">
                <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      row.isDeduction ? "bg-rose-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(Math.max(row.pct, 0), 100)}%` }}
                  />
                </div>
                <span className="text-slate-400 text-xs font-medium text-right shrink-0 min-w-[40px]">
                  {row.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
