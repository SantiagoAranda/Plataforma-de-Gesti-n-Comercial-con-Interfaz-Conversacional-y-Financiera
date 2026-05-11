"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Share2,
  Truck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import BottomNav from "@/src/components/layout/BottomNav";
import { formatPriceInput } from "@/src/lib/itemHelpers";

const formatCop = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(safeValue);
  return formatted.replace("COP", "$").replace(/\s+/g, "");
};

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
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const [businessName, setBusinessName] = useState("Mi Tienda");
  const [category, setCategory] = useState<"" | "PRODUCT" | "SERVICE">("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

  useEffect(() => {
    if (!isSearchOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isSearchOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((i) => {
      if (category && i.type !== category) return false;
      if (!q) return true;

      const name = i.name?.toLowerCase() ?? "";
      const desc = i.description?.toLowerCase() ?? "";
      const typeLabel = i.type === "SERVICE" ? "servicio" : "producto";

      return name.includes(q) || desc.includes(q) || typeLabel.includes(q);
    });
  }, [items, query, category]);

  return (
    <div className="min-h-dvh bg-[#F7FAF8] w-full min-w-0 overflow-x-hidden">
      <header
        className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-16 w-full max-w-[420px] lg:max-w-full items-center justify-between px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-slate-100 active:scale-95"
              aria-label="Volver"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold text-slate-950">
                {businessName}
              </div>
              <div className="truncate text-[12px] font-medium text-slate-500">
                Catálogo
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-slate-100 active:scale-95"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={handleShareStore}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-slate-100 active:scale-95"
              aria-label="Compartir tienda"
            >
              <Share2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px] lg:max-w-full px-4 lg:px-6 pb-3 space-y-3">
          {isSearchOpen && (
            <div className="flex items-center gap-3 rounded-full bg-slate-50 px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full bg-transparent text-sm outline-none text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setIsSearchOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:scale-95"
                aria-label="Cerrar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {["", "PRODUCT", "SERVICE"].map((type) => (
              <button
                key={type}
                onClick={() => setCategory(type as "" | "PRODUCT" | "SERVICE")}
                className={`px-4 py-2 rounded-full text-sm font-semibold ring-1 transition ${category === type
                  ? "bg-[#11d473] text-white ring-emerald-200"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
              >
                {type === ""
                  ? "Todo"
                  : type === "PRODUCT"
                    ? "Productos"
                    : "Servicios"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[420px] lg:max-w-full px-4 lg:px-6 pb-32 pt-4">
        {loading ? (
          <p className="text-center text-neutral-400 mt-6">
            Cargando productos...
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-neutral-400 mt-6">
            No hay productos cargados
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 lg:gap-x-4 lg:gap-y-5">
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

      <BottomNav active="tienda" />

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
  const images = item.images ?? [];
  const showCarousel = images.length > 1;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [item.id]);

  useEffect(() => {
    if (!showCarousel) return;

    const id = window.setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 3000);

    return () => window.clearInterval(id);
  }, [showCarousel, images.length]);

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
      className="flex flex-col"
      aria-label={`Ver detalle de ${item.name}`}
    >
      <div className="relative overflow-hidden rounded-3xl bg-neutral-100 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] cursor-pointer">
        <div className="aspect-square w-full lg:aspect-auto lg:h-[220px]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-neutral-200" />
          )}
        </div>

        {showCarousel && (
          <div className="absolute left-3 right-3 top-3 z-10 flex gap-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
            {images.map((image, index) => (
              <button
                key={image.id ?? `${item.id}-seg-${index}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCurrentImageIndex(index);
                }}
                className={[
                  "h-0.5 flex-1 rounded-full",
                  index === currentImageIndex
                    ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
                    : "bg-white/60 shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
                ].join(" ")}
                aria-label={`Imagen ${index + 1}`}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenDetail();
          }}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition hover:scale-105 active:scale-95"
          aria-label="Abrir"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 space-y-1 px-1">
        <div className="truncate text-[14px] font-bold text-slate-950">
          {item.name}
        </div>
        <div className="text-[15px] font-black text-emerald-600">
          {formatCop(Number(item.price || 0))}
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = item?.images ?? [];
  const imageCount = images.length;
  const showCarousel = imageCount > 1;
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [item?.id]);

  const goToIndex = (index: number) => {
    if (!showCarousel) return;
    const clamped = Math.max(0, Math.min(index, imageCount - 1));
    setCurrentImageIndex(clamped);
  };

  const goPrev = () => goToIndex((currentImageIndex - 1 + imageCount) % imageCount);
  const goNext = () => goToIndex((currentImageIndex + 1) % imageCount);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-sm lg:left-[408px]">
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
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="h-full w-full bg-neutral-200" />
                )}
              </div>

              {showCarousel && (
                <>
                  <div className="absolute left-3 right-3 top-3 z-10 flex gap-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                    {images.map((image, index) => (
                      <button
                        key={image.id ?? `${item.id}-private-mobile-seg-${index}`}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          goToIndex(index);
                        }}
                        className={[
                          "h-0.5 flex-1 rounded-full",
                          index === currentImageIndex
                            ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
                            : "bg-white/60 shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
                        ].join(" ")}
                        aria-label={`Imagen ${index + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      goPrev();
                    }}
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      goNext();
                    }}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
                    aria-label="Siguiente imagen"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
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
        <div className="hidden h-full md:flex md:flex-col xl:flex-row">
          <div className="min-w-0 flex-1 bg-[#F7FAF8] px-6 py-8 lg:px-8 lg:py-10 xl:px-12">
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

          <div className="bg-white xl:flex-1">
            <div className="relative w-full bg-neutral-100 md:h-[44vh] xl:h-full">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full bg-neutral-200" />
              )}

              {showCarousel && (
                <>
                  <div className="absolute left-6 right-6 top-6 z-10 flex gap-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                    {images.map((image, index) => (
                      <button
                        key={image.id ?? `${item.id}-private-detail-seg-${index}`}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          goToIndex(index);
                        }}
                        className={[
                          "h-0.5 flex-1 rounded-full",
                          index === currentImageIndex
                            ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
                            : "bg-white/60 shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
                        ].join(" ")}
                        aria-label={`Imagen ${index + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      goPrev();
                    }}
                    className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      goNext();
                    }}
                    className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
                    aria-label="Siguiente imagen"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
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
