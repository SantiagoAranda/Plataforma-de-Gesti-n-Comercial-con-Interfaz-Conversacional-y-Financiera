"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowLeft, Landmark } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  listIcaRates,
  createIcaRate,
  deleteIcaRate,
  IcaRate,
} from "@/src/lib/settings/api";

export default function IcaRatesPage() {
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<IcaRate[]>([]);

  // Add form states
  const [municipalityCode, setMunicipalityCode] = useState("");
  const [ciiuCode, setCiiuCode] = useState("");
  const [activityName, setActivityName] = useState("");
  const [icaRatePerMil, setIcaRatePerMil] = useState(""); // Expresado en por mil, ej: 9.66
  const [reteIcaRatePerMil, setReteIcaRatePerMil] = useState(""); // Expresado en por mil, ej: 4.0
  const [minBaseUvt, setMinBaseUvt] = useState("0");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parsePerThousand = (value: string) => {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  useEffect(() => {
    async function loadRates() {
      try {
        const data = await listIcaRates();
        setRates(data);
      } catch (err: any) {
        notify({
          message: err.message || "No se pudieron obtener las tarifas ICA.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    }
    loadRates();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const icaRatePerThousand = parsePerThousand(icaRatePerMil);
    const reteIcaRatePerThousand = parsePerThousand(reteIcaRatePerMil);
    const parsedMinBaseUvt = Number(minBaseUvt.trim().replace(",", "."));

    if (
      icaRatePerThousand === null ||
      reteIcaRatePerThousand === null ||
      icaRatePerThousand < 0 ||
      reteIcaRatePerThousand < 0 ||
      !Number.isFinite(parsedMinBaseUvt) ||
      parsedMinBaseUvt < 0
    ) {
      setFormError("Ingrese tarifas y base válidas. Puede usar punto o coma decimal.");
      return;
    }

    setAdding(true);

    try {
      const payload = {
        municipalityCode: municipalityCode.trim(),
        ciiuCode: ciiuCode.trim(),
        activityName: activityName || null,
        icaRatePerThousand,
        reteIcaRatePerThousand,
        minBaseUvt: parsedMinBaseUvt,
      };

      const newRate = await createIcaRate(payload);
      setRates((prev) => [...prev, newRate]);

      // Reset
      setMunicipalityCode("");
      setCiiuCode("");
      setActivityName("");
      setIcaRatePerMil("");
      setReteIcaRatePerMil("");
      setMinBaseUvt("0");

      notify({
        message: "La tarifa ICA municipal fue guardada correctamente.",
        type: "success",
      });
    } catch (err: any) {
      notify({
        message: err.message || "Verifique los datos de la tarifa municipal.",
        type: "error",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Deseas eliminar esta tarifa de ICA municipal?")) return;

    try {
      await deleteIcaRate(id);
      setRates((prev) => prev.filter((r) => r.id !== id));
      notify({
        message: "La tarifa fue removida del perfil fiscal del negocio.",
        type: "success",
      });
    } catch (err: any) {
      notify({
        message: err.message || "No se pudo completar la operación.",
        type: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">Cargando tarifas municipales...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-10">
      <AppHeader
        title="Tarifas ICA Municipales"
        showBack
        hrefBack="/configuracion/rut-impuestos"
      />

      <main className="mx-auto max-w-4xl px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* FORMULARIO AGREGAR */}
        <div className="md:col-span-1 rounded-2xl bg-white p-5 border border-neutral-100 shadow-sm h-fit space-y-4">
          <div className="flex items-center gap-2 text-neutral-400">
            <Landmark className="h-5 w-5" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              Nueva Tarifa ICA
            </h2>
          </div>

          <form onSubmit={handleAdd} className="space-y-3">
            <label className="block">
              <span className="text-xs text-neutral-500">Cód. Municipio DIVIPOLA</span>
              <input
                type="text"
                required
                maxLength={5}
                value={municipalityCode}
                onChange={(e) => setMunicipalityCode(e.target.value)}
                placeholder="Ej: 11001"
                className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-neutral-500">Actividad (CIIU)</span>
                <input
                  type="text"
                  required
                  value={ciiuCode}
                  onChange={(e) => setCiiuCode(e.target.value)}
                  placeholder="Ej: 4711"
                  className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block">
                <span className="text-xs text-neutral-500">Base Mínima (UVT)</span>
                <input
                  type="number"
                  required
                  value={minBaseUvt}
                  onChange={(e) => setMinBaseUvt(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-neutral-500">Descripción de Actividad</span>
              <input
                type="text"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="Ej: Compras y servicios generales"
                className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-neutral-500">Tarifa ICA (x 1000)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={icaRatePerMil}
                  onChange={(e) => setIcaRatePerMil(e.target.value)}
                  placeholder="Ej: 9.66"
                  className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block">
                <span className="text-xs text-neutral-500">Tarifa ReteICA (x 1000)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={reteIcaRatePerMil}
                  onChange={(e) => setReteIcaRatePerMil(e.target.value)}
                  placeholder="Ej: 4.0"
                  className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            {formError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={adding}
              className="mt-2 w-full inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {adding ? "Guardando..." : "Agregar Tarifa"}
            </button>
          </form>
        </div>

        {/* TABLA DE TARIFAS EXISTENTES */}
        <div className="md:col-span-2 rounded-2xl bg-white p-5 border border-neutral-100 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Tarifas de ICA Municipales Activas
          </h2>

          {rates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
              <Landmark className="h-10 w-10 stroke-1 mb-2" />
              <p className="text-xs">No hay tarifas ICA configuradas para este comercio.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-600 border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 text-neutral-400 font-medium">
                    <th className="py-2.5">Municipio</th>
                    <th className="py-2.5">CIIU</th>
                    <th className="py-2.5">Descripción</th>
                    <th className="py-2.5 text-right">Tarifa ICA</th>
                    <th className="py-2.5 text-right">Tarifa ReteICA</th>
                    <th className="py-2.5 text-right">Mín (UVT)</th>
                    <th className="py-2.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                      <td className="py-3 font-semibold text-neutral-700">{r.municipalityCode}</td>
                      <td className="py-3">{r.ciiuCode}</td>
                      <td className="py-3 max-w-[120px] truncate text-neutral-500" title={r.activityName || ""}>
                        {r.activityName || "-"}
                      </td>
                      <td className="py-3 text-right">{(Number(r.icaRate) * 1000).toFixed(2)}‰</td>
                      <td className="py-3 text-right">{(Number(r.reteIcaRate) * 1000).toFixed(2)}‰</td>
                      <td className="py-3 text-right">{r.minBaseUvt}</td>
                      <td className="py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
