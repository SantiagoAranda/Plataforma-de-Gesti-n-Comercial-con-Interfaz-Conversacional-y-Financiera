"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowDownLeft, ArrowLeft } from "lucide-react";

const movements = [
  {
    id: 1,
    title: "Venta Servicio Corte de Cabello",
    subtitle: "14:20 • Pago en efectivo",
    amount: 2450,
    type: "income",
    dateGroup: "Hoy",
  },
  {
    id: 2,
    title: "Venta Producto Shampoo",
    subtitle: "11:10 • POS",
    amount: 5200,
    type: "income",
    dateGroup: "Hoy",
  },
  {
    id: 3,
    title: "Pago Proveedor Insumos",
    subtitle: "10:30 • Transferencia bancaria",
    amount: -18900,
    type: "expense",
    dateGroup: "Hoy",
  },
  {
    id: 4,
    title: "Alquiler del Local",
    subtitle: "18:45 • Débito automático",
    amount: -120000,
    type: "expense",
    dateGroup: "Ayer",
  },
  {
    id: 5,
    title: "Depósito Cliente Reserva",
    subtitle: "09:15 • Transferencia",
    amount: 50000,
    type: "income",
    dateGroup: "Ayer",
  },
  {
    id: 6,
    title: "Servicio Luz",
    subtitle: "08:00 • Factura mensual",
    amount: -18450,
    type: "expense",
    dateGroup: "Ayer",
  },
];

export default function MovimientosPage() {
  const router = useRouter();

  const grouped = movements.reduce((acc: any, item) => {
    if (!acc[item.dateGroup]) acc[item.dateGroup] = [];
    acc[item.dateGroup].push(item);
    return acc;
  }, {});

  const totalIncome = movements
    .filter((m) => m.amount > 0)
    .reduce((sum, m) => sum + m.amount, 0);

  const totalExpense = movements
    .filter((m) => m.amount < 0)
    .reduce((sum, m) => sum + m.amount, 0);

  const balance = totalIncome + totalExpense;

  const formatCurrency = (value: number) =>
    value.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });

  return (
    <div className="min-h-screen bg-neutral-50 pb-12">

      {/* HEADER */}
      <div className="bg-green-600 px-5 pt-8 pb-12 text-white rounded-b-3xl shadow-md animate-fade-in">

        {/* TOP BAR CON BOTÓN BACK */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-xl font-semibold">Movimientos</h1>
            <p className="text-sm text-green-100 mt-1">
              Resumen financiero del negocio
            </p>
          </div>
        </div>

        {/* BLOQUE RESUMEN */}
        <div className="mt-6 bg-white text-neutral-800 rounded-2xl p-5 shadow-xl transition-all duration-300 hover:shadow-2xl animate-fade-in-delay">
          <p className="text-sm text-neutral-500">Saldo actual</p>

          <p className="text-3xl font-bold mt-1 tracking-tight">
            {formatCurrency(balance)}
          </p>

          <div className="flex justify-between mt-5 text-sm">
            <div className="transition-transform duration-200 hover:scale-105">
              <p className="text-neutral-500">Ingresos</p>
              <p className="text-green-600 font-semibold">
                {formatCurrency(totalIncome)}
              </p>
            </div>

            <div className="text-right transition-transform duration-200 hover:scale-105">
              <p className="text-neutral-500">Egresos</p>
              <p className="text-red-500 font-semibold">
                {formatCurrency(Math.abs(totalExpense))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* LISTADO */}
      <div className="px-5 mt-8 space-y-8 animate-fade-in-delay">
        {Object.entries(grouped).map(([group, items]: any) => (
          <div key={group}>
            <h2 className="text-neutral-600 font-semibold mb-4">
              {group}
            </h2>

            <div className="space-y-4">
              {items.map((item: any) => (
                <div
                  key={item.id}
                  className="
                    bg-white
                    rounded-2xl
                    p-4
                    flex
                    items-center
                    justify-between
                    shadow-sm
                    transition-all
                    duration-200
                    hover:shadow-lg
                    active:scale-[0.98]
                    cursor-pointer
                  "
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`
                        w-12 h-12
                        rounded-full
                        flex items-center justify-center
                        transition-colors duration-200
                        ${item.amount > 0
                          ? "bg-green-100 hover:bg-green-200"
                          : "bg-red-100 hover:bg-red-200"}
                      `}
                    >
                      {item.amount > 0 ? (
                        <ArrowUpRight className="text-green-600 w-5 h-5" />
                      ) : (
                        <ArrowDownLeft className="text-red-500 w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <p className="font-medium text-neutral-800">
                        {item.title}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`font-semibold text-base ${
                      item.amount > 0
                        ? "text-green-600"
                        : "text-red-500"
                    }`}
                  >
                    {item.amount > 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(item.amount))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
