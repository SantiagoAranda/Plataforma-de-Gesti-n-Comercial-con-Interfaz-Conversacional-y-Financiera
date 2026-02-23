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
// app/(app)/movimientos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, CreditCard } from "lucide-react";

// TODO: ajustá estas rutas a tu proyecto
import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";

type BalanceItem = {
  label: string;
  amount: number;
  tone?: "green" | "red" | "orange";
  note?: string;
};

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

  // Cuando animate=false => se muestra instantáneo (útil para SSR o tests)
  // Cuando animate=true => arranca en 0 y transiciona al valor
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
          width: animate ? width : width,
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

export default function MovimientosPage() {
  // Datos demo (reemplazá con tu fuente real)
  const periodo = "Octubre 2023";
  const patrimonio = 125_400;
  const variacionMensual = 0.052;

  const activosTotal = 180_900;
  const pasivosTotal = 55_500;

  const activos: BalanceItem[] = [
    { label: "Bancos y Efectivo", amount: 80_000 },
    { label: "Inventario", amount: 30_500 },
    { label: "Cuentas por Cobrar", amount: 15_400 },
  ];

  const pasivos: BalanceItem[] = [
    { label: "Cuentas por Pagar", amount: 12_000, tone: "red", note: "Vence en 15 días" },
    { label: "Préstamos Bancarios", amount: 35_000, tone: "orange", note: "Largo plazo" },
    { label: "Impuestos", amount: 8_500, tone: "red" },
  ];

  const maxActivo = useMemo(() => Math.max(...activos.map((x) => x.amount), 1), [activos]);
  const maxPasivo = useMemo(() => Math.max(...pasivos.map((x) => x.amount), 1), [pasivos]);

  // Animación on-mount
  const [animateBars, setAnimateBars] = useState(false);

  useEffect(() => {
    // 1 frame para que el DOM pinte en 0, y luego transicione
    const t = requestAnimationFrame(() => setAnimateBars(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="min-h-dvh bg-zinc-50">
      {/* AppHeader (fijo arriba) */}
      <AppHeader
        title="Movimientos"
        subtitle={`Balance General · ${periodo}`}
        showBack={true}
        rightIcon="calendar" // ajustá a tu API real
      />

      {/* Contenido: dejá padding inferior para que no lo tape el bottom nav */}
      <main className="mx-auto max-w-md px-4 pb-28 pt-3">
        {/* Patrimonio Card */}
        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-medium text-zinc-500">Patrimonio Neto</div>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
            {formatMoney(patrimonio)}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-600">
              ↗ +{(variacionMensual * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-zinc-500">vs mes anterior</div>
          </div>
        </div>

        {/* Activos */}
        <div className="mt-6 space-y-4">
          <SectionHeader
            tone="green"
            title="Activos"
            total={activosTotal}
            icon={<Landmark className="h-5 w-5" />}
          />

          <div className="space-y-3">
            {activos.map((x, idx) => (
              <RowCard
                key={x.label}
                label={x.label}
                amount={x.amount}
                tone="green"
                progress={animateBars ? x.amount / maxActivo : 0}
                animate={true}
                delayMs={idx * 90}
              />
            ))}
          </div>

          <button
            type="button"
            className="w-full py-2 text-center text-sm font-semibold text-emerald-600"
          >
            Ver todos los activos ˅
          </button>
        </div>

        {/* Pasivos */}
        <div className="mt-6 space-y-4">
          <SectionHeader
            tone="red"
            title="Pasivos"
            total={pasivosTotal}
            icon={<CreditCard className="h-5 w-5" />}
          />

          <div className="space-y-3">
            {pasivos.map((x, idx) => (
              <RowCard
                key={x.label}
                label={x.label}
                amount={x.amount}
                tone={x.tone ?? "red"}
                note={x.note}
                progress={animateBars ? x.amount / maxPasivo : 0}
                animate={true}
                delayMs={idx * 90}
              />
            ))}
          </div>
        </div>
      </main>

      {/* BottomNavbar (fijo abajo) */}
      <BottomNavbar active="movimientos" />
    </div>
  );
}