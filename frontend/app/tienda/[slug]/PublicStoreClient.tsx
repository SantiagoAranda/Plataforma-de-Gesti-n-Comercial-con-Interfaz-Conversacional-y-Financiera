"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Store,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";
import { formatLocalDateKey } from "@/src/lib/datetime";
import { formatPriceInput } from "@/src/lib/itemHelpers";
import { Footer, FooterConfig, FooterPhone, FooterSocial } from "@/src/components/layout/Footer";
import { getItemBadges } from "@/src/lib/itemBadges";

import { readBusinessProfile } from "@/src/lib/businessProfile";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import CartSummary from "@/src/components/shared/CartSummary";

const formatPrice = (value: number) => {
  return formatPriceInput(value.toFixed(2).replace(".", ","));
};

const formatCop = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(safeValue);
  return formatted.replace("COP", "$").replace(/\s+/g, "");
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ItemType = "PRODUCT" | "SERVICE";

type PublicRecipeLine = {
  ingredientId: string;
  quantityRequired: number;
  isOptional: boolean;
  ingredient?: {
    id: string;
    name: string;
  } | null;
};

type Item = {
  id: string;
  name: string;
  price: number;
  type: ItemType;
  inventoryMode?: "NONE" | "SIMPLE" | "RECIPE_BASED" | null;
  description?: string;
  durationMinutes?: number;
  previousPrice?: number | null;
  badgeText?: string | null;
  badgeColor?: string | null;
  badges?: Array<{ text: string; color: string }> | null;
  images?: { id: string; url: string }[];
  recipes?: PublicRecipeLine[];
};

type CartLine = {
  itemId: string;
  quantity: number;
  excludedOptionalIngredientIds: string[];
};

type StoreFooterSettings = {
  description?: string | null;
  email?: string | null;
  phones?: unknown;
  socials?: unknown;
} | null;

function normalizeFooterPhones(value: unknown): FooterPhone[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<FooterPhone[]>((acc, phone) => {
    if (!phone || typeof phone !== "object") return acc;
    const record = phone as Record<string, unknown>;
    const phoneValue = typeof record.value === "string" ? record.value.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!phoneValue) return acc;
    acc.push({ label, value: phoneValue });
    return acc;
  }, []);
}

function normalizeFooterSocials(value: unknown): FooterSocial[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<FooterSocial[]>((acc, social) => {
    if (!social || typeof social !== "object") return acc;
    const record = social as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const socialValue = typeof record.value === "string" ? record.value.trim() : "";
    if (!type || !socialValue) return acc;
    acc.push({ type, label, value: socialValue });
    return acc;
  }, []);
}

