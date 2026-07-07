"use client";

import { ArrowUpRight, ArrowDownRight, Briefcase, Building2, Scale } from "lucide-react";
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
  const simpleTaxProjection = metrics.simpleTaxProjection;
  const hasConfiguredSimpleTax =
    Boolean(simpleTaxProjection?.enabled && simpleTaxProjection.configured);
  const isOpenSimpleTaxEstimate = simpleTaxProjection?.source === "MONTHLY_MIN_RATE";
  const provisionesImpuesto = isOpenSimpleTaxEstimate
    ? Math.abs(Math.round(simpleTaxProjection?.estimatedSimpleTax || 0))
    : hasConfiguredSimpleTax
      ? 0
      : iva + retenciones;

  const utilidadLiquida = hasConfiguredSimpleTax
    ? Math.round(simpleTaxProjection?.netProfitAfterSimpleTax ?? utilidadAntesDeImpuestos - provisionesImpuesto)
    : utilidadAntesDeImpuestos - provisionesImpuesto;

  const reservaLegal = hasConfiguredSimpleTax
    ? 0
    : Math.abs(Math.round(impuestos.fondosReserva || 0));

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

  // ── Porcentajes reales con signo (para texto), sin clamping a cero ────────
  // Calculados directamente desde los valores financieros para mostrar pérdidas
  const rawPctUtilidadBruta             = ventasBrutas > 0 ? Math.round((utilidadBruta             / ventasBrutas) * 100) : 0;
  const rawPctUtilidadOperacional       = ventasBrutas > 0 ? Math.round((utilidadOperacional       / ventasBrutas) * 100) : 0;
  const rawPctUtilidadAntesDeImpuestos  = ventasBrutas > 0 ? Math.round((utilidadAntesDeImpuestos  / ventasBrutas) * 100) : 0;
  const rawPctUtilidadLiquida           = ventasBrutas > 0 ? Math.round((utilidadLiquida           / ventasBrutas) * 100) : 0;
  const rawPctUtilidadDelEjercicio      = ventasBrutas > 0 ? Math.round((utilidadDelEjercicio      / ventasBrutas) * 100) : 0;

  // ─── Sub-componente de fila reutilizable ─────────────────────────────────
  function ProfitRow({
    label,
    value,
    pct,
    isDeduction,
    isResult = false,
  }: {
    label: string;
    value: number;
    pct: number;
    isDeduction: boolean;
    isResult?: boolean;
  }) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isDeduction ? (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                <ArrowDownRight className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            )}
            <span className={cn(
              "text-sm",
              isResult ? "font-semibold text-neutral-900" : "font-medium text-slate-700"
            )}>
              {label}
            </span>
          </div>
          <span className={cn(
            "text-sm tabular-nums",
            isResult ? "font-semibold text-neutral-900" : "font-semibold text-slate-900"
          )}>
            {formatARS(value)}
          </span>
        </div>
        <div className="flex items-center gap-3 w-full mt-1.5">
          <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isDeduction ? "bg-rose-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
            />
          </div>
          <span className="text-slate-400 text-xs font-medium text-right shrink-0 min-w-[40px]">
            {pct}%
          </span>
        </div>
      </div>
    );
  }

  const Divider = () => (
    <div className="border-t border-neutral-100/80 my-3.5 mx-1" />
  );

  return (
    <div className="w-full space-y-6">

      {/* ── 1. Tarjeta: OPERACIÓN COMERCIAL ─────────────────────────────── */}
      <div className="bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm mb-6">
        {/* 1. TÍTULO CON ÍCONO Y FUENTE MÁS GRANDE */}
        <div className="flex items-center gap-2 text-neutral-900 font-bold text-base tracking-wide uppercase mb-5">
          <Briefcase className="w-5 h-5 text-neutral-500" />
          <span>Operación Comercial</span>
        </div>

        {/* 2. CUERPO CON LOS ÍTEMS NORMALES */}
        <div className="space-y-4">
          <ProfitRow label="Ventas Brutas" value={ventasBrutas} pct={100} isDeduction={false} />
          <ProfitRow label="Devoluciones" value={devoluciones} pct={pctDevoluciones} isDeduction={true} />
          <ProfitRow label="Ventas Netas" value={ventasNetas} pct={pctVentasNetas} isDeduction={false} />
          <ProfitRow label="Costos" value={costos} pct={pctCostos} isDeduction={true} />
        </div>

        {/* 3. LÍNEA DE SEPARACIÓN VISIBLE ANTES DE LA UTILIDAD BRUTA */}
        <div className="border-t border-neutral-200 my-4 mx-1" />

        {/* 4. ÍTEM DE UTILIDAD BRUTA CON ÍCONO '=' AZUL */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* ÍCONO IGUAL (=) AZUL */}
              <div className="bg-blue-50 text-blue-600 rounded-xl w-8 h-8 flex items-center justify-center font-bold text-lg">
                =
              </div>
              {/* El texto de la palabra se mantiene en negro como los demás */}
              <span className="text-sm font-semibold text-neutral-900">Utilidad Bruta</span>
            </div>
            {/* El monto de dinero se mantiene en negro/gris original */}
            <span className="text-sm font-bold text-neutral-900">
              {formatARS(utilidadBruta)}
            </span>
          </div>

          {/* BARRA DE PROGRESO AZUL */}
          <div className="flex items-center gap-2 mt-1">
            <div className="w-full bg-neutral-100 h-1 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(rawPctUtilidadBruta, 0)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-neutral-400 w-8 text-right">{rawPctUtilidadBruta}%</span>
          </div>
        </div>
      </div>

      {/* ── 2. Tarjeta: GASTOS ADMINISTRATIVOS ──────────────────────────── */}
      <div className="bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm mb-6">
        {/* 1. TÍTULO CON ÍCONO Y FUENTE MÁS GRANDE */}
        <div className="flex items-center gap-2 text-neutral-900 font-bold text-base tracking-wide uppercase mb-5">
          <Building2 className="w-5 h-5 text-neutral-500" />
          <span>Gastos Administrativos</span>
        </div>

        {/* 2. CUERPO CON LOS ÍTEMS NORMALES */}
        <div className="space-y-4">
          <ProfitRow label="Total Gastos Operacionales" value={totalGastosOperacionales} pct={pctTotalGastosOperacionales} isDeduction={true} />
          <ProfitRow label="Utilidad Operacional"       value={utilidadOperacional}       pct={rawPctUtilidadOperacional}       isDeduction={false} />
          <ProfitRow label="Ingresos No Operacionales"  value={ingresosNoOperacionales}   pct={pctIngresosNoOperacionales}   isDeduction={false} />
          <ProfitRow label="Gastos No Operacionales"    value={gastosNoOperacionales}     pct={pctGastosNoOperacionales}     isDeduction={true}  />
        </div>

        {/* 3. LÍNEA DE SEPARACIÓN ANTES DE UTILIDAD ANTES DE IMPUESTOS */}
        <div className="border-t border-neutral-200 my-4 mx-1" />

        {/* 4. RESULTADO: UTILIDAD ANTES DE IMPUESTOS */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 text-blue-600 rounded-xl w-8 h-8 flex items-center justify-center font-bold text-lg">=</div>
              <span className="text-sm font-semibold text-neutral-900">Utilidad antes de Impuestos</span>
            </div>
            <span className="text-sm font-bold text-neutral-900">
              {formatARS(utilidadAntesDeImpuestos)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-full bg-neutral-100 h-1 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(rawPctUtilidadAntesDeImpuestos, 0)}%` }} 
              />
            </div>
            <span className="text-[10px] font-medium text-neutral-400 w-8 text-right">{rawPctUtilidadAntesDeImpuestos}%</span>
          </div>
        </div>
      </div>

      {/* ── 3. Tarjeta: IMPUESTOS Y RESERVAS ────────────────────────────── */}
      <div className="bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm mb-6">
        {/* 1. TÍTULO CON ÍCONO Y FUENTE MÁS GRANDE */}
        <div className="flex items-center gap-2 text-neutral-900 font-bold text-base tracking-wide uppercase mb-5">
          <Scale className="w-5 h-5 text-neutral-500" />
          <span>Impuestos y Reservas</span>
        </div>

        {/* 2. ÍTEMS NORMALES Y DE FLUJO INTERMEDIO */}
        <div className="space-y-4">
          <ProfitRow label={isOpenSimpleTaxEstimate ? "Régimen Simple estimado" : hasConfiguredSimpleTax ? "RST ya reflejado en contabilidad" : "Provisiones Impuesto de Renta"} value={provisionesImpuesto} pct={pctProvisionesImpuesto} isDeduction={true} />
          <ProfitRow label={isOpenSimpleTaxEstimate ? "Utilidad después de RST" : hasConfiguredSimpleTax ? "Utilidad contable" : "Utilidad Líquida"}              value={utilidadLiquida}       pct={rawPctUtilidadLiquida}        isDeduction={false} />
          {!hasConfiguredSimpleTax && (
            <ProfitRow label="Reserva Legal"                 value={reservaLegal}            pct={pctReservaLegal}           isDeduction={true} />
          )}
        </div>

        {/* 3. LÍNEA DE SEPARACIÓN ANTES DE LA UTILIDAD DEL EJERCICIO */}
        <div className="border-t border-neutral-200 my-4 mx-1" />

        {/* 4. CIERRE FINAL DE LA PÁGINA: UTILIDAD DEL EJERCICIO */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* ÍCONO IGUAL (=) AZUL */}
              <div className="bg-blue-50 text-blue-600 rounded-xl w-8 h-8 flex items-center justify-center font-bold text-lg">
                =
              </div>
              <span className="text-sm font-semibold text-neutral-900">Utilidad del Ejercicio</span>
            </div>
            {/* El monto se mantiene con su estilo y color de texto original */}
            <span className="text-sm font-bold text-neutral-900">
              {formatARS(utilidadDelEjercicio)}
            </span>
          </div>

          {/* BARRA DE PROGRESO AZUL */}
          <div className="flex items-center gap-2 mt-1">
            <div className="w-full bg-neutral-100 h-1 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(rawPctUtilidadDelEjercicio, 0)}%` }} 
              />
            </div>
            <span className="text-[10px] font-medium text-neutral-400 w-8 text-right">{rawPctUtilidadDelEjercicio}%</span>
          </div>
        </div>
      </div>

    </div>
  );
}
