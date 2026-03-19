"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

export type FilterStatus = "ALL" | "PENDING" | "CLOSED" | "CANCELLED";

type Props = {
  open: boolean;
  onClose: () => void;
  status: FilterStatus;
  onChange: (status: FilterStatus) => void;
};

const OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "ALL", label: "Todas las ventas" },
  { value: "PENDING", label: "Pendientes (y por cobrar)" },
  { value: "CLOSED", label: "Cerradas (cobradas)" },
  { value: "CANCELLED", label: "Canceladas" },
];

export default function SalesFilterModal({ open, onClose, status, onChange }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transform bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-neutral-900">Estado de la Venta</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-2 pb-8">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                onClose();
              }}
              className="w-full flex items-center justify-between px-4 py-4 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 transition text-left"
            >
              <span
                className={`text-[15px] ${
                  status === opt.value
                    ? "font-bold text-emerald-600"
                    : "font-medium text-neutral-700"
                }`}
              >
                {opt.label}
              </span>
              {status === opt.value && <Check size={18} className="text-emerald-500" />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