export default function PublicStoreClient() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "true";
  const router = useRouter();
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [businessSubtitle, setBusinessSubtitle] = useState("");
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);
  const [footerSettings, setFooterSettings] = useState<StoreFooterSettings>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);

  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const [customizingProduct, setCustomizingProduct] = useState<Item | null>(null);
  const [draftExcludedOptionalIds, setDraftExcludedOptionalIds] = useState<string[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [category, setCategory] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 10) {
        setIsHeaderVisible(true);
      } else if (currentScrollY > lastScrollYRef.current) {
        // Scrolling down
        if (currentScrollY > 60) {
          setIsHeaderVisible(false);
        }
      } else {
        // Scrolling up
        setIsHeaderVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const closeProductDetail = () => setSelectedProduct(null);

  useEffect(() => {
    try {
      const profile = readBusinessProfile();
      if (profile.subtitle?.trim()) setBusinessSubtitle(profile.subtitle.trim());
    } catch { }
  }, []);

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

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    const fetchItems = async () => {
      try {
        const res = await fetch(
          `${API_URL}/public/${slug}/items?type=${category}`
        );

        if (!res.ok) throw new Error("Error loading items");

        const data = await res.json();

        // Redirección Canónica
        if (data?.business?.slug && data.business.slug !== slug) {
          const params = new URLSearchParams(searchParams.toString());
          router.replace(`/tienda/${data.business.slug}${params.toString() ? `?${params.toString()}` : ''}`);
          return;
        }

        const itemsList = Array.isArray(data?.data) ? data.data : [];

        if (data?.business?.name) {
          setBusinessName(data.business.name);
        }
        setBusinessLogoUrl(data?.business?.logoUrl || null);
        setFooterSettings(data?.business?.storeFooterSettings ?? null);

        setItems(
          itemsList.map((item: any) => ({
            ...item,
            price: Number(item.price || 0),
            previousPrice:
              item.previousPrice != null
                ? Number(item.previousPrice)
                : item.compareAtPrice != null
                  ? Number(item.compareAtPrice)
                  : item.originalPrice != null
                    ? Number(item.originalPrice)
                    : null,
          }))
        );
      } catch (error) {
        console.error("Fetch items error:", error);
        notify({
          type: "error",
          message: "No se pudieron cargar los productos",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [slug, category, notify]);

  const footerConfig = useMemo<FooterConfig>(() => {
    const description =
      typeof footerSettings?.description === "string"
        ? footerSettings.description.trim()
        : "";
    const email =
      typeof footerSettings?.email === "string"
        ? footerSettings.email.trim()
        : "";

    return {
      backgroundColor: '#064e3b',
      titulo: businessName,
      frasePrincipal: description || undefined,
      contacto: {
        email: email || undefined,
        telefonos: normalizeFooterPhones(footerSettings?.phones),
        redesSociales: normalizeFooterSocials(footerSettings?.socials),
      },
    };
  }, [businessName, footerSettings]);

  const resetReservationUi = () => {
    setSelectedService(null);
    setSelectedDateKey(null);
  };

  const handleReserve = async (data: any) => {
    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: las reservas estan deshabilitadas",
      });
      return;
    }

    if (!selectedService || !data.time || !data.date) return;

    const service = selectedService;
    const [h, m] = data.time.split(":").map(Number);
    const startMinute = h * 60 + m;
    const endMinute = startMinute + (service.durationMinutes ?? 60);

    try {
      const res = await fetch(`${API_URL}/public/${slug}/reserve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: service.id,
          customerName: data.fullName,
          customerWhatsapp: data.whatsapp,
          date: formatLocalDateKey(data.date),
          startMinute,
          endMinute,
        }),
      });

      if (!res.ok) throw new Error("Error creating reservation");

      notify({
        type: "success",
        message: "Reserva creada correctamente",
      });

      resetReservationUi();
    } catch (error) {
      console.error("Reservation error:", error);
      notify({
        type: "error",
        message: "No se pudo crear la reserva",
      });
    }
  };

  const getRequiredRecipeLines = (item: Item | null) => {
    return (item?.recipes ?? []).filter((line) => !line.isOptional);
  };

  const getOptionalRecipeLines = (item: Item | null) => {
    return (item?.recipes ?? []).filter((line) => line.isOptional);
  };

  const addToCart = (id: string, excludedOptionalIngredientIds: string[] = []) => {
    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: las compras estan deshabilitadas",
      });
      return;
    }

    const uniqueExcludedIds = Array.from(new Set(excludedOptionalIngredientIds));
    setCart((prev) => {
      const existing = prev.find((line) => line.itemId === id);
      if (existing) {
        return prev.map((line) =>
          line.itemId === id
            ? {
                ...line,
                quantity: line.quantity + 1,
                excludedOptionalIngredientIds: uniqueExcludedIds,
              }
            : line,
        );
      }
      return [
        ...prev,
        {
          itemId: id,
          quantity: 1,
          excludedOptionalIngredientIds: uniqueExcludedIds,
        },
      ];
    });
    notify({ type: "success", message: "Producto agregado" });
  };

  const increaseQty = (id: string) => {
    setCart((prev) =>
      prev.map((line) =>
        line.itemId === id ? { ...line, quantity: line.quantity + 1 } : line,
      ),
    );
  };

  const decreaseQty = (id: string) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.itemId === id ? { ...line, quantity: line.quantity - 1 } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((line) => line.itemId !== id));
  };

  const openCustomizationOrAdd = (item: Item) => {
    const optionalLines = getOptionalRecipeLines(item);
    if (item.type === "PRODUCT" && optionalLines.length > 0) {
      setDraftExcludedOptionalIds([]);
      setCustomizingProduct(item);
      return;
    }
    addToCart(item.id);
  };

  const confirmCustomizedProduct = () => {
    if (!customizingProduct) return;
    addToCart(customizingProduct.id, draftExcludedOptionalIds);
    setCustomizingProduct(null);
    setDraftExcludedOptionalIds([]);
  };

  const cartItems = useMemo(() => {
    return cart
      .map((line) => {
        const item = items.find((i) => i.id === line.itemId);
        if (!item) return null;
        const excludedNames = line.excludedOptionalIngredientIds
          .map(
            (ingredientId) =>
              item.recipes?.find((recipe) => recipe.ingredientId === ingredientId)
                ?.ingredient?.name,
          )
          .filter(Boolean) as string[];
        return {
          ...item,
          quantity: line.quantity,
          excludedOptionalIngredientIds: line.excludedOptionalIngredientIds,
          excludedOptionalIngredientNames: excludedNames,
        };
      })
      .filter(Boolean) as (Item & {
        quantity: number;
        excludedOptionalIngredientIds: string[];
        excludedOptionalIngredientNames: string[];
      })[];
  }, [cart, items]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
  }, [cartItems]);

  const cartCount = useMemo(
    () => cart.reduce((acc, line) => acc + line.quantity, 0),
    [cart]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((i) => {
      const name = i.name?.toLowerCase() ?? "";
      const desc = i.description?.toLowerCase() ?? "";
      const typeLabel = i.type === "SERVICE" ? "servicio" : "producto";

      return (
        name.includes(q) ||
        desc.includes(q) ||
        typeLabel.includes(q)
      );
    });
  }, [items, query]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isSearchOpen]);

  const handleConfirmOrder = async (documentVal?: string) => {
    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: no se pueden realizar pedidos",
      });
      return;
    }

    try {
      const note = documentVal?.trim() ? `CEDULA: ${documentVal.trim()}` : null;

      const res = await fetch(`${API_URL}/public/${slug}/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerWhatsapp: `${countryCode}${phoneNumber}`,
          items: cartItems.map((item) => ({
            itemId: item.id,
            quantity: item.quantity,
            excludedOptionalIngredientIds: item.excludedOptionalIngredientIds,
          })),
          note,
        }),
      });

      if (!res.ok) throw new Error("Error sending order");

      notify({ type: "success", message: "Compra enviada" });

      setCart([]);
      setShowCartModal(false);
      setCustomerName("");
      setPhoneNumber("");
    } catch (error) {
      console.error("Order error:", error);
      notify({ type: "error", message: "Error al enviar pedido" });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <header
        className="sticky top-0 z-40 bg-white/90 backdrop-blur transition-transform duration-300 ease-in-out"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)",
        }}
      >
        <div className="mx-auto flex min-h-[72px] py-3 w-full max-w-[420px] lg:max-w-6xl items-center justify-between px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-transparent text-slate-700 shadow-none ring-0">
              {businessLogoUrl ? (
                <img
                  src={businessLogoUrl}
                  alt={`Logo de ${businessName || "Tienda"}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Store className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex flex-row items-baseline leading-tight text-left">
              <h1 className="truncate text-[20px] font-semibold text-neutral-900">
                {businessName || "Tienda"}
              </h1>
              {businessSubtitle?.trim() && (
                <div className="truncate text-[13px] font-medium text-slate-500 ml-2">
                  {businessSubtitle.trim()}
                </div>
              )}
              <div
                className="truncate text-[13px] font-medium text-slate-500 ml-2"
                style={businessSubtitle?.trim() ? { display: "none" } : undefined}
              >
                Catálogo
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCartModal(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-slate-700 shadow-none ring-0 transition hover:bg-black/5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              aria-label="Carrito"
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-black text-white shadow-sm">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px] lg:max-w-6xl px-4 lg:px-6 pb-3 space-y-3">
          <div className="flex h-10 items-center gap-3 rounded-full bg-slate-100 px-4 shadow-none ring-1 ring-black/5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="h-9 w-full bg-transparent text-sm outline-none text-[#0f172a] placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-2">
            {["", "PRODUCT", "SERVICE"].map((type) => (
              <button
                key={type}
                onClick={() => setCategory(type)}
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

      {preview && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 font-medium">
          Modo administrador - vista previa de la tienda
        </div>
      )}

      <main className="flex-grow mx-auto w-full max-w-[420px] lg:max-w-6xl px-4 lg:px-6 pb-28 pt-4">
        {loading ? (
          <p className="text-center mt-6 text-neutral-400">Cargando...</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-x-4 lg:gap-y-6 justify-items-center">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                preview={preview}
                onOpen={() =>
                  item.type === "SERVICE" ? setSelectedService(item) : setSelectedProduct(item)
                }
                onPlus={() =>
                  item.type === "SERVICE" ? setSelectedService(item) : openCustomizationOrAdd(item)
                }
              />
            ))}
          </div>
        )}
      </main>

      {/* Cart entry now lives in the header */}

      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCartModal(false)}
          />

          <div className="relative z-10 w-full max-w-md">
            <CartSummary
              items={cartItems}
              onIncreaseQty={increaseQty}
              onDecreaseQty={decreaseQty}
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              countryCode={countryCode}
              onCountryCodeChange={setCountryCode}
              phoneNumber={phoneNumber}
              onPhoneNumberChange={setPhoneNumber}
              onConfirm={(doc) => handleConfirmOrder(doc)}
              onClose={() => setShowCartModal(false)}
            />
          </div>
        </div>
      )}

      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setCustomizingProduct(null);
              setDraftExcludedOptionalIds([]);
            }}
          />

          <div className="relative z-10 w-full max-w-md rounded-3xl border border-neutral-100 bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setCustomizingProduct(null);
                setDraftExcludedOptionalIds([]);
              }}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
              aria-label="Cerrar personalizacion"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="pr-10">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
                Personalizar
              </p>
              <h2 className="mt-1 text-lg font-black text-neutral-900">
                {customizingProduct.name}
              </h2>
              <p className="mt-1 text-xs font-semibold text-neutral-500">
                Los opcionales vienen incluidos. Desmarca los que no quieras.
              </p>
            </div>

            {getRequiredRecipeLines(customizingProduct).length > 0 ? (
              <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Incluye siempre
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {getRequiredRecipeLines(customizingProduct).map((line) => (
                    <span
                      key={line.ingredientId}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-neutral-700 ring-1 ring-neutral-100"
                    >
                      {line.ingredient?.name ?? "Ingrediente"}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Opcionales
              </p>
              {getOptionalRecipeLines(customizingProduct).map((line) => {
                const checked = !draftExcludedOptionalIds.includes(line.ingredientId);
                return (
                  <label
                    key={line.ingredientId}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-neutral-100 px-3 py-3 transition active:scale-[0.99]"
                  >
                    <span className="text-sm font-bold text-neutral-800">
                      {line.ingredient?.name ?? "Ingrediente"}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setDraftExcludedOptionalIds((prev) => {
                          if (event.target.checked) {
                            return prev.filter((id) => id !== line.ingredientId);
                          }
                          return Array.from(new Set([...prev, line.ingredientId]));
                        });
                      }}
                      className="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                );
              })}
            </div>

            {draftExcludedOptionalIds.length > 0 ? (
              <p className="mt-3 text-xs font-semibold text-neutral-500">
                Sin:{" "}
                {draftExcludedOptionalIds
                  .map(
                    (id) =>
                      customizingProduct.recipes?.find((line) => line.ingredientId === id)
                        ?.ingredient?.name,
                  )
                  .filter(Boolean)
                  .join(", ")}
              </p>
            ) : null}

            <button
              type="button"
              onClick={confirmCustomizedProduct}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-black text-white shadow-md transition hover:bg-emerald-600 active:scale-[0.99]"
            >
              <ShoppingBag className="h-4 w-4" />
              Agregar al carrito
            </button>
          </div>
        </div>
      )}

      <ReservationDrawer
        open={!!selectedService}
        onClose={resetReservationUi}
        itemId={selectedService?.id}
        businessSlug={slug}
        title={selectedService?.name}
        selectedDateValue={selectedDateKey}
        onConfirm={handleReserve}
      />

      <ProductDetailOverlay
        open={!!selectedProduct}
        item={selectedProduct}
        businessName={businessName}
        preview={preview}
        onClose={closeProductDetail}
        onPrimaryAction={() => {
          if (!selectedProduct) return;
          if (preview) {
            notify({
              type: "info",
              message: "Modo administrador: las compras estan deshabilitadas",
            });
            return;
          }
          openCustomizationOrAdd(selectedProduct);
          closeProductDetail();
        }}
      />

      <Footer config={footerConfig} />
    </div>
  );
}

function ProductCard({
  item,
  onOpen,
  onPlus,
  preview,
}: {
  item: Item;
  onOpen: () => void;
  onPlus: () => void;
  preview?: boolean;
}) {
  const images = item.images ?? [];
  const imageCount = images.length;
  const showCarousel = imageCount > 1;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;
  const badges = getItemBadges(item);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [item.id]);

  useEffect(() => {
    if (!showCarousel) return;

    const id = window.setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % imageCount);
    }, 3000);

    return () => window.clearInterval(id);
  }, [showCarousel, imageCount]);

  return (
    <div className="flex w-full max-w-[220px] flex-col">
      <div className="relative overflow-hidden rounded-3xl bg-neutral-100">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen();
            }
          }}
          className="block w-full cursor-pointer"
          aria-label={`Ver ${item.name}`}
        >
          <div className="relative aspect-[270/378] w-full">
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

            {badges.length ? (
              <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1">
                {badges.map((badge) => (
                  <div
                    key={`${badge.text}-${badge.color}`}
                    className="rounded-xl px-3 py-1 text-[8px] font-extrabold uppercase text-white"
                    style={{ background: badge.color }}
                  >
                    {badge.text}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {showCarousel && (
            <div className="absolute left-3 right-3 top-3 z-10 flex gap-1">
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
                      ? "bg-white"
                      : "bg-white/60",
                  ].join(" ")}
                  aria-label={`Imagen ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={preview}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPlus();
          }}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-950 shadow-none ring-1 ring-black/5 transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={item.type === "SERVICE" ? "Reservar" : "Agregar al carrito"}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 px-1">
        <div className="truncate text-[15px] font-extrabold leading-[1.2] text-[#0f172a]">
          {item.name}
        </div>
        {item.description?.trim() ? (
          <div className="mt-[2px] text-[11px] font-medium text-slate-500 [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical] overflow-hidden">
            {item.description.trim()}
          </div>
        ) : null}
        <div className="mt-1 text-[16px] font-black text-black">
          {formatCop(item.price)}
        </div>
      </div>
    </div>
  );
}

