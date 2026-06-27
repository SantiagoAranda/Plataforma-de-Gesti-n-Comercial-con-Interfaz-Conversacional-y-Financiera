"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";

export default function ConfiguracionPage() {
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
                  Perfil fiscal, responsabilidades DIAN y tarifas ICA municipales.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold text-neutral-400">
              {">"}
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
