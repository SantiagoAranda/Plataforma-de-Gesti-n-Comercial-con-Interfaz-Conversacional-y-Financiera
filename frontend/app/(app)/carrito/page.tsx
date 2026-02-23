"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";
import AppHeader from "@/src/components/layout/AppHeader";

type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  imageUrl?: string;
  type?: "PRODUCT" | "SERVICE";
};

const MOCK_CART: CartItem[] = [
  {
    id: "1",
    name: "Cámara Digital Pro",
    price: 299,
    qty: 1,
    imageUrl:
      "https://imgs.search.brave.com/tTiqOkqdDab-IUZgPsYEiQ1vWPAFFFjIiVqTBWaE13g/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9tZWRp/YS5nZXR0eWltYWdl/cy5jb20vaWQvMTcz/Njk2NTI5L2VzL2Zv/dG8vYyVDMyVBMW1h/cmEtZGlnaXRhbC1w/cm8uanBnP3M9NjEy/eDYxMiZ3PTAmaz0y/MCZjPTNQNmEySnFJ/Y0VqTEJUZjlTbjNL/VDI5QkY2QnZMVlVY/blFFdkNSTGR3ZDQ9",
  },
  {
    id: "2",
    name: "Corte de Cabello Pro",
    price: 25,
    qty: 1,
    imageUrl:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80",
  },
];

const TAX_RATE = 0.16;

export default function CarritoPage() {
  const [items, setItems] = useState<CartItem[]>(MOCK_CART);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.price * it.qty, 0),
    [items]
  );
  const taxes = useMemo(() => subtotal * TAX_RATE, [subtotal]);
  const total = useMemo(() => subtotal + taxes, [subtotal, taxes]);

  const inc = (id: string) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it))
    );

  const dec = (id: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, qty: Math.max(1, it.qty - 1) } : it
      )
    );

  const remove = (id: string) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  // ✅ CORREGIDO
  const handleCheckout = () => {
    const message = formatSaleMessage({
      businessName: "Mi Negocio",
      customerName: "Juan Pérez",
      items: items.map((it) => ({
        qty: it.qty,
        name: it.name,
        price: it.price,
      })),
    });

    const url = buildWhatsAppUrl("5493424353124", message);
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <AppHeader title="Mi Carrito" showBack />

      <main className="mx-auto w-full max-w-md px-4 pb-44 pt-3">
        <div className="space-y-3">
          {items.map((it) => (
            <CartCard
              key={it.id}
              item={it}
              onInc={() => inc(it.id)}
              onDec={() => dec(it.id)}
              onRemove={() => remove(it.id)}
            />
          ))}
        </div>
      </main>

      <CheckoutSummary
        subtotal={subtotal}
        taxes={taxes}
        total={total}
        disabled={items.length === 0}
        onCheckout={handleCheckout}
      />
    </div>
  );
}

function CartCard({
  item,
  onInc,
  onDec,
  onRemove,
}: {
  item: CartItem;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="flex gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-xl bg-gray-100">
          <img
            src={item.imageUrl ?? ""}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold">
                {item.name}
              </div>
              <div className="text-[16px] font-extrabold text-emerald-600">
                ${item.price.toFixed(2)}
              </div>
            </div>

            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg p-2 text-gray-400"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-2 flex justify-end">
            <div className="flex items-center gap-3 rounded-full bg-gray-100 px-3 py-1.5">
              <button onClick={onDec}>
                <Minus className="h-4 w-4" />
              </button>
              <div className="w-5 text-center">{item.qty}</div>
              <button onClick={onInc}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutSummary({
  subtotal,
  taxes,
  total,
  disabled,
  onCheckout,
}: {
  subtotal: number;
  taxes: number;
  total: number;
  disabled: boolean;
  onCheckout: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-4">
      <div className="rounded-2xl bg-white px-4 pb-4 pt-4 shadow-2xl ring-1 ring-black/5">
        <div className="space-y-2 text-[15px]">
          <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
          <Row label="Impuestos (16%)" value={`$${taxes.toFixed(2)}`} />
          <div className="my-2 h-px bg-black/5" />

          <div className="flex items-end justify-between">
            <div className="font-semibold">Total</div>
            <div className="font-extrabold">
              ${total.toFixed(2)}
            </div>
          </div>
        </div>

        <button
          disabled={disabled}
          onClick={onCheckout}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-full bg-emerald-600 py-3 font-semibold text-white"
        >
          Finalizar Pedido
          <ShoppingBag className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-gray-500">
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}