"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import { PucAccountField } from "@/src/components/accounting/PucAccountField";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  listSalesTemplates,
  upsertSalesTemplate,
  type SalesAccountingTemplate,
  type SalesAccountingTemplateType,
  getPuc,
  type UpsertSalesAccountingTemplateDto,
} from "@/src/services/accounting";
import type { SalesTemplateFormState, SelectedPucOption } from "@/src/types/accounting-sales-templates";

const DEFAULT_VAT = 21; // % UI (backend espera 0-1)

function createEmptyForm(): SalesTemplateFormState {
  return {
    cashAccount: null,
    receivableAccount: null,
    incomeAccount: null,
    vatAccount: null,
    costAccount: null,
    inventoryAccount: null,
    pricesIncludeVat: false,
    vatRatePct: DEFAULT_VAT,
  };
}

async function resolvePucOptions(codes: Array<string | null | undefined>) {
  const unique = Array.from(new Set(codes.filter(Boolean) as string[]));
  const map = new Map<string, SelectedPucOption>();

  await Promise.all(
    unique.map(async (code) => {
      try {
        const info = await getPuc(code);
        map.set(code, { code: info.code, name: info.name, kind: info.kind });
      } catch {
        map.set(code, { code, name: "Código " + code, kind: "CUENTA" });
      }
    }),
  );

  return map;
}

async function mapTemplateToForm(template: SalesAccountingTemplate): Promise<SalesTemplateFormState> {
  const resolver = await resolvePucOptions([
    template.debitCashPucCuentaCode,
    template.debitCashPucSubCode,
    template.debitReceivablePucCuentaCode,
    template.debitReceivablePucSubCode,
    template.creditIncomePucCuentaCode,
    template.creditIncomePucSubCode,
    template.creditVatPucCuentaCode,
    template.creditVatPucSubCode,
    template.debitCostPucCuentaCode,
    template.debitCostPucSubCode,
    template.creditInventoryPucCuentaCode,
    template.creditInventoryPucSubCode,
  ]);

  const pick = (cuenta?: string | null, sub?: string | null): SelectedPucOption | null => {
    const code = sub ?? cuenta;
    if (!code) return null;
    return resolver.get(code) ?? { code, name: "Código " + code, kind: sub ? "SUBCUENTA" : "CUENTA" };
  };

  return {
    cashAccount: pick(template.debitCashPucCuentaCode, template.debitCashPucSubCode),
    receivableAccount: pick(template.debitReceivablePucCuentaCode, template.debitReceivablePucSubCode),
    incomeAccount: pick(template.creditIncomePucCuentaCode, template.creditIncomePucSubCode),
    vatAccount: pick(template.creditVatPucCuentaCode, template.creditVatPucSubCode),
    costAccount: pick(template.debitCostPucCuentaCode, template.debitCostPucSubCode),
    inventoryAccount: pick(template.creditInventoryPucCuentaCode, template.creditInventoryPucSubCode),
    pricesIncludeVat: !!template.pricesIncludeVat,
    vatRatePct: Number.isFinite(template.vatRate) ? Number(template.vatRate) * 100 : DEFAULT_VAT,
  };
}

function mapFormToDto(form: SalesTemplateFormState, type: SalesAccountingTemplateType) {
  const dto: Partial<UpsertSalesAccountingTemplateDto> = {
    vatRate: Number(form.vatRatePct) / 100,
    pricesIncludeVat: !!form.pricesIncludeVat,
  };

  const assign = (
    field: SelectedPucOption | null,
    cuentaKey: keyof UpsertSalesAccountingTemplateDto,
    subKey: keyof UpsertSalesAccountingTemplateDto,
  ) => {
    if (!field) return;
    if (field.kind === "SUBCUENTA") dto[subKey] = field.code;
    else dto[cuentaKey] = field.code;
  };

  assign(form.cashAccount, "debitCashPucCuentaCode", "debitCashPucSubCode");
  assign(form.receivableAccount, "debitReceivablePucCuentaCode", "debitReceivablePucSubCode");
  assign(form.incomeAccount, "creditIncomePucCuentaCode", "creditIncomePucSubCode");
  assign(form.vatAccount, "creditVatPucCuentaCode", "creditVatPucSubCode");

  if (type === "PRODUCT") {
    assign(form.costAccount, "debitCostPucCuentaCode", "debitCostPucSubCode");
    assign(form.inventoryAccount, "creditInventoryPucCuentaCode", "creditInventoryPucSubCode");
  }

  return dto as UpsertSalesAccountingTemplateDto;
}

