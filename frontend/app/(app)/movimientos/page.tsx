// "use client";

// import { useRouter } from "next/navigation";
// import { ArrowUpRight, ArrowDownLeft, ArrowLeft } from "lucide-react";

// const movements = [
//   {
//     id: 1,
//     title: "Venta Servicio Corte de Cabello",
//     subtitle: "14:20 • Pago en efectivo",
//     amount: 2450,
//     type: "income",
//     dateGroup: "Hoy",
//   },
//   {
//     id: 2,
//     title: "Venta Producto Shampoo",
//     subtitle: "11:10 • POS",
//     amount: 5200,
//     type: "income",
//     dateGroup: "Hoy",
//   },
//   {
//     id: 3,
//     title: "Pago Proveedor Insumos",
//     subtitle: "10:30 • Transferencia bancaria",
//     amount: -18900,
//     type: "expense",
//     dateGroup: "Hoy",
//   },
//   {
//     id: 4,
//     title: "Alquiler del Local",
//     subtitle: "18:45 • Débito automático",
//     amount: -120000,
//     type: "expense",
//     dateGroup: "Ayer",
//   },
//   {
//     id: 5,
//     title: "Depósito Cliente Reserva",
//     subtitle: "09:15 • Transferencia",
//     amount: 50000,
//     type: "income",
//     dateGroup: "Ayer",
//   },
//   {
//     id: 6,
//     title: "Servicio Luz",
//     subtitle: "08:00 • Factura mensual",
//     amount: -18450,
//     type: "expense",
//     dateGroup: "Ayer",
//   },
// ];

// export default function MovimientosPage() {
//   const router = useRouter();

//   const grouped = movements.reduce((acc: any, item) => {
//     if (!acc[item.dateGroup]) acc[item.dateGroup] = [];
//     acc[item.dateGroup].push(item);
//     return acc;
//   }, {});

//   const totalIncome = movements
//     .filter((m) => m.amount > 0)
//     .reduce((sum, m) => sum + m.amount, 0);

//   const totalExpense = movements
//     .filter((m) => m.amount < 0)
//     .reduce((sum, m) => sum + m.amount, 0);

//   const balance = totalIncome + totalExpense;

//   const formatCurrency = (value: number) =>
//     value.toLocaleString("es-AR", {
//       style: "currency",
//       currency: "ARS",
//     });

//   return (
//     <div className="min-h-screen bg-neutral-50 pb-12">

//       {/* HEADER */}
//       <div className="bg-green-600 px-5 pt-8 pb-12 text-white rounded-b-3xl shadow-md animate-fade-in">

//         {/* TOP BAR CON BOTÓN BACK */}
//         <div className="flex items-center gap-3">
//           <button
//             onClick={() => router.back()}
//             className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200"
//           >
//             <ArrowLeft className="w-5 h-5" />
//           </button>

//           <div>
//             <h1 className="text-xl font-semibold">Movimientos</h1>
//             <p className="text-sm text-green-100 mt-1">
//               Resumen financiero del negocio
//             </p>
//           </div>
//         </div>

//         {/* BLOQUE RESUMEN */}
//         <div className="mt-6 bg-white text-neutral-800 rounded-2xl p-5 shadow-xl transition-all duration-300 hover:shadow-2xl animate-fade-in-delay">
//           <p className="text-sm text-neutral-500">Saldo actual</p>

//           <p className="text-3xl font-bold mt-1 tracking-tight">
//             {formatCurrency(balance)}
//           </p>

//           <div className="flex justify-between mt-5 text-sm">
//             <div className="transition-transform duration-200 hover:scale-105">
//               <p className="text-neutral-500">Ingresos</p>
//               <p className="text-green-600 font-semibold">
//                 {formatCurrency(totalIncome)}
//               </p>
//             </div>

//             <div className="text-right transition-transform duration-200 hover:scale-105">
//               <p className="text-neutral-500">Egresos</p>
//               <p className="text-red-500 font-semibold">
//                 {formatCurrency(Math.abs(totalExpense))}
//               </p>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* LISTADO */}
//       <div className="px-5 mt-8 space-y-8 animate-fade-in-delay">
//         {Object.entries(grouped).map(([group, items]: any) => (
//           <div key={group}>
//             <h2 className="text-neutral-600 font-semibold mb-4">
//               {group}
//             </h2>

//             <div className="space-y-4">
//               {items.map((item: any) => (
//                 <div
//                   key={item.id}
//                   className="
//                     bg-white
//                     rounded-2xl
//                     p-4
//                     flex
//                     items-center
//                     justify-between
//                     shadow-sm
//                     transition-all
//                     duration-200
//                     hover:shadow-lg
//                     active:scale-[0.98]
//                     cursor-pointer
//                   "
//                 >
//                   <div className="flex items-center gap-4">
//                     <div
//                       className={`
//                         w-12 h-12
//                         rounded-full
//                         flex items-center justify-center
//                         transition-colors duration-200
//                         ${item.amount > 0
//                           ? "bg-green-100 hover:bg-green-200"
//                           : "bg-red-100 hover:bg-red-200"}
//                       `}
//                     >
//                       {item.amount > 0 ? (
//                         <ArrowUpRight className="text-green-600 w-5 h-5" />
//                       ) : (
//                         <ArrowDownLeft className="text-red-500 w-5 h-5" />
//                       )}
//                     </div>

