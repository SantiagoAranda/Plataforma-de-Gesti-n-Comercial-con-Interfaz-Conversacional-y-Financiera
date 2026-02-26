"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type OrderItem = {
  id: string;
  itemNameSnapshot: string;
  quantity: number;
  lineTotal: number;
};

type Order = {
  id: string;
  status: string;
  total: number;
  items: OrderItem[];
};

export default function OrderPage() {
  const { token } = useParams<{ token: string }>();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = async () => {
    const res = await fetch(
      `http://localhost:3001/public/order/${token}`
    );
    const data = await res.json();
    setOrder(data);
    setLoading(false);
  };

  useEffect(() => {
    if (token) fetchOrder();
  }, [token]);

  const updateStatus = async (action: "confirm" | "cancel") => {
    await fetch(
      `http://localhost:3001/public/order/${token}/${action}`,
      { method: "PATCH" }
    );

    fetchOrder();
  };

  if (loading) {
    return <div className="p-6">Cargando...</div>;
  }

  if (!order) {
    return <div className="p-6">Orden no encontrada</div>;
  }

  const statusColor =
    order.status === "DRAFT"
      ? "bg-yellow-100 text-yellow-700"
      : order.status === "SENT"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-red-100 text-red-700";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 space-y-5">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          Orden #{order.id.slice(0, 8)}
        </h1>

        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}
        >
          {order.status}
        </span>
      </div>

      <div className="space-y-3">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="bg-white p-4 rounded-xl flex justify-between"
          >
            <div>
              <p className="font-medium">
                {item.itemNameSnapshot}
              </p>
              <p className="text-sm text-neutral-500">
                x{item.quantity}
              </p>
            </div>

            <span className="font-semibold">
              ${item.lineTotal.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-white p-4 rounded-xl font-semibold text-lg flex justify-between">
        <span>Total</span>
        <span>${order.total.toFixed(2)}</span>
      </div>

      {/* Botones solo si está en DRAFT */}
      {order.status === "DRAFT" && (
        <div className="flex gap-3">
          <button
            onClick={() => updateStatus("confirm")}
            className="flex-1 bg-emerald-600 text-white rounded-xl py-3 font-semibold"
          >
            Confirmar pedido
          </button>

          <button
            onClick={() => updateStatus("cancel")}
            className="flex-1 border rounded-xl py-3 font-semibold"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Mensajes finales */}
      {order.status === "SENT" && (
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm">
          Pedido confirmado correctamente. El negocio se comunicará contigo.
        </div>
      )}

      {order.status === "CANCELLED" && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">
          Este pedido fue cancelado.
        </div>
      )}
    </div>
  );
}