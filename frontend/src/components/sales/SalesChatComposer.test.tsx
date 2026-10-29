import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SalesChatComposer from "./SalesChatComposer";
import ManualPaidOutflowSheet from "@/src/components/home/ManualPaidOutflowSheet";
import { getTaxPreview } from "@/src/lib/tax/api";
import { createManualPaidOutflow } from "@/src/services/accounting";
import { MovementForm } from "@/src/components/inventory/MovementForm";
import { registerPurchase } from "@/src/services/inventory";

const fiscalState = vi.hoisted(() => ({ taxSettingsEnabled: false, fiscalRevision: 0, taxSettingsReady: true }));
vi.mock("@/src/hooks/useTaxSettings", () => ({ useTaxSettings: () => fiscalState }));
vi.mock("@/src/hooks/useFiscalMunicipalities", () => ({ useFiscalMunicipalities: () => [] }));
vi.mock("@/src/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ simpleRegimeSalesEnabled: true }) }));
vi.mock("@/src/lib/tax/api", () => ({ getTaxPreview: vi.fn() }));
vi.mock("@/src/lib/api", () => ({ api: vi.fn(async () => [{ id: "one", name: "Producto", price: 100, type: "PRODUCT", inventoryMode: "NONE" }]) }));
vi.mock("@/src/services/accounting", () => ({ createManualPaidOutflow: vi.fn(), listExpenseGroupAccounts: vi.fn(async () => []), listManualPaidOutflowCategories: vi.fn(async () => []) }));
vi.mock("@/src/services/inventory", () => ({ listUnits: vi.fn(async () => []), registerPurchase: vi.fn(), registerInitial: vi.fn(), registerNegativeAdjustment: vi.fn(), registerPositiveAdjustment: vi.fn(), registerPurchaseReturn: vi.fn() }));
vi.mock("@/src/components/shared/ItemSelector", () => ({ default: ({ onChange }: any) => <button type="button" onClick={() => onChange("one")}>Seleccionar producto</button> }));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.clearAllMocks();
  fiscalState.taxSettingsEnabled = false; fiscalState.fiscalRevision = 0;
});
function addItem() {
  fireEvent.click(screen.getByText("Seleccionar producto"));
  fireEvent.click(screen.getByTitle("Agregar ítem"));
}

test("local sale remains usable when RUT activates; failed preview and save do not lock subsequent sales or expenses", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const onSave = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(undefined);
  vi.mocked(getTaxPreview).mockRejectedValue(new TypeError("Failed to fetch"));
  const ui = (expanded: boolean) => <>
    <SalesChatComposer expanded={expanded} onCancelComposer={() => {}} onSave={onSave} />
    <ManualPaidOutflowSheet open onOpenChange={() => {}} />
  </>;
  const view = render(ui(true));
  await act(async () => {});
  addItem();
  fireEvent.change(screen.getByPlaceholderText("Nombre del cliente"), { target: { value: "Cliente previo" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(700); });
  expect(getTaxPreview).not.toHaveBeenCalled();
  fiscalState.taxSettingsEnabled = true;
  fiscalState.fiscalRevision++;
  view.rerender(ui(true));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(screen.getByDisplayValue("Cliente previo")).toBeTruthy();
  expect(screen.getByText("Failed to fetch")).toBeTruthy();
  const save = screen.getByRole("button", { name: "Guardar venta" }) as HTMLButtonElement;
  expect(save.disabled).toBe(false);
  await act(async () => { fireEvent.click(save); });
  expect(save.disabled).toBe(false);
  expect(screen.getByText("No se pudo guardar la venta. Intentá nuevamente.")).toBeTruthy();
  await act(async () => { fireEvent.click(save); });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave.mock.calls[1][0]).toMatchObject({ customerName: "Cliente previo", items: [{ itemId: "one", quantity: 1, unitPrice: 100 }] });
  view.rerender(ui(false));
  view.rerender(ui(true));
  addItem();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar venta" })); });
  expect(onSave).toHaveBeenCalledTimes(3);

  // The shared expense form still works after the fiscal network failure.
  fireEvent.click(screen.getByRole("button", { name: "Servicios" }));
  fireEvent.click(screen.getByRole("button", { name: /Acueducto/ }));
  fireEvent.change(screen.getByPlaceholderText("$ 0"), { target: { value: "100" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Efectivo" })[1]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Registrar gasto" })); });
  expect(createManualPaidOutflow).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, paymentMethod: "CASH" }));

  const submitting = vi.fn();
  const purchaseView = render(<MovementForm initialAction="PURCHASE" onSubmittingChange={submitting} ingredient={{
    id: "ingredient", name: "Insumo", hasMovements: true, averageCost: 100,
    stockUnitId: "unit", stockUnit: { id: "unit", name: "Unidad", code: "UNIT", symbol: "u", kind: "BASE" },
  } as any} />);
  await act(async () => {});
  const purchaseForm = within(purchaseView.container);
  const inputs = purchaseForm.getAllByPlaceholderText("0");
  fireEvent.change(inputs[0], { target: { value: "2" } });
  fireEvent.change(inputs[1], { target: { value: "100" } });
  await act(async () => { fireEvent.click(purchaseForm.getByRole("button", { name: "Confirmar movimiento" })); });
  expect(registerPurchase).toHaveBeenCalledWith(expect.objectContaining({ ingredientId: "ingredient", purchaseQuantity: "2", purchaseUnitCost: "100" }));
  expect(submitting).toHaveBeenLastCalledWith(false);
});

test("RUT OFF submits a local sale without requesting fiscal preview", async () => {
  const onSave = vi.fn();
  render(<SalesChatComposer expanded onCancelComposer={() => {}} onSave={onSave} />);
  await act(async () => {});
  addItem();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar venta" })); await vi.advanceTimersByTimeAsync(700); });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(getTaxPreview).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Guardar venta" }) as HTMLButtonElement).disabled).toBe(false);
});

test("activating RUT preserves a previously saved local sale until explicit save", async () => {
  const sale = {
    id: "previous-sale", customerName: "Cliente previo", customerWhatsapp: null,
    type: "PRODUCTO", status: "PENDIENTE", paymentMethod: "CASH", total: 100,
    fiscalSummary: null, taxLines: null, fiscalContext: null,
    items: [{ itemId: "one", name: "Producto", qty: 1, unitPrice: 100, price: 100 }],
  } as any;
  const original = JSON.stringify(sale);
  const onSave = vi.fn();
  vi.mocked(getTaxPreview).mockResolvedValue({ subtotal: 100, vatTotal: 19 } as any);
  const ui = () => <SalesChatComposer mode="edit" sale={sale} expanded onCancelComposer={() => {}} onSave={onSave} />;
  const view = render(ui());
  await act(async () => {});
  fiscalState.taxSettingsEnabled = true;
  fiscalState.fiscalRevision++;
  view.rerender(ui());
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onSave).not.toHaveBeenCalled();
  expect(JSON.stringify(sale)).toBe(original);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" })); });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "previous-sale", total: 100, fiscalSummary: null, taxLines: null }));
});
