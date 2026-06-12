"use client";

import { useState } from "react";
import { ShoppingBag, Minus, Plus, X } from "lucide-react";
import PhoneSelector from "./PhoneSelector";
import toast from "react-hot-toast";
import { validatePhoneNumber } from "@/src/constants/countryCodes";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  excludedOptionalIngredientNames?: string[];
}

type Props = {
  items: CartItem[];
  onIncreaseQty: (id: string) => void;
  onDecreaseQty: (id: string) => void;
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  countryCode: string;
  onCountryCodeChange: (val: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (val: string) => void;
  onConfirm: (documentVal?: string) => void;
  onClose: () => void;
};

export default function CartSummary({
  items,
  onIncreaseQty,
  onDecreaseQty,
  customerName,
  onCustomerNameChange,
  countryCode,
  onCountryCodeChange,
  phoneNumber,
  onPhoneNumberChange,
  onConfirm,
  onClose,
}: Props) {
  const [document, setDocument] = useState("");
  const total = items.reduce((acc, it) => acc + it.price * it.quantity, 0);

  const formatPrice = (value: number) => {
    return value.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  // Validaciones básicas de formulario
  const isNameValid = customerName.trim().length >= 3;
  const { isValid: isPhoneValid } = validatePhoneNumber(countryCode, phoneNumber);
  const isFormValid = isNameValid && isPhoneValid && items.length > 0;

  const handleConfirm = () => {
    if (items.length === 0) {
      toast.error("El carrito está vacío.");
      return;
    }
    if (customerName.trim().length < 3) {
      toast.error("Por favor, ingresa tu nombre completo (mínimo 3 caracteres).");
      return;
    }
    const { isValid, error } = validatePhoneNumber(countryCode, phoneNumber);
    if (!isValid) {
      toast.error(error || "El número de teléfono es incorrecto.");
      return;
    }

    // Pasa la cédula opcional al confirmar
    onConfirm(document);
  };

  return (
    <div className="relative bg-white rounded-3xl shadow-2xl border border-neutral-100/50 overflow-hidden w-full max-w-md">
      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition z-10 cursor-pointer"
        aria-label="Cerrar modal"
      >
        <X size={18} />
      </button>

      {/* Header Banner - Fondo Blanco e Iconografía Lineal Verde */}
      <div className="px-6 pt-6 pb-4 border-b border-neutral-100 flex items-center gap-3">
        <ShoppingBag className="h-5 w-5 text-emerald-500" />
        <div>
          <h2 className="text-[17px] font-semibold text-neutral-800 leading-tight">Resumen de Pedido</h2>
          <p className="text-[11px] text-neutral-400 font-medium mt-0.5">Gestiona tu pago de forma clara</p>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 space-y-6">
        {/* Products List */}
        <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 p-3 bg-neutral-50/50 rounded-xl border border-neutral-100"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-800 truncate">
                  {item.name}
                </span>
                <span className="block text-sm font-medium text-emerald-600 mt-0.5">
                  ${formatPrice(item.price)}
                </span>
                {item.excludedOptionalIngredientNames?.length ? (
                  <span className="mt-1 block text-[11px] font-semibold text-neutral-500">
                    Sin: {item.excludedOptionalIngredientNames.join(", ")}
                  </span>
                ) : null}
              </div>

              {/* Quantity controller */}
              <div className="flex items-center gap-2 bg-neutral-100 rounded-full px-2.5 py-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onDecreaseQty(item.id)}
                  className="text-neutral-500 hover:text-neutral-800 font-semibold text-sm w-4 h-4 flex items-center justify-center transition"
                >
                  <Minus size={12} />
                </button>
                <span className="text-xs font-semibold text-neutral-700 w-4 text-center select-none">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onIncreaseQty(item.id)}
                  className="text-neutral-500 hover:text-neutral-800 font-semibold text-sm w-4 h-4 flex items-center justify-center transition"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-6 text-xs text-neutral-400 font-medium uppercase tracking-wider">
              Tu carrito está vacío
            </div>
          )}
        </div>

        {/* Contact Form */}
        <div className="space-y-3 pt-4 border-t border-neutral-100">
          <input
            type="text"
            placeholder="Nombre completo"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />

          <input
            type="text"
            placeholder="Cédula / NIT (Opcional)"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />

          <PhoneSelector
            countryCode={countryCode}
            onCountryCodeChange={onCountryCodeChange}
            phoneNumber={phoneNumber}
            onPhoneNumberChange={onPhoneNumberChange}
            dropdownPosition="top"
          />

          <p className="text-[11px] font-medium text-emerald-600 px-1 italic">
            * Coordinamos envío y comunicación por este medio.
          </p>
        </div>

        {/* Total Final */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
          <span className="text-base font-medium text-neutral-800">Total a pagar</span>
          <span className="text-2xl font-semibold text-neutral-900">${formatPrice(total)}</span>
        </div>

        {/* Action Button - Verde corporativo y estilo integrado */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={items.length === 0}
          className={`w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium text-sm shadow-md transition flex items-center justify-center gap-2 mt-4 ${!isFormValid ? "opacity-50 cursor-not-allowed" : ""
            }`}
        >
          <ShoppingBag size={16} />
          Confirmar Pedido
        </button>
      </div>
    </div>
  );
}