//                     <div>
//                       <p className="font-medium text-neutral-800">
//                         {item.title}
//                       </p>
//                       <p className="text-sm text-neutral-500">
//                         {item.subtitle}
//                       </p>
//                     </div>
//                   </div>

//                   <div
//                     className={`font-semibold text-base ${
//                       item.amount > 0
//                         ? "text-green-600"
//                         : "text-red-500"
//                     }`}
//                   >
//                     {item.amount > 0 ? "+" : "-"}
//                     {formatCurrency(Math.abs(item.amount))}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// app/(app)/movimientos/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  CreditCard,
  Banknote,
  TrendingUp,
  TrendingDown,
  Layers,
} from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import {
  getMovementsProgress,
  type MovementsProgressResponse,
} from "@/src/services/accounting";

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Progress({
  value, // 0..1
  tone = "green",
  animate = false,
  delayMs = 0,
}: {
  value: number;
  tone?: "green" | "red" | "orange";
  animate?: boolean;
  delayMs?: number;
}) {
  const bar = cn(
    "h-2 rounded-full",
    tone === "green" && "bg-emerald-500",
    tone === "red" && "bg-red-500",
    tone === "orange" && "bg-orange-500"
  );

  const width = `${Math.max(0, Math.min(1, value)) * 100}%`;

  return (
    <div className="h-2 w-full rounded-full bg-black/5 overflow-hidden">
      <div
        className={cn(
          bar,
          "will-change-[width]",
          animate ? "transition-[width] duration-700 ease-out" : ""
        )}
        style={{
          width,
          transitionDelay: animate ? `${delayMs}ms` : undefined,
        }}
      />
    </div>
  );
}

function SectionHeader({
  tone,
  title,
  total,
  icon,
}: {
  tone: "green" | "red";
  title: string;
  total: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid h-8 w-8 place-items-center rounded-xl",
            tone === "green"
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-red-500/15 text-red-600"
          )}
        >
          {icon}
        </div>
        <div className="text-lg font-semibold text-zinc-900">{title}</div>
      </div>

      <div
        className={cn(
          "text-lg font-semibold",
          tone === "green" ? "text-emerald-600" : "text-red-600"
        )}
      >
        {formatMoney(total)}
      </div>
    </div>
  );
}

function RowCard({
  label,
  amount,
  tone = "green",
  note,
  progress,
  animate,
  delayMs,
}: {
  label: string;
  amount: number;
  tone?: "green" | "red" | "orange";
  note?: string;
  progress: number; // 0..1
  animate: boolean;
  delayMs: number;
}) {
  const noteColor =
    tone === "green"
      ? "text-emerald-600"
      : tone === "red"
      ? "text-red-600"
      : "text-orange-600";

  return (
    <div className="rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="text-base font-medium text-zinc-900">{label}</div>
        <div className="text-base font-semibold text-zinc-900">
          {formatMoney(amount)}
        </div>
      </div>

      <div className="px-5 pb-5 pt-3">
        <Progress
          value={progress}
          tone={tone}
          animate={animate}
          delayMs={delayMs}
        />
        {note ? (
          <div className={cn("mt-2 text-xs font-medium", noteColor)}>{note}</div>
        ) : null}
      </div>
    </div>
  );
}

type Tone = "green" | "red" | "orange";
type SectionMeta = {
  title: string;
  tone: "green" | "red";
  icon: React.ReactNode;
};

function sectionMeta(
  key: MovementsProgressResponse["sections"][number]["key"]
): SectionMeta {
  switch (key) {
    case "ASSET":
      return { title: "Activos", tone: "green", icon: <Landmark className="h-5 w-5" /> };
    case "LIABILITY":
      return { title: "Pasivos", tone: "red", icon: <CreditCard className="h-5 w-5" /> };
    case "EQUITY":
      return { title: "Patrimonio", tone: "green", icon: <Layers className="h-5 w-5" /> };
    case "INCOME":
      return { title: "Ingresos", tone: "green", icon: <TrendingUp className="h-5 w-5" /> };
    case "EXPENSE":
      return { title: "Gastos", tone: "red", icon: <TrendingDown className="h-5 w-5" /> };
    default:
      return { title: "Otros", tone: "green", icon: <Banknote className="h-5 w-5" /> };
  }
}

/**
 * Acepta string ISO (con o sin hora) o Date.
 * Devuelve "mes año" o "" si no puede parsear.
 */
