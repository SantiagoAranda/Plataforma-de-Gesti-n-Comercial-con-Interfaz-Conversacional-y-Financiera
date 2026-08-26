import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { AccountingSummary } from "@/src/services/accounting";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";
import { useFeatureFlags } from "@/src/hooks/useFeatureFlags";

export function MovementProfitHero({
  metrics,
  description,
  title = "Resultado del período",
}: {
  metrics: AccountingSummary;
  description?: string;
  title?: string;
}) {
  const { taxSettingsEnabled } = useTaxSettings();
  const { simpleRegimeTaxModuleEnabled } = useFeatureFlags();
  // 1. Unificación de Valores Base (Copia fiel de la Cascada Inferior)
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

  // --- ESCUDO DEFENSIVO DE VALORES ABSOLUTOS ---
  const nominaSueldos = Math.abs(Math.round(gastos.nominaSueldos || 0));
  const insumosOperativos = Math.abs(Math.round(gastos.insumosOperativos || 0));
  const serviciosFijos = Math.abs(Math.round(gastos.serviciosFijos || 0));
  const totalGastosOperacionales = nominaSueldos + insumosOperativos + serviciosFijos;

  const ingresosNoOperacionales = Math.abs(Math.round((metrics as any)?.ingresosNoOperacionales || 0));
  const gastosNoOperacionales = Math.abs(Math.round((metrics as any)?.gastosNoOperacionales || 0));
  const utilidadOperacional = ventasNetas - costos - totalGastosOperacionales;
  const utilidadAntesDeImpuestos = utilidadOperacional + ingresosNoOperacionales - gastosNoOperacionales;

  const iva = Math.abs(Math.round(impuestos.iva || 0));
  const retenciones = Math.abs(Math.round(impuestos.retenciones || 0));
  const simpleTaxProjection = simpleRegimeTaxModuleEnabled ? metrics.simpleTaxProjection : undefined;
  const hasConfiguredSimpleTax =
    Boolean(taxSettingsEnabled && simpleTaxProjection?.enabled && simpleTaxProjection.configured);
  const isOpenSimpleTaxEstimate = Boolean(taxSettingsEnabled && simpleTaxProjection?.source === "MONTHLY_MIN_RATE");
  const provisionesImpuesto = isOpenSimpleTaxEstimate
    ? Math.abs(Math.round(simpleTaxProjection?.estimatedSimpleTax || 0))
    : hasConfiguredSimpleTax
      ? Math.abs(Math.round(simpleTaxProjection?.estimatedSimpleTax || 0))
      : iva + retenciones;

  const utilidadLiquida = hasConfiguredSimpleTax
    ? Math.round(simpleTaxProjection?.netProfitAfterSimpleTax ?? utilidadAntesDeImpuestos - provisionesImpuesto)
    : utilidadAntesDeImpuestos - provisionesImpuesto;
  const reservaLegal = hasConfiguredSimpleTax
    ? 0
    : Math.abs(Math.round(impuestos.fondosReserva || 0));

  // MONTO PRINCIPAL DESTACADO EN LA TARJETA
  const utilidadDelEjercicioFinal = utilidadLiquida - reservaLegal;

  const positive = utilidadDelEjercicioFinal > 0;
  const neutral = utilidadDelEjercicioFinal === 0;

  const formattedAmount = utilidadDelEjercicioFinal.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

  const isZero = ventasBrutas <= 0;

  // Re-mapeo Lógico de los Tramos del Gráfico
  // Cada segmento se calcula como porcentaje sobre ventasBrutas (el 100% base)
  // y se garantiza que la suma de segmentos no supere 100%.
  const rawPctVerde = isZero ? 0 : Math.max((utilidadDelEjercicioFinal / ventasBrutas) * 100, 0);
  const rawPctAmarillo = isZero ? 0 : Math.max((reservaLegal / ventasBrutas) * 100, 0);
  // El rojo ocupa lo que no es ganancia ni reserva (lo gastado real)
  // pero jamás supera el espacio restante en la barra (100% - verde - amarillo)
  const totalDeduccionesYGastos = devoluciones + costos + totalGastosOperacionales + gastosNoOperacionales + provisionesImpuesto;
  const rawPctRojo = isZero ? 0 : Math.max((totalDeduccionesYGastos / ventasBrutas) * 100, 0);

  // Clampear cada segmento y luego asegurar que la suma no supere 100
  const widthVerde = isZero ? 0 : Math.min(Math.round(rawPctVerde), 100);
  const widthAmarillo = isZero ? 0 : Math.min(Math.round(rawPctAmarillo), Math.max(0, 100 - widthVerde));
  const widthRojo = isZero ? 0 : Math.min(Math.round(rawPctRojo), Math.max(0, 100 - widthVerde - widthAmarillo));

  const eficienciaReal = ventasBrutas > 0
    ? Math.round((utilidadDelEjercicioFinal / ventasBrutas) * 100)
    : 0;

  return (
    <div className="rounded-3xl p-6 bg-white border border-slate-100 text-slate-900 shadow-sm">
      {/* Top Section */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-slate-500 text-xs font-medium tracking-wider uppercase">
            GANANCIA NETA
          </div>
          <div className="text-slate-900 text-3xl font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
            {formattedAmount}
          </div>
        </div>

        {/* Right Icon Container */}
        <div className={cn(
          "p-3 rounded-full bg-slate-50",
          positive ? "text-emerald-500" : neutral ? "text-slate-500" : "text-rose-500"
        )}>
          {positive ? (
            <TrendingUp className="h-6 w-6" />
          ) : neutral ? (
            <TrendingUp className="h-6 w-6" />
          ) : (
            <TrendingDown className="h-6 w-6" />
          )}
        </div>
      </div>

      {/* Distribution Flow Section */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 text-[10px] font-medium tracking-wider">
            DISTRIBUCIÓN DE FLUJO
          </span>
          <span className="text-emerald-600 font-medium text-xs">
            EFICIENCIA: {ventasBrutas > 0 ? `${eficienciaReal}%` : "--%"}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full bg-slate-100 rounded-full flex overflow-hidden mt-2">
          {widthVerde > 0 && (
            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${widthVerde}%` }} />
          )}
          {widthRojo > 0 && (
            <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${widthRojo}%` }} />
          )}
          {widthAmarillo > 0 && (
            <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${widthAmarillo}%` }} />
          )}
        </div>

        {/* Legends */}
        <div className="mt-2.5 flex items-center gap-x-4 text-slate-600 text-[11px] font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
            <span>Ganancia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-rose-500 shrink-0" />
            <span>Gastos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
            <span>Legal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
