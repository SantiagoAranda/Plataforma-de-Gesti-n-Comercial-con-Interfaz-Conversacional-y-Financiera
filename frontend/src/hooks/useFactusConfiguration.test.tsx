import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useFactusConfiguration } from "./useFactusConfiguration";
import { getFactusConfiguration } from "@/src/services/fiscalDocuments";
import { canGenerateElectronicInvoice } from "@/src/lib/sales/manualInvoiceUi";

vi.mock("@/src/services/fiscalDocuments", () => ({ getFactusConfiguration: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

test("focus revalidates revoked entitlement, preserving manual invoice gate", async () => {
  vi.mocked(getFactusConfiguration).mockResolvedValue({ enabled: true, configured: true } as any);
  const { result } = renderHook(() => useFactusConfiguration(0));
  await act(async () => {});
  const sale = { sourceType: "ORDER", status: "CERRADO", accountingPostedAt: "date", inventoryPostedAt: "date" } as any;
  const canIssue = () => canGenerateElectronicInvoice(sale, false, { documentsLoaded: true, factusEnabled: result.current.factusConfiguration?.enabled === true, factusConfigured: true, taxSettingsEnabled: true, responsibility52: true }, false);
  expect(canIssue()).toBe(true);
  vi.mocked(getFactusConfiguration).mockResolvedValue({ enabled: false, configured: true } as any);
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(canIssue()).toBe(false);
});

test("revision changes and failures clear stale entitlement; retry releases loading", async () => {
  vi.mocked(getFactusConfiguration).mockResolvedValue({ enabled: true } as any);
  const { result, rerender } = renderHook(({ revision }) => useFactusConfiguration(revision), { initialProps: { revision: 0 } });
  await act(async () => {});
  vi.mocked(getFactusConfiguration).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  rerender({ revision: 1 });
  await act(async () => {});
  expect(result.current.factusConfiguration).toBeNull();
  expect(result.current.factusLoading).toBe(false);
  expect(result.current.factusError).toBeTruthy();
  await act(async () => { await result.current.refreshFactus(); });
  expect(result.current.factusConfiguration?.enabled).toBe(true);
  expect(result.current.factusError).toBeNull();
});
