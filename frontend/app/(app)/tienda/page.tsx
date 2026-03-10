"use client";

import { useEffect, useState } from "react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import AppHeader from "@/src/components/layout/AppHeader";

type Item = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE";
  status: "ACTIVE" | "INACTIVE";
  durationMinutes?: number;
  description?: string;
  images?: { id: string; url: string }[];
};

export default function MiTiendaPage() {
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  /* ================= FETCH MIS PRODUCTOS ================= */

    useEffect(() => {
        const fetchMyItems = async () => {
            try {
                const token = localStorage.getItem("accessToken");

                if (!token) {
                    notify({
                        type: "error",
                        message: "Sesión expirada. Volvé a iniciar sesión.",
                    });
                    return;
                }

                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/items`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (!res.ok) throw new Error();

                const data = await res.json();

                setItems(
                    data.map((item: any) => ({
                        ...item,
                        price: Number(item.price),
                    }))
                );
            } catch {
                notify({
                    type: "error",
                    message: "No se pudieron cargar tus productos",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchMyItems();
    }, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <AppHeader title="Mi Tienda" showBack />

      <main className="max-w-md mx-auto px-4 pb-20 pt-4">

        {/* Buscador */}
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {loading ? (
          <p className="text-center text-neutral-400 mt-6">
            Cargando productos...
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-neutral-400 mt-6">
            No hay productos cargados
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4">
            {filtered.map((item) => (
              <AdminProductCard
                key={item.id}
                item={item}
                onDelete={(id) =>
                  setItems((prev) => prev.filter((i) => i.id !== id))
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ================= CARD ADMIN ================= */

function AdminProductCard({
  item,
  onDelete,
}: {
  item: Item;
  onDelete: (id: string) => void;
}) {
  const { notify } = useNotification();
  const router = useRouter();

  const handleDelete = async () => {
    const confirmDelete = confirm(
      `¿Seguro que querés eliminar "${item.name}"?`
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/items/${item.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!res.ok) throw new Error();

      notify({
        type: "success",
        message: "Producto eliminado",
      });

      onDelete(item.id);
    } catch {
      notify({
        type: "error",
        message: "No se pudo eliminar el producto",
      });
    }
  };

  const handleEdit = () => {
    router.push(`/mi-negocio?edit=${item.id}`);
  };

  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md">

      {/* Imagen */}
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

        <div className="text-sm font-semibold line-clamp-2">
          {item.name}
        </div>

        <div className="text-emerald-600 font-bold text-sm">
          ${item.price.toFixed(2)}
        </div>

        {item.type === "SERVICE" && item.durationMinutes && (
          <div className="text-xs text-neutral-500">
            {item.durationMinutes} min
          </div>
        )}

        <div>
          <span
            className={`px-2 py-1 text-xs rounded-full font-semibold ${
              item.status === "ACTIVE"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-600"
            }`}
          >
            {item.status === "ACTIVE" ? "Activo" : "Inactivo"}
          </span>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 mt-2">

          <button
            onClick={handleEdit}
            className="flex-1 bg-blue-600 text-white text-xs py-2 rounded-lg font-semibold active:scale-95 transition"
          >
            Editar
          </button>

          <button
            onClick={handleDelete}
            className="flex-1 bg-red-500 text-white text-xs py-2 rounded-lg font-semibold active:scale-95 transition"
          >
            Eliminar
          </button>

        </div>
      </div>
    </div>
  );
}
