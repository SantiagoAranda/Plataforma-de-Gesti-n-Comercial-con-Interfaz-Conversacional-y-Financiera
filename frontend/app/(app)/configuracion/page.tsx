"use client";

import AppHeader from "@/src/components/layout/AppHeader";

export default function ConfiguracionPage() {
  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader
        title="Configuración"
        subtitle="Ajustes del sistema"
        showBack
        hrefBack="/home"
      />

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">Footer</p>
            <p className="mt-2 text-sm text-neutral-500">
              Próximamente vas a poder configurar la información del pie de
              página de tu tienda.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}