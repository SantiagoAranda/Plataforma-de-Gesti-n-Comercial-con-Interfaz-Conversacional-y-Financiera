"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import BottomNav from "@/src/components/layout/BottomNav";
import { createPortal } from "react-dom";
import { useNotification } from "@/src/components/ui/NotificationProvider";

type ItemType = "PRODUCT" | "SERVICE";

type Item = {
  id: string;
  name: string;
  price: number;
  type: ItemType;
  description?: string;
  durationMinutes?: number;
  images?: { id: string; url: string; order: number }[];
};

export default function MiTiendaPage() {
  const { notify } = useNotification();
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);

  /* ======================= FETCH ITEMS ======================= */

  useEffect(() => {
    if (!slug) return;

    const fetchItems = async () => {
      try {
        setLoading(true);

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/items`
        );

        if (!res.ok) throw new Error("Error loading items");

        const data = await res.json();

        setItems(
          (data.data ?? []).map((item: any) => ({
            ...item,
            price: Number(item.price),
          }))
        );
      } catch (err) {
        notify({
          type: "error",
          message: "No se pudo cargar la tienda",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [slug]);

  /* ======================= FILTRO ======================= */

  const filtered = useMemo(() => {
    return items.filter((i) =>
      i.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [items, query]);

  /* ======================= CARRITO ======================= */

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));

    notify({
      type: "success",
      message: "Producto agregado al carrito",
    });
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((acc, [itemId, quantity]) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return acc;
      return acc + item.price * quantity;
    }, 0);
  }, [cart, items]);

  /* ======================= CHECKOUT REAL ======================= */

  const handleCheckout = async () => {
    if (!customerName || !customerWhatsapp) {
      notify({
        type: "warning",
        message: "Completá nombre y WhatsApp",
      });
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/order`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName,
            customerWhatsapp,
            items: Object.entries(cart).map(([itemId, quantity]) => ({
              itemId,
              quantity,
            })),
          }),
        }
      );

      if (!res.ok) throw new Error("Error creating order");

      const data = await res.json();

      notify({
        type: "success",
        message: "Orden creada correctamente",
      });

      setCart({});
      setShowCheckout(false);

      router.push(`/orden/${data.orderId}`);
    } catch (err) {
      notify({
        type: "error",
        message: "No se pudo crear la orden",
      });
    }
  };

  /* ======================= UI ======================= */

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <AppHeader title="Tienda" showBack />

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full bg-transparent text-[15px] outline-none"
          />
        </div>

        {loading ? (
          <p className="text-center text-neutral-400 mt-6">
            Cargando productos...
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onAdd={() => addToCart(item.id)}
              />
            ))}
          </div>
        )}
      </main>

      {cartCount > 0 && (
        <button
          onClick={() => setShowCheckout(true)}
          className="fixed bottom-[88px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl"
        >
          <ShoppingBag className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 bg-white text-emerald-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {cartCount}
          </span>
        </button>
      )}

      {showCheckout &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCheckout(false)}
          >
            <div
              className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-t-3xl bg-white p-5 shadow-2xl">
                <h2 className="text-lg font-semibold mb-4">
                  Confirmar compra
                </h2>

                <div className="space-y-2 text-sm">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = items.find((i) => i.id === id);
                    if (!item) return null;

                    return (
                      <div key={id} className="flex justify-between">
                        <span>{item.name} x{qty}</span>
                        <span>${(item.price * qty).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between font-bold mt-4 border-t pt-3">
                  <span>Total</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>

                <div className="mt-4 space-y-3">
                  <input
                    placeholder="Nombre"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full border rounded-xl p-3"
                  />
                  <input
                    placeholder="WhatsApp"
                    value={customerWhatsapp}
                    onChange={(e) => setCustomerWhatsapp(e.target.value)}
                    className="w-full border rounded-xl p-3"
                  />
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="flex-1 border rounded-xl py-3 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCheckout}
                    className="flex-1 bg-emerald-600 text-white rounded-xl py-3 font-semibold"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <BottomNav active="tienda" />
    </div>
  );
}

/* ================= PRODUCT CARD ================= */

function ProductCard({
  item,
  onAdd,
}: {
  item: Item;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="aspect-square bg-gray-100 overflow-hidden rounded-t-xl">
        {item.images?.[0]?.url && (
          <img
            src={item.images[0].url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="p-3 flex flex-col">
        <div className="font-semibold text-sm line-clamp-2">
          {item.name}
        </div>

        <div className="text-emerald-600 font-bold mt-2">
          ${item.price.toFixed(2)}
        </div>

        <button
          onClick={onAdd}
          className="mt-3 bg-emerald-600 text-white rounded-lg py-2 text-sm font-semibold"
        >
          Añadir al carrito
        </button>
      </div>
    </div>
  );
}