function validateForm(form: SalesTemplateFormState, type: SalesAccountingTemplateType): string[] {
  const errors: string[] = [];

  const hasCash = !!form.cashAccount;
  const hasReceivable = !!form.receivableAccount;
  if (!hasCash && !hasReceivable) {
    errors.push("Elegí Caja/Banco o Clientes.");
  }
  if (!form.incomeAccount) errors.push("Falta la cuenta de Ingresos.");
  if (!form.vatAccount) errors.push("Falta la cuenta de IVA.");

  const vat = Number(form.vatRatePct);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
    errors.push("Tasa de IVA debe estar entre 0% y 100%.");
  }

  if (type === "SERVICE") {
    if (form.costAccount || form.inventoryAccount) {
      errors.push("La plantilla de servicios no usa costo ni inventario.");
    }
  }

  return errors;
}

function TemplateCard(props: {
  type: SalesAccountingTemplateType;
  title: string;
  description: string;
  form: SalesTemplateFormState;
  onChange: (fn: (prev: SalesTemplateFormState) => SalesTemplateFormState) => void;
  onSave: () => void;
  loading: boolean;
  saving: boolean;
  errors: string[];
}) {
  const { type, title, description, form, onChange, onSave, loading, saving, errors } = props;

  const canSave = !loading && !saving;

  return (
    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm px-4 py-5 sm:px-6 sm:py-6 space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.join(" ")}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Cargando plantilla…</div>
      ) : (
        <div className="space-y-4">
          <PucAccountField
            label="Caja / Banco"
            helper="Cuenta que se debita cuando la venta se cobra."
            value={form.cashAccount}
            onChange={(v) => onChange((prev) => ({ ...prev, cashAccount: v }))}
            disabled={saving}
          />

          <PucAccountField
            label="Clientes / Cuentas por cobrar"
            helper="Usá esta cuenta cuando la venta quede pendiente de cobro."
            value={form.receivableAccount}
            onChange={(v) => onChange((prev) => ({ ...prev, receivableAccount: v }))}
            disabled={saving}
          />

          <PucAccountField
            label={type === "PRODUCT" ? "Ingresos por ventas" : "Ingresos por servicios"}
            helper="Registra el valor neto de la venta."
            value={form.incomeAccount}
            onChange={(v) => onChange((prev) => ({ ...prev, incomeAccount: v }))}
            disabled={saving}
          />

          <PucAccountField
            label="IVA generado"
            helper="Cuenta que registra el impuesto generado por la venta."
            value={form.vatAccount}
            onChange={(v) => onChange((prev) => ({ ...prev, vatAccount: v }))}
            disabled={saving}
          />

          {type === "PRODUCT" && (
            <>
              <PucAccountField
                label="Costo de ventas (opcional)"
                helper="Preparado para el registro automático de costos."
                value={form.costAccount}
                onChange={(v) => onChange((prev) => ({ ...prev, costAccount: v }))}
                disabled={saving}
              />

              <PucAccountField
                label="Inventario (opcional)"
                helper="Se usará cuando se contabilice automáticamente la salida de stock."
                value={form.inventoryAccount}
                onChange={(v) => onChange((prev) => ({ ...prev, inventoryAccount: v }))}
                disabled={saving}
              />
            </>
          )}

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800">Los precios incluyen IVA</div>
                <div className="text-xs text-gray-500">Definí si los precios de venta ya vienen con IVA incluido.</div>
              </div>
              <button
                type="button"
                onClick={() => onChange((prev) => ({ ...prev, pricesIncludeVat: !prev.pricesIncludeVat }))}
                disabled={saving}
                className={`h-9 px-3 rounded-full border text-xs font-semibold transition ${
                  form.pricesIncludeVat
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "bg-white border-gray-200 text-gray-700"
                } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {form.pricesIncludeVat ? "Sí" : "No"}
              </button>
            </div>

            <div className="grid grid-cols-[auto,1fr] gap-3 items-center">
              <label className="text-sm font-semibold text-gray-800">Tasa de IVA</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.vatRatePct}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      vatRatePct: Number.isFinite(Number(e.target.value))
                        ? Number(e.target.value)
                        : prev.vatRatePct,
                    }))
                  }
                  className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-emerald-300"
                  disabled={saving}
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={`w-full h-11 rounded-full text-sm font-semibold transition ${
            canSave ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-emerald-100 text-emerald-700/70"
          }`}
        >
          {saving ? "Guardando..." : type === "PRODUCT" ? "Guardar plantilla de productos" : "Guardar plantilla de servicios"}
        </button>
      </div>
    </section>
  );
}

export default function AccountingSalesTemplatesPage() {
  const { notify } = useNotification();

  const [productForm, setProductForm] = useState<SalesTemplateFormState>(createEmptyForm());
  const [serviceForm, setServiceForm] = useState<SalesTemplateFormState>(createEmptyForm());

  const [loading, setLoading] = useState({ PRODUCT: true, SERVICE: true });
  const [saving, setSaving] = useState({ PRODUCT: false, SERVICE: false });
  const [errors, setErrors] = useState<{ PRODUCT: string[]; SERVICE: string[] }>({
    PRODUCT: [],
    SERVICE: [],
  });

  useEffect(() => {
    (async () => {
      setLoading({ PRODUCT: true, SERVICE: true });
      try {
        const templates = await listSalesTemplates();
        const product = templates.find((t) => t.type === "PRODUCT");
        const service = templates.find((t) => t.type === "SERVICE");

        if (product) setProductForm(await mapTemplateToForm(product));
        if (service) setServiceForm(await mapTemplateToForm(service));
      } catch (err) {
        console.error(err);
        setErrors((prev) => ({
          PRODUCT: ["No se pudieron cargar las plantillas."],
          SERVICE: ["No se pudieron cargar las plantillas."],
        }));
      } finally {
        setLoading({ PRODUCT: false, SERVICE: false });
      }
    })();
  }, []);

  async function handleSave(type: SalesAccountingTemplateType) {
    const form = type === "PRODUCT" ? productForm : serviceForm;
    const setter = type === "PRODUCT" ? setProductForm : setServiceForm;
    const errorKey = type === "PRODUCT" ? "PRODUCT" : "SERVICE";

    const validation = validateForm(form, type);
    if (validation.length) {
      setErrors((prev) => ({ ...prev, [errorKey]: validation }));
      return;
    }

    setErrors((prev) => ({ ...prev, [errorKey]: [] }));
    setSaving((prev) => ({ ...prev, [errorKey]: true }));
    try {
      const dto = mapFormToDto(form, type);
      const saved = await upsertSalesTemplate(type, dto as any);
      const hydrated = await mapTemplateToForm(saved);
      setter(hydrated);
      notify({ type: "success", message: "Plantilla guardada" });
    } catch (err: any) {
      const msg = err?.details?.message ?? err?.message ?? "No se pudo guardar";
      setErrors((prev) => ({ ...prev, [errorKey]: [msg] }));
      notify({ type: "error", message: msg });
    } finally {
      setSaving((prev) => ({ ...prev, [errorKey]: false }));
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <AppHeader title="Configuración contable" subtitle="Plantillas automáticas de ventas" showBack />

      <main className="px-4 py-4 pb-12 space-y-5 max-w-4xl mx-auto">
        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm px-4 py-5 sm:px-6 sm:py-6 space-y-2">
          <h1 className="text-xl font-semibold text-zinc-900">Plantillas contables automáticas</h1>
          <p className="text-sm text-gray-600">
            Definí una sola vez las cuentas PUC que el sistema usará al confirmar ventas. No afecta los asientos manuales y podés cambiarlas cuando
            quieras.
          </p>
        </section>

        <TemplateCard
          type="PRODUCT"
          title="Ventas de productos"
          description="Define las cuentas para ventas de productos. Las líneas de costo e inventario quedan opcionales."
          form={productForm}
          onChange={setProductForm}
          onSave={() => handleSave("PRODUCT")}
          loading={loading.PRODUCT}
          saving={saving.PRODUCT}
          errors={errors.PRODUCT}
        />

        <TemplateCard
          type="SERVICE"
          title="Ventas de servicios"
          description="Configura las cuentas para ventas de servicios. Solo se usan las cuentas principales."
          form={serviceForm}
          onChange={setServiceForm}
          onSave={() => handleSave("SERVICE")}
          loading={loading.SERVICE}
          saving={saving.SERVICE}
          errors={errors.SERVICE}
        />
      </main>
    </div>
  );
}