function formatPeriodo(dateLike?: string | Date | null) {
  if (!dateLike) return "";
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

const MAX_VISIBLE = 3;

function SectionBlock({
  sec,
  animateBars,
}: {
  sec: MovementsProgressResponse["sections"][number];
  animateBars: boolean;
}) {
  const meta = sectionMeta(sec.key);
  const [expanded, setExpanded] = useState(false);

  const itemsSorted = useMemo(() => {
    return sec.items.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [sec.items]);

  const visibleItems = expanded ? itemsSorted : itemsSorted.slice(0, MAX_VISIBLE);

  const max = useMemo(() => Math.max(...itemsSorted.map((x) => Math.abs(x.amount)), 1), [itemsSorted]);

  return (
    <div className="space-y-4">
      <SectionHeader tone={meta.tone} title={meta.title} total={sec.total} icon={meta.icon} />

      <div className="space-y-3">
        {visibleItems.map((x, idx) => {
          const p =
            typeof x.progress === "number" ? x.progress : Math.abs(x.amount) / max;

          const tone: Tone = meta.tone;

          return (
            <RowCard
              key={`${sec.key}-${x.code}`}
              label={x.label}
              amount={x.amount}
              tone={tone}
              progress={animateBars ? p : 0}
              animate={true}
              delayMs={idx * 90}
            />
          );
        })}
      </div>

      {itemsSorted.length > MAX_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className={cn(
            "w-full py-2 text-center text-sm font-semibold",
            meta.tone === "green" ? "text-emerald-600" : "text-red-600"
          )}
        >
          {expanded ? "Ver menos ˄" : `Ver todos (${itemsSorted.length}) ˅`}
        </button>
      )}
    </div>
  );
}

export default function MovimientosPage() {
  const [loading, setLoading] = useState(true);
  const [animateBars, setAnimateBars] = useState(false);
  const [data, setData] = useState<MovementsProgressResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErrorMsg(null);
        const res = await getMovementsProgress();
        setData(res);
      } catch (e: any) {
        console.error(e);
        setData(null);
        setErrorMsg(e?.message ?? "Error al cargar movimientos");
      } finally {
        setLoading(false);
        requestAnimationFrame(() => setAnimateBars(true));
      }
    })();
  }, []);

  const orderedKeys: MovementsProgressResponse["sections"][number]["key"][] = [
    "ASSET",
    "LIABILITY",
    "EQUITY",
    "INCOME",
    "EXPENSE",
    "OTHER",
  ];

  const sections = useMemo(() => {
    const s = data?.sections ?? [];
    const map = new Map(s.map((x) => [x.key, x]));
    return orderedKeys
      .map((k) => map.get(k))
      .filter(Boolean) as MovementsProgressResponse["sections"];
  }, [data]);

  const patrimonioNeto = useMemo(() => {
    const assets = data?.sections?.find((s) => s.key === "ASSET")?.total ?? 0;
    const liabilities = data?.sections?.find((s) => s.key === "LIABILITY")?.total ?? 0;
    return assets - liabilities;
  }, [data]);

  const periodo = useMemo(() => formatPeriodo((data as any)?.date), [data]);

  /**
   * IMPORTANTE:
   * Este endpoint (por tu backend) calcula con POSTED.
   * Si no hay POSTED, sections viene vacío => empty state.
   */
  const hasPostedData = useMemo(() => {
    const secs = data?.sections ?? [];
    return secs.length > 0 && secs.some((s) => (s.items?.length ?? 0) > 0);
  }, [data]);

  return (
    <div className="min-h-dvh bg-zinc-50 overflow-x-hidden">
      <AppHeader
        title="Movimientos"
        subtitle={periodo ? `Balance General · ${periodo}` : "Balance General"}
        showBack={true}
        rightIcon="calendar"
      />

      <main className="mx-auto max-w-md px-4 pb-32 pt-3">
        {/* Patrimonio siempre visible */}
        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-medium text-zinc-500">Patrimonio Neto</div>

          <div className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            {loading ? "—" : formatMoney(patrimonioNeto)}
          </div>

          <div className="mt-4 text-sm text-zinc-500">
            {loading ? "Cargando..." : "Calculado: Activos − Pasivos"}
          </div>
        </div>

        {/* Error */}
        {!loading && errorMsg && (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="text-sm font-semibold text-zinc-900">No se pudo cargar</div>
            <div className="mt-2 text-sm text-zinc-500">{errorMsg}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Empty state: no hay POSTED */}
        {!loading && !errorMsg && !hasPostedData && (
          <div className="mt-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 text-center">
            <div className="text-lg font-semibold text-zinc-900">
              Aún no hay movimientos publicados
            </div>

            <div className="mt-2 text-sm text-zinc-500">
              Esta pantalla muestra el balance con asientos <b>POSTED</b>. Si cargaste en
              Contabilidad pero quedó en <b>DRAFT</b>, no va a aparecer acá hasta postearlo.
            </div>

            <button
              type="button"
              onClick={() => (window.location.href = "/contabilidad")}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition"
            >
              Ir a Contabilidad
            </button>
          </div>
        )}

        {/* Secciones */}
        {!loading && !errorMsg && hasPostedData && (
          <div className="mt-6 space-y-10">
            {sections.map((sec) => (
              <SectionBlock key={sec.key} sec={sec} animateBars={animateBars} />
            ))}
          </div>
        )}
      </main>

      <BottomNavbar active="movimientos" />
    </div>
  );
}