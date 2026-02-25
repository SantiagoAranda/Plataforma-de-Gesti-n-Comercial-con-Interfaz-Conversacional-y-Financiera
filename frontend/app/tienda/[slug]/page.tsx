"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";

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

export default function TiendaPage() {
  const { slug } = useParams<{ slug: string }>();

  const [items, setItems] = useState<Item[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});

  /* ================= FETCH ================= */

  useEffect(() => {
    if (!slug) return;

    const fetchItems = async () => {
      try {
        const res = await fetch(
          `http://localhost:3001/public/${slug}/items`
        );

        if (!res.ok) {
          console.error("Error:", res.status);
          return;
        }

        const data = await res.json();

        setBusinessName(data.business?.name ?? "Tienda");

        const normalized = (data.data ?? []).map((item: any) => ({
          ...item,
          price: Number(item.price),
        }));

        setItems(normalized);
      } catch (err) {
        console.error("Fetch failed:", err);
      }
    };

    fetchItems();
  }, [slug]);

  /* ================= FILTRO ================= */

  const filtered = useMemo(() => {
    return items.filter((i) =>
      i.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [items, query]);

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  /* ================= UI ================= */

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <div className="bg-white shadow-sm border-b border-neutral-200 px-6 py-6">
        <h1 className="text-xl font-semibold text-neutral-900">
          {businessName}
        </h1>
      </div>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-black/35"
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 items-stretch">
          {filtered.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              onAdd={() => addToCart(item.id)}
              onDetail={() => setSelectedItem(item)}
            />
          ))}
        </div>
      </main>

      {cartCount > 0 && (
        <button className="fixed bottom-[88px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl active:scale-95 transition">
          <ShoppingBag className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-emerald-600 shadow">
            {cartCount}
          </span>
        </button>
      )}

      {selectedItem && (
        <ItemDetailSheet
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAdd={() => {
            addToCart(selectedItem.id);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}

/* ================= PRODUCT CARD ================= */

function ProductCard({
  item,
  onAdd,
  onDetail,
}: {
  item: Item;
  onAdd: () => void;
  onDetail: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-[12px] bg-white shadow-sm ring-1 ring-black/5">
      <div className="aspect-square w-full overflow-hidden rounded-t-[12px] bg-gray-100">
        {item.images?.[0]?.url && (
          <img
            src={item.images[0].url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="min-h-[40px] text-[15px] font-semibold line-clamp-2">
          {item.name}
        </div>

        <div className="mt-2 text-[18px] font-extrabold text-emerald-600">
          ${item.price.toFixed(2)}
        </div>

        <div className="mt-auto space-y-2 pt-3">
          <button
            onClick={onDetail}
            className="w-full rounded-[10px] border border-gray-200 py-2 text-[14px] font-semibold"
          >
            Ver detalle
          </button>

          <button
            onClick={onAdd}
            className="w-full rounded-[10px] bg-emerald-600 py-2 text-[14px] font-semibold text-white"
          >
            Añadir al carrito
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= DETAIL SHEET ================= */

function ItemDetailSheet({
  item,
  onClose,
  onAdd,
}: {
  item: Item;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-t-3xl bg-white p-5 shadow-2xl">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              {item.type === "SERVICE"
                ? "Detalles del Servicio"
                : "Detalles del Producto"}
            </h2>
            <button onClick={onClose}>✕</button>
          </div>

          {item.images?.[0]?.url && (
            <div className="overflow-hidden rounded-2xl bg-gray-100">
              <img
                src={item.images[0].url}
                className="w-full object-cover"
              />
            </div>
          )}

          <div className="mt-4 space-y-4">
            <Field label="Nombre">{item.name}</Field>
            <Field label="Precio">${item.price.toFixed(2)}</Field>

            {item.type === "SERVICE" && (
              <Field label="Duración">
                {item.durationMinutes} min
              </Field>
            )}

            <Field label="Descripción">
              {item.description ?? "Producto premium."}
            </Field>

            <button
              onClick={onAdd}
              className="mt-2 w-full rounded-full bg-emerald-600 py-4 text-lg font-semibold text-white shadow-lg"
            >
              Agregar al carrito
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase text-emerald-700">
        {label}
      </p>
      <div className="mt-1 rounded-xl bg-gray-100 p-3 text-base">
        {children}
      </div>
    </div>
  );
}