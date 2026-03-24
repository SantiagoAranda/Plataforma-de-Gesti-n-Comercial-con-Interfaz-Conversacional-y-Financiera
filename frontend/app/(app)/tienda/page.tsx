"use client";

import { useEffect, useState } from "react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import { Search, Share2, CheckCheck, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import AppHeader from "@/src/components/layout/AppHeader";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";

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

  /* ================= COMPARTIR TIENDA ================= */

  const copyWithExecCommand = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleShareStore = async () => {
    const slug = localStorage.getItem("businessSlug");
    const businessName = localStorage.getItem("businessName") || "Mi Tienda";

    if (!slug) {
      notify({
        type: "error",
        message: "No se encontró el identificador de la tienda. Intentá re-ingresar.",
      });
      return;
    }

    const url = `${window.location.origin}/tienda/${encodeURIComponent(slug)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: businessName,
          text: "Mira mi tienda online",
          url,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);

        notify({
          type: "success",
          message: "Link de tu tienda copiado",
        });
        return;
      }

      if (copyWithExecCommand(url)) {
        notify({
          type: "success",
          message: "Link de tu tienda copiado",
        });
        return;
      }

      window.prompt("Copiá el link de tu tienda:", url);
      notify({
        type: "info",
        message: "Copiá el link manualmente",
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      if (copyWithExecCommand(url)) {
        notify({
          type: "success",
          message: "Link de tu tienda copiado",
        });
        return;
      }

      window.prompt("Copiá el link de tu tienda:", url);
      notify({
        type: "info",
        message: "No se pudo copiar automáticamente. Copialo manualmente.",
      });
    }
  };

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
  }, [notify]);

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

      {/* Botón compartir tienda */}
      <button
        onClick={handleShareStore}
        title="Compartir mi tienda"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-emerald-600 text-white shadow-xl flex items-center justify-center"
      >
        <Share2 />
      </button>
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
      const token = localStorage.getItem("accessToken");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/items/${item.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md h-full">

      {/* Imagen */}
      <div className="aspect-[4/3] bg-neutral-50 overflow-hidden rounded-t-xl relative shrink-0">
        {item.images?.[0]?.url && (
          <ItemImageViewer
            images={item.images}
            name={item.name}
            description={item.description}
            containerClassName="h-full w-full rounded-t-xl flex items-center justify-center cursor-pointer"
            imageClassName="h-full w-full object-cover"
          />
        )}
        
        {/* Overlays */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none z-10">
          <span className={`backdrop-blur-md bg-white/70 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${item.type === 'SERVICE' ? 'text-blue-700' : 'text-orange-700'}`}>
            {item.type === 'SERVICE' ? 'Servicio' : 'Producto'}
          </span>

          {item.type === 'SERVICE' && item.durationMinutes && (
            <span className="backdrop-blur-md bg-white/70 text-neutral-800 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm leading-none">
              {item.durationMinutes} min
            </span>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-3 flex flex-col gap-2 flex-1 relative">
        {/* Nombre */}
        <div className="text-sm font-semibold text-neutral-900 line-clamp-1">
          {item.name}
        </div>

        {/* Descripción */}
        <div className="flex-1">
          {item.description && (
            <p className="text-[11px] text-neutral-500 leading-snug line-clamp-2">
              {item.description}
            </p>
          )}
        </div>

        {/* Precio y Estado */}
        <div className="mt-auto pt-1 flex items-center justify-between">
          <span className="text-emerald-600 font-bold text-sm">
            ${item.price.toFixed(2)}
          </span>
          <div className="flex items-center gap-1" title={item.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}>
            {item.status === 'ACTIVE' ? (
              <CheckCheck className="w-[18px] h-[18px] text-emerald-500" />
            ) : (
              <Check className="w-[18px] h-[18px] text-neutral-400" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
