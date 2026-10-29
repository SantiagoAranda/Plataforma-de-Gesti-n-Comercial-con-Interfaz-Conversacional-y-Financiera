import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import SaleTaxPanel, { DEFAULT_SALE_FISCAL_FORM } from "./SaleTaxPanel";
import { getTaxPreview } from "@/src/lib/tax/api";

vi.mock("@/src/lib/tax/api", () => ({ getTaxPreview: vi.fn() }));
vi.mock("@/src/hooks/useFiscalMunicipalities", () => ({ useFiscalMunicipalities: () => [] }));
vi.mock("@/src/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ simpleRegimeSalesEnabled: true }) }));
const fiscalState = vi.hoisted(() => ({ fiscalRevision: 0, taxSettingsReady: true }));
vi.mock("@/src/hooks/useTaxSettings", () => ({ useTaxSettings: () => fiscalState }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); fiscalState.fiscalRevision = 0; fiscalState.taxSettingsReady = true; });

test("a successful preview does not request again when the parent recreates equivalent items", async () => {
  vi.useFakeTimers();
  vi.mocked(getTaxPreview).mockImplementation(async () => ({ subtotal: 100, vatTotal: 0 }) as any);
  function Composer() {
    const [, setPreview] = useState<unknown>(null);
    return <SaleTaxPanel mode="create" value={DEFAULT_SALE_FISCAL_FORM} saleType="PRODUCTO"
      items={[{ itemId: "item-1", quantity: 1 }]} taxSettingsEnabled previewOnly onPreviewChange={setPreview} />;
  }
  render(<Composer />);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(getTaxPreview).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
  expect(getTaxPreview).toHaveBeenCalledTimes(1);
});

test("fiscal revision clears old preview and ignores a late response", async () => {
  vi.useFakeTimers();
  let resolveOld!: (value: any) => void;
  vi.mocked(getTaxPreview).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  vi.mocked(getTaxPreview).mockResolvedValue({ subtotal: 200, vatTotal: 0 } as any);
  const onPreview = vi.fn();
  const panel = () => <SaleTaxPanel mode="create" value={DEFAULT_SALE_FISCAL_FORM} saleType="PRODUCTO" items={[{ itemId: "one", quantity: 1 }]} taxSettingsEnabled previewOnly onPreviewChange={onPreview} />;
  const view = render(panel());
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  const oldSignal = vi.mocked(getTaxPreview).mock.calls[0][1];
  fiscalState.fiscalRevision++;
  view.rerender(panel());
  expect(oldSignal?.aborted).toBe(true);
  expect(onPreview).toHaveBeenLastCalledWith(null);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ subtotal: 200 }));
  await act(async () => { resolveOld({ subtotal: 100 }); });
  expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ subtotal: 200 }));
  fiscalState.fiscalRevision++;
  fiscalState.taxSettingsReady = false;
  view.rerender(panel());
  expect(onPreview).toHaveBeenLastCalledWith(null);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(getTaxPreview).toHaveBeenCalledTimes(2);
});

test("failed preview releases loading, clears prior data and allows explicit retry", async () => {
  vi.useFakeTimers();
  vi.mocked(getTaxPreview).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  vi.mocked(getTaxPreview).mockResolvedValue({ subtotal: 100, vatTotal: 0 } as any);
  render(<SaleTaxPanel mode="create" value={DEFAULT_SALE_FISCAL_FORM} saleType="PRODUCTO" items={[{ itemId: "one", quantity: 1 }]} taxSettingsEnabled previewOnly />);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(screen.getByText("Failed to fetch")).toBeTruthy();
  expect(screen.queryByText("Calculando liquidacion...")).toBeNull();
  fireEvent.click(screen.getByText("Reintentar"));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(screen.queryByText("Failed to fetch")).toBeNull();
  expect(getTaxPreview).toHaveBeenCalledTimes(2);
});

test("RUT OFF and historical readonly summaries never request a live preview", async () => {
  vi.useFakeTimers();
  const props = { value: DEFAULT_SALE_FISCAL_FORM, saleType: "PRODUCTO" as const, items: [{ itemId: "one", quantity: 1 }], previewOnly: true };
  const view = render(<SaleTaxPanel {...props} mode="create" taxSettingsEnabled={false} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(700); });
  view.rerender(<SaleTaxPanel {...props} mode="readonly" taxSettingsEnabled fiscalSummary={{ subtotal: 100 } as any} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(700); });
  expect(getTaxPreview).not.toHaveBeenCalled();
});
