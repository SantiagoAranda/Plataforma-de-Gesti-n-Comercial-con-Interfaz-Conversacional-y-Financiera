"use client";

import AppHeader from "@/src/components/layout/AppHeader";

export default function ConfiguracionPage() {
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Configuración" showBack hrefBack="/home" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <div className="rounded-3xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm ring-1 ring-black/5">
            Pantalla en construcción.
          </div>
        </div>
      </main>
    </div>
  );
}

