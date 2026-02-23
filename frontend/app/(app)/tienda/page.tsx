"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, ChevronDown, ShoppingBag, Plus } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNav from "@/src/components/layout/BottomNav";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type ItemType = "PRODUCT" | "SERVICE";

type Item = {
    id: string;
    name: string;
    price: number;
    type: ItemType;
    category?: string;
    imageUrl?: string;
    description?: string;
    durationMin?: number; // para servicios
};

const MOCK_ITEMS: Item[] = [
    {
        id: "1",
        name: "Cámara Digital Pro",
        price: 299,
        type: "PRODUCT",
        category: "Electrónica",
        imageUrl:
            "https://imgs.search.brave.com/tTiqOkqdDab-IUZgPsYEiQ1vWPAFFFjIiVqTBWaE13g/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9tZWRp/YS5nZXR0eWltYWdl/cy5jb20vaWQvMTcz/Njk2NTI5L2VzL2Zv/dG8vYyVDMyVBMW1h/cmEtZGlnaXRhbC1w/cm8uanBnP3M9NjEy/eDYxMiZ3PTAmaz0y/MCZjPTNQNmEySnFJ/Y0VqTEJUZjlTbjNL/VDI5QkY2QnZMVlVY/blFFdkNSTGR3ZDQ9",
    },
    {
        id: "2",
        name: "Reloj Inteligente",
        price: 150,
        type: "PRODUCT",
        category: "Electrónica",
        imageUrl:
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
    },
    {
        id: "3",
        name: "Auriculares BT",
        price: 89,
        type: "PRODUCT",
        category: "Electrónica",
        imageUrl:
            "https://imgs.search.brave.com/kkbxk9caTtp9kJe_N-TbF_0kDP83wlKIyVFpXN6-VYg/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4w/MS5sYWFub25pbWEu/Y29tLmFyL3dlYi9p/bWFnZXMvcHJvZHVj/dG9zL2EvMDAwMDA1/NzAwMC81NzcwOC5q/cGc",
    },
    {
        id: "4",
        name: "Mochila Urbana",
        price: 45,
        type: "PRODUCT",
        category: "Hogar",
        imageUrl:
            "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80",
    },
    {
        id: "5",
        name: "Sesión de Pilates Reformer",
        price: 25,
        type: "SERVICE",
        category: "Hogar",
        description: "Sesión guiada 1 a 1.",
        durationMin: 50,
        imageUrl:
            "https://imgs.search.brave.com/bmWinY3XB-Uw2rqrucmWJWWERLby1Or8zV1wKbDohH8/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMjIx/MTMwMjkzNy9waG90/by9jbG9zZS11cC1v/Zi1waWxhdGVzLXJl/Zm9ybWVyLW1hY2hp/bmUtaW4tbW9kZXJu/LWZpdG5lc3Mtc3R1/ZGlvLWVxdWlwbWVu/dC11c2VkLWZvci1i/b2R5LmpwZz9zPTYx/Mng2MTImdz0wJms9/MjAmYz1FTVRXaXhm/WE9HOHhLUGpYVzBO/aDcycktlY0lIYjJa/NFFlZGN0RnlBdy1R/PQ",
    },
];

