"use client";

import { type ReactNode } from "react";
import { ShoppingBag, Minus, Plus, Pencil, Trash2, X } from "lucide-react";
import PhoneSelector from "./PhoneSelector";
import toast from "react-hot-toast";
import { validatePhoneNumber } from "@/src/constants/countryCodes";

interface CartItem {
  id: string;
  cartKey?: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptionNames?: string[];
  excludedOptionalIngredientNames?: string[];
}

type Props = {
  items: CartItem[];
  onIncreaseQty: (id: string) => void;
  onDecreaseQty: (id: string) => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  documentNumber: string;
  onDocumentNumberChange: (val: string) => void;
  buyerEmail: string;
  onBuyerEmailChange: (val: string) => void;
  countryCode: string;
  onCountryCodeChange: (val: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (val: string) => void;
  onConfirm: (documentVal?: string) => void;
  onClose: () => void;
  taxPreviewContent?: ReactNode;
  fiscalContent?: ReactNode;
};

export default function CartSummary({
  items,
  onIncreaseQty,
  onDecreaseQty,
  onEdit,
  onRemove,
  customerName,
  onCustomerNameChange,
  documentNumber,
  onDocumentNumberChange,
  buyerEmail,
  onBuyerEmailChange,
  countryCode,
  onCountryCodeChange,
  phoneNumber,
  onPhoneNumberChange,
  onConfirm,
  onClose,
  taxPreviewContent,
  fiscalContent,
}: Props) {
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

    onConfirm(documentNumber);
  };

  return (
    <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-neutral-100/50 bg-white shadow-2xl sm:max-h-[92dvh]">
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
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <ShoppingBag className="h-5 w-5 text-emerald-500" />
        <div>
          <h2 className="text-[17px] font-semibold text-neutral-800 leading-tight">Resumen de Pedido</h2>
          <p className="text-[11px] text-neutral-400 font-medium mt-0.5">Gestiona tu pago de forma clara</p>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        {/* Products List */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.cartKey ?? item.id}
              className="flex items-center justify-between gap-4 p-3 bg-neutral-50/50 rounded-xl border border-neutral-100"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-800 truncate">
                  {item.name}
                </span>
                <span className="block text-sm font-medium text-emerald-600 mt-0.5">
                  ${formatPrice(item.price)}
                </span>
                {item.selectedOptionNames?.length ? (
                  <span className="mt-1 block text-[11px] font-semibold text-neutral-500">
                    Opciones: {item.selectedOptionNames.join(", ")}
                  </span>
                ) : null}
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
                  onClick={() => onDecreaseQty(item.cartKey ?? item.id)}
                  className="text-neutral-500 hover:text-neutral-800 font-semibold text-sm w-4 h-4 flex items-center justify-center transition"
                >
                  <Minus size={12} />
                </button>
                <span className="text-xs font-semibold text-neutral-700 w-4 text-center select-none">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onIncreaseQty(item.cartKey ?? item.id)}
                  className="text-neutral-500 hover:text-neutral-800 font-semibold text-sm w-4 h-4 flex items-center justify-center transition"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="flex shrink-0 gap-1">
                {onEdit && (
                  <button type="button" onClick={() => onEdit(item.cartKey ?? item.id)} className="p-1.5 text-neutral-400 hover:text-emerald-600" aria-label="Editar producto">
                    <Pencil size={14} />
                  </button>
                )}
                {onRemove && (
                  <button type="button" onClick={() => onRemove(item.cartKey ?? item.id)} className="p-1.5 text-neutral-400 hover:text-rose-600" aria-label="Eliminar producto">
                    <Trash2 size={14} />
                  </button>
                )}
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
        <div className="space-y-3 border-t border-neutral-100 pt-4">
          <label htmlFor="public-order-customer-name" className="sr-only">Nombre completo</label>
          <input
            id="public-order-customer-name"
            type="text"
            placeholder="Nombre completo"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />

          <label htmlFor="public-order-document" className="sr-only">Cédula o NIT opcional</label>
          <input
            id="public-order-document"
            type="text"
            placeholder="Cédula / NIT (Opcional)"
            value={documentNumber}
            onChange={(e) => onDocumentNumberChange(e.target.value)}
            className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
          />

          <label htmlFor="public-order-email" className="sr-only">Correo opcional</label>
          <input
            id="public-order-email"
            type="email"
            placeholder="Correo (Opcional)"
            value={buyerEmail}
            onChange={(e) => onBuyerEmailChange(e.target.value)}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-[#0B3F64] focus:ring-1 focus:ring-[#0B3F64]"
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

        {taxPreviewContent}
        {fiscalContent}

      </div>

      <div className="shrink-0 border-t border-neutral-100 bg-white px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-neutral-800">Total a pagar</span>
          <span className="text-2xl font-semibold text-neutral-900">${formatPrice(total)}</span>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={items.length === 0}
          className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-medium text-white shadow-md transition hover:bg-emerald-600 ${!isFormValid ? "cursor-not-allowed opacity-50" : ""
            }`}
        >
          <ShoppingBag size={16} />
          Confirmar Pedido
        </button>
      </div>
    </div>
  );
}
