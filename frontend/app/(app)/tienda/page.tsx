"use client";

import { useEffect, useState } from "react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  RotateCcw,
  Search,
  ShieldCheck,
  Share2,
  Truck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AppHeader from "@/src/components/layout/AppHeader";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatPriceInput } from "@/src/lib/itemHelpers";

type Item = {
  id: string;
  name: string;
  price: number;
  type: "PRODUCT" | "SERVICE";
  status: "ACTIVE" | "INACTIVE";
  durationMinutes?: number;
  description?: string;
  previousPrice?: number | null;
  images?: { id: string; url: string }[];
};

export default function MiTiendaPage() {
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const [businessName, setBusinessName] = useState("Mi Tienda");

  const closeProductDetail = () => setSelectedProduct(null);

  useEffect(() => {
    if (!selectedProduct) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeProductDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedProduct]);

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

  useEffect(() => {
    try {
      const name = localStorage.getItem("businessName");
      if (name) setBusinessName(name);
    } catch {
      // ignore
    }
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
                onOpenDetail={() => setSelectedProduct(item)}
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

      <PrivateProductDetailOverlay
        open={!!selectedProduct}
        item={selectedProduct}
        businessName={businessName}
        onClose={closeProductDetail}
      />
    </div>
  );
}

/* ================= CARD ADMIN ================= */

function AdminProductCard({
  item,
  onOpenDetail,
  onDelete,
}: {
  item: Item;
  onOpenDetail: () => void;
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
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpenDetail();
      }}
      className="flex flex-col rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md h-full cursor-pointer"
      aria-label={`Ver detalle de ${item.name}`}
    >

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
            ${formatPriceInput(
              Number(item.price).toFixed(2).replace(".", ",")
            )}
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

function PrivateProductDetailOverlay({
  open,
  item,
  businessName,
  onClose,
}: {
  open: boolean;
  item: Item | null;
  businessName: string;
  onClose: () => void;
}) {
  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Cerrar detalle"
      />

      <div className="relative h-[100dvh] w-full">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-slate-900 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white/90 md:hidden"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        {/* MOBILE */}
        <div className="h-full w-full md:hidden">
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#F7FAF8]">
            <div className="relative w-full bg-neutral-100">
              <div className="h-[52vh] min-h-[320px] w-full bg-neutral-100">
                {item.images?.[0]?.url ? (
                  <img
                    src={item.images[0].url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="h-full w-full bg-neutral-200" />
                )}
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center justify-between gap-6 bg-white/85 px-5 py-4 backdrop-blur border-b border-black/5">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  PRECIO ESPECIAL
                </div>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="text-3xl font-black tracking-tight text-slate-900">
                    ${formatPriceInput(Number(item.price).toFixed(2).replace(".", ","))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-auto min-h-0 w-full max-w-md overflow-y-auto px-4 pb-6 pt-4 custom-scrollbar">
              <div className="space-y-2 text-slate-900">
                <div className="text-xs font-semibold text-slate-600">
                  {businessName}
                </div>

                {item.description && (
                  <p className="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                    {item.description}
                  </p>
                )}
              </div>

              {/*
              <div className="pt-6">
                <PrivateBenefitsList />
              </div>
              */}
            </div>
          </div>
        </div>

        {/* DESKTOP */}
        <div className="hidden h-full md:flex">
          <div className="min-w-0 flex-1 bg-[#F7FAF8] px-12 py-10">
            <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
              <div className="max-w-2xl space-y-8 text-slate-900">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a mi tienda
                </button>

                <div className="space-y-2">
                  <h1 className="text-5xl font-semibold tracking-tight leading-[1.05]">
                    {item.name}
                  </h1>
                  <div className="text-base font-medium text-slate-600">
                    {businessName}
                  </div>
                </div>

                <div className="h-px w-full bg-black/5" />

                <div className="flex flex-wrap items-end justify-between gap-8">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      PRECIO ESPECIAL
                    </div>
                    <div className="text-4xl font-black tracking-tight text-slate-900">
                      ${formatPriceInput(Number(item.price).toFixed(2).replace(".", ","))}
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-black/5" />

                {item.description && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Descripción
                    </div>
                    <p className="text-[16px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                      {item.description}
                    </p>
                  </div>
                )}

                {/* <PrivateBenefitsList /> */}
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white">
            {item.images?.[0]?.url ? (
              <img
                src={item.images[0].url}
                alt={item.name}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-neutral-200" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivateBenefitsList() {
  return (
    <div className="space-y-6 pt-2">
      <div className="h-px w-full bg-white/10" />

      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
            <ShieldCheck className="h-5 w-5 text-white/70" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Compra segura</div>
            <div className="text-sm text-white/55">Tus datos están protegidos</div>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
            <Truck className="h-5 w-5 text-white/70" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Envío rápido</div>
            <div className="text-sm text-white/55">Recibe tu pedido en tiempo récord</div>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
            <RotateCcw className="h-5 w-5 text-white/70" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Devoluciones</div>
            <div className="text-sm text-white/55">30 días para cambios y devoluciones</div>
          </div>
        </div>
      </div>
    </div>
  );
}