export default function MiTiendaPage() {
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<"Todo" | "Electrónica" | "Hogar">("Todo");
    const [cart, setCart] = useState<Record<string, number>>({});
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const router = useRouter();

    const cartCount = useMemo(
        () => Object.values(cart).reduce((a, b) => a + b, 0),
        [cart],
    );

    const items = useMemo(() => {
        return MOCK_ITEMS.filter((i) => {
            const matchQuery = i.name
                .toLowerCase()
                .includes(query.toLowerCase().trim());
            const matchTab = tab === "Todo" ? true : i.category === tab;
            return matchQuery && matchTab;
        });
    }, [query, tab]);

    const addToCart = (id: string) => {
        setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    };

    return (
        <div className="min-h-dvh bg-[#F7FAF8]">
            <AppHeader title="Tienda" showBack={true} />

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
                <div className="mt-5 grid grid-cols-2 gap-4 items-stretch">
                    {items.map((it) => (
                        <ProductCard
                            key={it.id}
                            item={it}
                            onAdd={() => addToCart(it.id)}
                            onDetail={() => setSelectedItem(it)}
                        />
                    ))}
                </div>
            </main>

            {/* FAB Ir al carrito */}
            {true && (
                <button
                    onClick={() => {
                        router.push("/carrito");
                    }}
                    className="fixed bottom-[88px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl active:scale-95 transition"
                >
                    <ShoppingBag className="h-6 w-6" />

                    {/* Badge contador */}
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-emerald-600 shadow">
                        {cartCount}
                    </span>
                </button>
            )}
            {selectedItem && (
                <div className="fixed inset-0 z-[9999] flex items-end bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-md mx-auto rounded-t-3xl bg-white p-5 animate-slideUp">
                        {/* Barra superior */}
                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />

                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold">Detalles del Producto</h2>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="text-gray-500 text-xl"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="overflow-hidden rounded-2xl">
                            <img
                                src={selectedItem.imageUrl ?? ""}
                                className="w-full object-cover"
                            />
                        </div>

                        <div className="mt-4 space-y-4">
                            <div>
                                <p className="text-sm font-semibold text-emerald-700 uppercase">
                                    Nombre del Producto
                                </p>
                                <div className="mt-1 rounded-xl bg-gray-100 p-3 text-lg">
                                    {selectedItem.name}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-emerald-700 uppercase">
                                    Precio
                                </p>
                                <div className="mt-1 rounded-xl bg-gray-100 p-3 text-lg">
                                    ${selectedItem.price.toFixed(2)}
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-emerald-700 uppercase">
                                    Descripción
                                </p>
                                <div className="mt-1 rounded-xl bg-gray-100 p-3">
                                    Producto premium de alta calidad.
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    addToCart(selectedItem.id);
                                    setSelectedItem(null);
                                }}
                                className="mt-4 w-full rounded-full bg-emerald-600 py-4 text-lg font-semibold text-white shadow-lg"
                            >
                                Agregar al carrito
                            </button>
                        </div>
                    </div>
                </div>
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
    onDetail,
}: {
    item: Item;
    onAdd: () => void;
    onDetail: () => void;
}) {
    return (
        <div className="flex h-full flex-col rounded-[10px] bg-white shadow-sm ring-1 ring-black/5">
            <div className="aspect-square w-full overflow-hidden rounded-t-[10px] bg-gray-100">
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
function ItemDetailSheet({
    item,
    onClose,
    onAdd,
}: {
    item: Item;
    onClose: () => void;
    onAdd: () => void;
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, []);

    if (!mounted) return null;

    const isService = item.type === "SERVICE";
    const title = isService ? "Detalles del Servicio" : "Detalles del Producto";

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="rounded-t-3xl bg-white p-5 shadow-2xl">
                    {/* Handle */}
                    <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />

                    {/* Header */}
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-bold">{title}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-2 text-gray-500 hover:bg-black/5"
                            aria-label="Cerrar"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Content scrollable */}
                    <div className="max-h-[75dvh] overflow-y-auto pr-1">
                        {/* Imagen: en servicios puede no existir, entonces mostramos placeholder */}
                        <div className="overflow-hidden rounded-2xl bg-gray-100">
                            {item.imageUrl ? (
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="w-full object-cover"
                                />
                            ) : (
                                <div className="aspect-[4/3] w-full bg-gradient-to-br from-black/5 to-black/0" />
                            )}
                        </div>

                        <div className="mt-4 space-y-4">
                            {/* Nombre */}
                            <Field
                                label={
                                    isService ? "Nombre del Servicio" : "Nombre del Producto"
                                }
                            >
                                {item.name}
                            </Field>

                            {/* Precio */}
                            <Field label="Precio">${item.price.toFixed(2)}</Field>

                            {/* Duración (solo servicios) */}
                            {isService && (
                                <Field label="Duración">
                                    {item.durationMin ? `${item.durationMin} min` : "—"}
                                </Field>
                            )}

                            {/* Descripción */}
                            <Field label="Descripción">
                                {item.description ??
                                    (isService
                                        ? "Servicio premium de alta calidad."
                                        : "Producto premium de alta calidad.")}
                            </Field>

                            <div className="pb-3">
                                <button
                                    type="button"
                                    onClick={onAdd}
                                    className="mt-2 w-full rounded-full bg-emerald-600 py-4 text-lg font-semibold text-white shadow-lg active:scale-[0.99]"
                                >
                                    {isService
                                        ? "Agregar servicio al carrito"
                                        : "Agregar al carrito"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="h-[env(safe-area-inset-bottom)]" />
                </div>
            </div>
        </div>,
        document.body,
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
