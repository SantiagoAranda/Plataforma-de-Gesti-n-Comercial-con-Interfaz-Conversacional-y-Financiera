"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, ChevronDown, ShoppingBag } from "lucide-react";
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
  category?: string;
  imageUrl?: string;
  description?: string;
  durationMin?: number;
};

const MOCK_ITEMS: Item[] = [
  {
    id: "1",
    name: "Cámara Digital Pro",
    price: 299,
    type: "PRODUCT",
    category: "Electrónica",
    imageUrl:
      "https://images.unsplash.com/photo-1519183071298-a2962be90b8e",
  },
  {
    id: "2",
    name: "Reloj Inteligente",
    price: 150,
    type: "PRODUCT",
    category: "Electrónica",
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
  },
  {
    id: "3",
    name: "Auriculares BT",
    price: 89,
    type: "PRODUCT",
    category: "Electrónica",
    imageUrl:
      "https://images.unsplash.com/photo-1518443895914-51f01cb11dcd",
  },
  {
    id: "4",
    name: "Mochila Urbana",
    price: 45,
    type: "PRODUCT",
    category: "Hogar",
    imageUrl:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62",
  },
];

export default function MiTiendaPage() {
  const { notify } = useNotification();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"Todo" | "Electrónica" | "Hogar">("Todo");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");

  /* ======================= FILTRO ======================= */

  const items = useMemo(() => {
    return MOCK_ITEMS.filter((i) => {
      const matchQuery = i.name
        .toLowerCase()
        .includes(query.toLowerCase().trim());
      const matchTab = tab === "Todo" ? true : i.category === tab;
      return matchQuery && matchTab;
    });
  }, [query, tab]);

  /* ======================= CARRITO ======================= */

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
      const item = MOCK_ITEMS.find((i) => i.id === itemId);
      if (!item) return acc;
      return acc + item.price * quantity;
    }, 0);
  }, [cart]);

  /* ======================= BLOQUEO SCROLL ======================= */

  useEffect(() => {
    if (showCheckout) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showCheckout]);

  /* ======================= CHECKOUT ======================= */

  const handleCheckout = () => {
    if (!customerName || !customerWhatsapp) {
      notify({
        type: "warning",
        message: "Completá nombre y WhatsApp",
      });
      return;
    }

    setCart({});
    setShowCheckout(false);

    notify({
      type: "success",
      message: "Orden creada correctamente",
    });
  };

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <AppHeader title="Tienda" showBack />

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        {/* Search */}
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-black/35"
          />
        </div>

        {/* Filtros */}
        <div className="mt-4 flex items-center gap-3">
          <Chip active={tab === "Todo"} onClick={() => setTab("Todo")}>
            Todo
          </Chip>

          <DropdownChip
            active={tab === "Electrónica"}
            onClick={() => setTab("Electrónica")}
          >
            Electrónica
          </DropdownChip>

          <DropdownChip
            active={tab === "Hogar"}
            onClick={() => setTab("Hogar")}
          >
            Hogar
          </DropdownChip>
        </div>

        {/* Grid */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          {items.map((it) => (
            <ProductCard
              key={it.id}
              item={it}
              onAdd={() => addToCart(it.id)}
            />
          ))}
        </div>
      </main>

      {/* FAB carrito */}
      {cartCount > 0 && (
        <button
          onClick={() => setShowCheckout(true)}
          className="fixed bottom-[88px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl active:scale-95 transition hover:scale-105"
        >
          <ShoppingBag className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-emerald-600 shadow">
            {cartCount}
          </span>
        </button>
      )}

      {/* ======================= MODAL CARRITO ======================= */}

      {showCheckout &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm animate-fadeIn"
            onClick={() => setShowCheckout(false)}
          >
            <div
              className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-t-3xl bg-white p-5 shadow-2xl animate-slideUp">

                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />

                <h2 className="text-lg font-semibold mb-4">
                  Carrito
                </h2>

                <div className="max-h-52 overflow-y-auto space-y-3">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = MOCK_ITEMS.find((i) => i.id === id);
                    if (!item) return null;

                    return (
                      <div key={id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">
                            {item.name}
                          </span>

                          <button
                            onClick={() => removeItem(id)}
                            className="text-red-500 text-xs font-semibold hover:underline"
                          >
                            Quitar
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => decreaseQty(id)}
                              className="w-8 h-8 rounded-full bg-white border shadow-sm text-lg font-bold active:scale-95 transition"
                            >
                              −
                            </button>

                            <span className="text-sm font-semibold w-6 text-center">
                              {qty}
                            </span>

                            <button
                              onClick={() => increaseQty(id)}
                              className="w-8 h-8 rounded-full bg-white border shadow-sm text-lg font-bold active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>

                          <span className="font-semibold text-emerald-600">
                            ${(item.price * qty).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between font-bold text-lg mt-4 border-t pt-3">
                  <span>Total</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>

                <div className="mt-4 space-y-3">
                  <input
                    placeholder="Nombre"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />

                  <input
                    placeholder="WhatsApp"
                    value={customerWhatsapp}
                    onChange={(e) => setCustomerWhatsapp(e.target.value)}
                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="flex-1 border rounded-xl py-3 font-semibold active:scale-95 transition"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={handleCheckout}
                    className="flex-1 bg-emerald-600 text-white rounded-xl py-3 font-semibold shadow-lg active:scale-95 transition"
                  >
                    Confirmar
                  </button>
                </div>

                <div className="h-[env(safe-area-inset-bottom)]" />
              </div>
            </div>
          </div>,
          document.body
        )}

      <BottomNav active="tienda" />
    </div>
  );
}

/* ================= COMPONENTES ================= */

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-5 py-2 text-[14px] font-semibold transition",
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "bg-white text-black/80 ring-1 ring-black/5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DropdownChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-2 rounded-full bg-white px-5 py-2 text-[14px] font-semibold ring-1 ring-black/5 transition",
        active ? "text-emerald-700" : "text-black/80",
      ].join(" ")}
    >
      {children}
      <ChevronDown className="h-4 w-4 text-black/40" />
    </button>
  );
}

function ProductCard({
  item,
  onAdd,
}: {
  item: Item;
  onAdd: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-[12px] bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:-translate-y-1 active:scale-[0.99]">
      <div className="aspect-square w-full overflow-hidden rounded-t-[12px] bg-gray-100">
        <img
          src={item.imageUrl ?? ""}
          alt={item.name}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="min-h-[40px] text-[15px] font-semibold line-clamp-2">
          {item.name}
        </div>

        <div className="mt-2 text-[18px] font-extrabold text-emerald-600">
          ${item.price.toFixed(2)}
        </div>

        <button
          onClick={onAdd}
          className="mt-auto w-full rounded-[10px] bg-emerald-600 py-2 text-[14px] font-semibold text-white active:scale-95 transition"
        >
          Añadir al carrito
        </button>
      </div>
    </div>
  );
}