function ProductDetailOverlay({
  open,
  item,
  businessName,
  preview,
  onClose,
  onPrimaryAction,
}: {
  open: boolean;
  item: Item | null;
  businessName: string;
  preview: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = item?.images ?? [];
  const imageCount = images.length;
  const showCarousel = imageCount > 1;
  const badges = getItemBadges(item);

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

  useEffect(() => {
    if (!open || !showCarousel) return;

    const id = window.setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % imageCount);
    }, 3000);

    return () => window.clearInterval(id);
  }, [open, showCarousel, imageCount]);

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

        <div className="h-full w-full xl:hidden">
          <ReelLikeProductView
            item={item}
            businessName={businessName}
            preview={preview}
            onPrimaryAction={onPrimaryAction}
            currentImageIndex={currentImageIndex}
            onSelectImage={goToIndex}
            onPrev={goPrev}
            onNext={goNext}
          />
        </div>

        <div className="hidden h-full xl:flex">
          {/* LEFT: commercial info */}
          <div className="min-w-0 flex-1 bg-white px-12 py-10">
            <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
              <div className="max-w-2xl space-y-8 text-slate-900">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a la tienda
                </button>

                <div className="space-y-2">
                  <h1 className="text-5xl font-semibold tracking-tight leading-[1.05]">
                    {item.name}
                  </h1>
                  {businessName && (
                    <div className="text-base font-medium text-slate-600">
                      {businessName}
                    </div>
                  )}
                </div>

                {badges.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map((badge) => (
                      <div
                        key={`${badge.text}-${badge.color}`}
                        className="rounded-xl px-3 py-1 text-[8px] font-extrabold uppercase text-white"
                        style={{ background: badge.color }}
                      >
                        {badge.text}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="h-px w-full bg-black/5" />

                <div className="flex flex-wrap items-end justify-between gap-8">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      PRECIO
                    </div>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div className="text-4xl font-black tracking-tight text-slate-900">
                        ${formatPrice(item.price)}
                      </div>
                      {item.previousPrice != null &&
                        Number.isFinite(item.previousPrice) &&
                        item.previousPrice > item.price && (
                          <div className="text-base text-slate-400 line-through">
                            ${formatPrice(item.previousPrice)}
                          </div>
                        )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={preview}
                    onClick={onPrimaryAction}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#11d473] px-6 text-sm font-bold text-white shadow-[0_0_24px_rgba(17,212,115,0.35)] transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Comprar
                    <ArrowRight className="h-4 w-4" />
                  </button>
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

                {/* <BenefitsList /> */}
              </div>
            </div>
          </div>

          {/* RIGHT: image only */}
          <div className="flex-1 bg-white">
            <DesktopProductImage
              item={item}
              currentImageIndex={currentImageIndex}
              onSelectImage={goToIndex}
              onPrev={goPrev}
              onNext={goNext}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopProductImage({
  item,
  currentImageIndex,
  onSelectImage,
  onPrev,
  onNext,
}: {
  item: Item;
  currentImageIndex: number;
  onSelectImage: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const images = item.images ?? [];
  const showCarousel = images.length > 1;
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;

  return (
    <div className="h-full w-full overflow-hidden bg-neutral-100">
      <div className="relative h-full w-full">
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
                  key={image.id ?? `${item.id}-detail-seg-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectImage(index);
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
                onPrev();
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
                onNext();
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
  );
}

/* function BenefitsList() {
  return (
    <div className="space-y-6 pt-2">
      <div className="h-px w-full bg-white/10" />

      <div className="space-y-5">
        <BenefitRow
          icon={<ShieldCheck className="h-5 w-5 text-white/70" />}
          title="Compra segura"
          subtitle="Tus datos están protegidos"
        />
        <BenefitRow
          icon={<Truck className="h-5 w-5 text-white/70" />}
          title="Envío rápido"
          subtitle="Recibe tu pedido en tiempo récord"
        />
        <BenefitRow
          icon={<RotateCcw className="h-5 w-5 text-white/70" />}
          title="Devoluciones"
          subtitle="30 días para cambios y devoluciones"
        />
      </div>
    </div>
  );
}

function BenefitRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-sm text-white/55">{subtitle}</div>
      </div>
    </div>
  );
}

} */

function ReelLikeProductView({
  item,
  businessName,
  preview,
  onPrimaryAction,
  currentImageIndex,
  onSelectImage,
  onPrev,
  onNext,
}: {
  item: Item;
  businessName: string;
  preview: boolean;
  onPrimaryAction: () => void;
  currentImageIndex: number;
  onSelectImage: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const images = item.images ?? [];
  const showCarousel = images.length > 1;
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;
  const badges = getItemBadges(item);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      {/* IMAGE (full-bleed, no margins, no radius) */}
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
                  key={image.id ?? `${item.id}-mobile-seg-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectImage(index);
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
              onClick={onPrev}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={onNext}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* FOOTER (full width bar, no rounded “card”) */}
      <div className="w-full bg-white/85 px-5 py-4 backdrop-blur border-b border-black/5">
        <div className="space-y-2 pb-3">
          <div className="text-[18px] font-extrabold leading-tight text-slate-900">
            {item.name}
          </div>
          {businessName && (
            <div className="text-xs font-semibold text-slate-600">
              {businessName}
            </div>
          )}

          {badges.length ? (
            <div className="flex flex-wrap gap-1.5">
              {badges.map((badge) => (
                <div
                  key={`${badge.text}-${badge.color}`}
                  className="rounded-xl px-3 py-1 text-[8px] font-extrabold uppercase text-white"
                  style={{ background: badge.color }}
                >
                  {badge.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              PRECIO
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="text-3xl font-black tracking-tight text-slate-900">
                ${formatPrice(item.price)}
              </div>
              {item.previousPrice != null &&
                Number.isFinite(item.previousPrice) &&
                item.previousPrice > item.price && (
                  <div className="ml-3 text-base text-slate-400 line-through">
                    ${formatPrice(item.previousPrice)}
                  </div>
                )}
            </div>
          </div>

          <button
            type="button"
            disabled={preview}
            onClick={onPrimaryAction}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#11d473] px-6 text-sm font-bold text-white shadow-[0_0_24px_rgba(17,212,115,0.35)] transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingBag className="h-4 w-4" />
            Comprar
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* DESCRIPTION (padding only here; no heavy card) */}
      <div className="mx-auto min-h-0 w-full max-w-md overflow-y-auto px-4 pb-6 pt-4 custom-scrollbar">
        <div className="space-y-2 text-slate-900">
          {businessName && (
            <div className="text-xs font-semibold text-slate-600">
              {businessName}
            </div>
          )}

          {item.description && (
            <p className="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">
              {item.description}
            </p>
          )}
        </div>

        {/*
        <div className="pt-6">
          <BenefitsList />
        </div>
        */}
      </div>
    </div>
  );
}
