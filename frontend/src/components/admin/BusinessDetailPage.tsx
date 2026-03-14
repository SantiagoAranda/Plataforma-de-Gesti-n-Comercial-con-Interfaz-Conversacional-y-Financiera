"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import AppHeader from "@/src/components/layout/AppHeader";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import { cn } from "@/src/lib/utils";

type BusinessDetail = {
  id: string
  name: string
  slug: string
  logoUrl?: string
  phoneWhatsapp: string
  status: "ACTIVE" | "INACTIVE"
  createdAt: string
  _count?: {
    items: number
  }
}

type Props = {
  businessId: string;
};

export function BusinessDetailPage({ businessId }: Props) {
  const { notify } = useNotification();
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);

  const fetchBusiness = async () => {
    setLoading(true);
    try {
      const data = await api<BusinessDetail>(`/businesses/admin/${businessId}`);
      setBusiness(data);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información del negocio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusiness();
  }, [businessId]);

  const handleToggleStatus = async () => {
    if (!business) return;
    
    setUpdating(true);
    const patchUrl = business.status === "ACTIVE" 
      ? `/businesses/${business.id}/inactivate` 
      : `/businesses/${business.id}/activate`;

    try {
      await api(patchUrl, { method: "PATCH" });
      
      notify({
        type: "success",
        message: business.status === "ACTIVE" ? "Negocio inhabilitado correctamente" : "Negocio reactivado correctamente"
      });
      
      await fetchBusiness();
    } catch (err) {
      console.error(err);
      notify({ type: "error", message: "No se pudo actualizar el estado del negocio" });
    } finally {
      setUpdating(false);
    }
  };

  return (
  <div className="flex h-screen flex-col bg-neutral-50/50">
    <AppHeader
      title={business?.name || "Detalle de Negocio"}
      subtitle="Información general"
      showBack
    />

    <main className="flex-1 px-4 py-6 pb-24">
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-neutral-200 rounded" />
          <div className="h-4 w-64 bg-neutral-200 rounded" />
          <div className="h-4 w-56 bg-neutral-200 rounded" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {business && !loading && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="h-24 w-24 rounded-full bg-white shadow-sm border border-neutral-100 overflow-hidden grid place-items-center">
              {business.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-neutral-300">
                  {business.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold text-neutral-900">
                {business.name}
              </h2>
              <p className="text-sm font-medium text-neutral-500">
                @{business.slug}
              </p>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100 space-y-5">
            <DetailItem
              label="Teléfono WhatsApp"
              value={business.phoneWhatsapp}
            />

            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                label="Estado"
                value={business.status === "ACTIVE" ? "Activo" : "Inactivo"}
                valueClassName={
                  business.status === "ACTIVE"
                    ? "text-emerald-600 font-bold"
                    : "text-neutral-500 font-bold"
                }
              />

              <DetailItem
                label="Registro"
                value={new Date(business.createdAt).toLocaleDateString()}
              />
            </div>

            <DetailItem
              label="Productos registrados"
              value={(business._count?.items ?? 0).toString()}
            />
          </div>

          <button
            onClick={() =>
              window.open(`/tienda/${business.slug}?preview=true`, "_blank")
            }
            className="w-full rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition"
          >
            Ver tienda
          </button>

          <div className="p-4 text-center">
            <p className="text-xs text-neutral-400">ID: {business.id}</p>
          </div>
        </div>
      )}
    </main>

    {business && (
      <div className="sticky bottom-0 bg-white p-4 border-t border-neutral-100">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={updating}
          className={cn(
            "w-full py-4 rounded-2xl font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50",
            business.status === "ACTIVE"
              ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100"
              : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
          )}
        >
          {updating
            ? "Actualizando..."
            : business.status === "ACTIVE"
            ? "Inhabilitar negocio"
            : "Reactivar negocio"}
        </button>
      </div>
    )}

    {/* Modal confirmación */}
    {showConfirm && business && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/30"
          onClick={() => setShowConfirm(false)}
        />

        <div className="relative bg-white rounded-2xl p-6 w-[90%] max-w-sm shadow-xl z-10">
          <h3 className="text-lg font-semibold text-neutral-900">
            Confirmar acción
          </h3>

          <p className="text-sm text-neutral-500 mt-2">
            {business.status === "ACTIVE"
              ? "¿Seguro que deseas inhabilitar este negocio?"
              : "¿Seguro que deseas reactivar este negocio?"}
          </p>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 border border-neutral-200 rounded-xl py-2 font-medium"
            >
              Cancelar
            </button>

            <button
              onClick={() => {
                setShowConfirm(false);
                handleToggleStatus();
              }}
              className={`flex-1 text-white rounded-xl py-2 font-medium ${
                business.status === "ACTIVE"
                  ? "bg-red-500"
                  : "bg-emerald-600"
              }`}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
}

function DetailItem({
  label,
  value,
  valueClassName = "text-neutral-900",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
        {label}
      </span>

      <span className={`text-base font-medium ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}