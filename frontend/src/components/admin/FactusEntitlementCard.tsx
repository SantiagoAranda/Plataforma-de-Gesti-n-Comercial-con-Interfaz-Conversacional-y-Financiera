import type { AdminFactus } from "@/src/lib/admin/factusEntitlement";

export function FactusEntitlementCard({ factus, saving, onToggle }: {
  factus: AdminFactus;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100 space-y-4" aria-label="Facturación electrónica">
      <h3 className="text-lg font-semibold text-neutral-900">Facturación electrónica</h3>
      <p className="text-sm text-neutral-500">
        Permite que este negocio utilice la integración de facturación electrónica con Factus.
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-neutral-900" aria-live="polite">
          {factus.enabled ? "Activada" : "Desactivada"}
          {saving && <span className="ml-2 text-neutral-500">Guardando…</span>}
        </span>
        <button
          type="button"
          role="switch"
          aria-label="Habilitar facturación electrónica"
          aria-checked={factus.enabled}
          aria-busy={saving}
          disabled={saving}
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 ${factus.enabled ? "bg-emerald-600" : "bg-neutral-300"}`}
        >
          <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform ${factus.enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      <div className="text-xs text-neutral-500 space-y-1">
        <p>Entorno: {factus.environment === "production" ? "Producción" : "Sandbox"}</p>
        <p>Configuración: {factus.configured ? "Configurada" : "Sin configurar"}</p>
        <p>La presencia de credenciales no implica que hayan sido verificadas contra Factus.</p>
      </div>
    </section>
  );
}
