"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";

type ItemType = "PRODUCT" | "SERVICE";

type Item = {
  id: string;
  name: string;
  price: number;
  type: ItemType;
  durationMinutes?: number;
  images?: { id: string; url: string }[];
};

export default function PublicStorePage() {
  const { slug } = useParams<{ slug: string }>();
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);

  const [category, setCategory] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  /* ================= FETCH ITEMS ================= */

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/items?type=${category}`
        );

        if (!res.ok) throw new Error("Failed to fetch products");

        const data = await res.json();

        setItems(
          data.data.map((item: any) => ({
            ...item,
            price: Number(item.price),
          }))
        );
      } catch {
        notify({
          type: "error",
          message: "No se pudieron cargar los productos",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [slug, category]);

  /* ================= FILTRO ================= */

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  /* ================= CARRITO ================= */

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    notify({
      type: "success",
      message: "Producto agregado al carrito",
    });
  };

  const increaseQty = (id: string) => {
    setCart((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }));
  };

  const decreaseQty = (id: string) => {
    setCart((prev) => {
      const current = prev[id];
      if (!current) return prev;

      if (current === 1) {
        const copy = { ...prev };
        delete copy[id];

        notify({
          type: "info",
          message: "Producto eliminado del carrito",
        });

        return copy;
      }

      return {
        ...prev,
        [id]: current - 1,
      };
    });
  };

  const removeItem = (id: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    notify({
      type: "warning",
      message: "Producto eliminado",
    });
  };

  const cartCount = useMemo(
    () => Object.values(cart).reduce((a, b) => a + b, 0),
    [cart]
  );

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((acc, [itemId, quantity]) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return acc;
      return acc + item.price * quantity;
    }, 0);
  }, [cart, items]);

  /* ================= RENDER ================= */

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        {/* Buscador */}
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {/* Filtros */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setCategory("")}
            className={`${!category ? "bg-emerald-600 text-white" : "bg-white text-black"
              } p-2 rounded-full`}
          >
            Todo
          </button>
          <button
            onClick={() => setCategory("PRODUCT")}
            className={`${category === "PRODUCT" ? "bg-emerald-600 text-white" : "bg-white text-black"
              } p-2 rounded-full`}
          >
            Productos
          </button>
          <button
            onClick={() => setCategory("SERVICE")}
            className={`${category === "SERVICE" ? "bg-emerald-600 text-white" : "bg-white text-black"
              } p-2 rounded-full`}
          >
            Servicios
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <p className="text-center mt-6 text-neutral-400">Cargando...</p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onAction={() => {
                  if (item.type === "SERVICE") {
                    setSelectedService(item); // Abre el modal de reserva
                  } else {
                    addToCart(item.id); // Agrega al carrito
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAB carrito */}
      {cartCount > 0 && (
        <button
          onClick={() => setShowCartModal(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-emerald-600 text-white shadow-xl flex items-center justify-center"
        >
          <ShoppingBag />
          <span className="absolute -top-1 -right-1 bg-white text-emerald-600 text-xs font-bold rounded-full px-2">
            {cartCount}
          </span>
        </button>
      )}

      {/* Carrito Modal */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-fadeIn">

            <h2 className="text-lg font-semibold mb-4">
              Finalizar compra
            </h2>

            {/* Lista productos */}
            <div className="space-y-3 max-h-40 overflow-y-auto">
              {Object.entries(cart).map(([id, qty]) => {
                const item = items.find((i) => i.id === id);
                if (!item) return null;

                return (
                  <div key={id} className="flex justify-between text-sm">
                    <span>
                      {item.name} x{qty}
                    </span>
                    <span>
                      ${(item.price * qty).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div className="flex justify-between font-bold text-base mt-4 border-t pt-3">
              <span>Total</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>

            {/* 🔥 INPUTS QUE FALTABAN 🔥 */}
            <div className="mt-4 space-y-3">
              <input
                placeholder="Nombre"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
              />

              <input
                placeholder="WhatsApp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Botones */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowCartModal(false)}
                className="flex-1 border rounded-xl py-3 font-semibold active:scale-95 transition"
              >
                Cancelar
              </button>

              <button
                onClick={() => {
                  if (!customerName || !whatsapp) {
                    notify({
                      type: "warning",
                      message: "Completá nombre y WhatsApp",
                    });
                    return;
                  }

                  // 👉 acá después conectamos con POST /public/:slug/order
                  notify({
                    type: "success",
                    message: "Pedido enviado correctamente",
                  });

                  setCart({});
                  setCustomerName("");
                  setWhatsapp("");
                  setShowCartModal(false);
                }}
                className="flex-1 bg-emerald-600 text-white rounded-xl py-3 font-semibold shadow-lg active:scale-95 transition"
              >
                Confirmar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Drawer reservas */}
      <ReservationDrawer
        open={!!selectedService}
        onClose={() => setSelectedService(null)}
        title={selectedService?.name}
        subtitle="Selecciona día y horario disponible"
        onConfirm={(data) => {
          if (!selectedService) return;

          console.log("Reserva:", {
            serviceId: selectedService.id,
            ...data,
          });

          notify({
            type: "success",
            message: "Reserva creada correctamente",
          });

          setSelectedService(null);
        }}
      />
    </div>
  );
}

/* ================= CARD ================= */

function ProductCard({
  item,
  onAction,
}: {
  item: Item;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:-translate-y-1">
      <div className="aspect-square bg-gray-100 overflow-hidden rounded-t-xl">
        {item.images?.[0]?.url && (
          <img
            src={item.images[0].url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="p-3 flex flex-col gap-2">
        <div className="text-sm font-semibold line-clamp-2">{item.name}</div>

        <div className="text-emerald-600 font-bold text-sm">
          ${item.price.toFixed(2)}
        </div>

        <button
          onClick={onAction}
          className="mt-auto bg-emerald-600 text-white text-xs py-2 rounded-lg font-semibold"
        >
          {item.type === "SERVICE" ? "Reservar" : "Añadir al carrito"}
        </button>
      </div>
    </div>
  );
}