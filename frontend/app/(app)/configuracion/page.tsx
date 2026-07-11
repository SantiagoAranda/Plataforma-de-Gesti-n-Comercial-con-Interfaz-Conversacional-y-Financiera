"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";

export default function ConfiguracionPage() {
  const { taxSettingsEnabled, taxSettingsLoading, setTaxSettingsEnabled } = useTaxSettings();

  return (
    <div className="flex h-screen flex-col overflow-x-hidden bg-white">
      <AppHeader
        title="Configuracion"
        subtitle="Ajustes del sistema"
        showBack
        hrefBack="/home"
      />

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10">
        <div className="mx-auto w-full max-w-xl space-y-4">
          <Link
            href="/configuracion/rut-impuestos"
            className="flex min-w-0 items-center justify-between gap-4 rounded-3xl border border-black/5 bg-white p-5 shadow-sm transition duration-200 hover:bg-neutral-50/50"
          >
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Landmark className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900">
                  RUT e Impuestos
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  {taxSettingsEnabled
                    ? "Cálculos fiscales activos: IVA, retenciones y Régimen Simple."
                    : "Ventas sin cálculos fiscales. Puedes activar impuestos cuando lo necesites."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <label
                className="relative inline-flex cursor-pointer items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  disabled={taxSettingsLoading}
                  checked={Boolean(taxSettingsEnabled)}
                  onChange={(e) => {
                    e.stopPropagation();
                    setTaxSettingsEnabled(e.target.checked);
                  }}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-disabled:opacity-50"></div>
              </label>
              <div className="text-sm font-semibold text-neutral-400">
                {">"}
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
