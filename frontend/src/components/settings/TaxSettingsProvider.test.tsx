import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaxSettingsProvider } from "./TaxSettingsProvider";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";
import { getTaxProfile, toggleTaxSettings } from "@/src/lib/settings/api";

vi.mock("@/src/lib/settings/api", () => ({ getTaxProfile: vi.fn(), toggleTaxSettings: vi.fn() }));
let state: ReturnType<typeof useTaxSettings>;
const profile = (enabled: boolean, businessId = "one", codes = ["52"]) => ({ businessId, taxSettingsEnabled: enabled, responsibilities: codes.map(code => ({ responsibility: { code } })) }) as any;
function Consumer() {
  state = useTaxSettings();
  return <output>{String(state.taxSettingsEnabled)}:{String(state.taxSettingsLoading)}:{String(state.taxSettingsReady)}:{state.taxProfile?.businessId}</output>;
}
async function mount() {
  await act(async () => { render(<TaxSettingsProvider><Consumer /></TaxSettingsProvider>); });
}
beforeEach(() => {
  localStorage.setItem("accessToken", "one-session");
  vi.mocked(getTaxProfile).mockResolvedValue(profile(false));
  vi.mocked(toggleTaxSettings).mockResolvedValue(profile(true));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

test("OFF to ON refetches full profile and updates all consumers without reload", async () => {
  await mount();
  expect(state.taxSettingsEnabled).toBe(false);
  const previous = state.fiscalRevision;
  vi.mocked(getTaxProfile).mockResolvedValue(profile(true));
  await act(async () => { await state.setTaxSettingsEnabled(true); });
  expect(toggleTaxSettings).toHaveBeenCalledWith(true);
  expect(getTaxProfile).toHaveBeenCalledTimes(2);
  expect(state.taxSettingsEnabled).toBe(true);
  expect(state.taxProfile?.responsibilities[0].responsibility.code).toBe("52");
  expect(state.taxSettingsReady).toBe(true);
  expect(state.taxSettingsLoading).toBe(false);
  expect(state.fiscalRevision).toBeGreaterThan(previous);
});

test("failed PATCH releases loading, reports failure, and allows another toggle", async () => {
  await mount();
  vi.mocked(toggleTaxSettings).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await act(async () => { await state.setTaxSettingsEnabled(true); });
  expect(state.taxSettingsLoading).toBe(false);
  expect(state.taxSettingsEnabled).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain("No se pudo cambiar");
  vi.mocked(getTaxProfile).mockResolvedValue(profile(true));
  await act(async () => { await state.setTaxSettingsEnabled(true); });
  expect(state.taxSettingsReady).toBe(true);
  expect(state.taxSettingsError).toBeNull();
});

test("toggle is pending until the server confirms and duplicate toggles are ignored", async () => {
  await mount();
  let resolvePatch!: (value: any) => void;
  vi.mocked(toggleTaxSettings).mockReturnValueOnce(new Promise(resolve => { resolvePatch = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = state.setTaxSettingsEnabled(true); });
  expect(state.taxSettingsEnabled).toBe(false);
  expect(state.taxSettingsLoading).toBe(true);
  await act(async () => { await state.setTaxSettingsEnabled(true); });
  expect(toggleTaxSettings).toHaveBeenCalledTimes(1);
  vi.mocked(getTaxProfile).mockResolvedValue(profile(true));
  await act(async () => { resolvePatch(profile(true)); await pending; });
  expect(state.taxSettingsEnabled).toBe(true);
  expect(state.taxSettingsLoading).toBe(false);
});

test("successful PATCH followed by failed refetch is not rolled back and can retry", async () => {
  await mount();
  vi.mocked(getTaxProfile).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await act(async () => { await state.setTaxSettingsEnabled(true); });
  expect(state.taxSettingsEnabled).toBe(true);
  expect(state.taxSettingsReady).toBe(false);
  expect(state.taxSettingsLoading).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain("guardó");
  vi.mocked(getTaxProfile).mockResolvedValue(profile(true));
  await act(async () => { fireEvent.click(screen.getByText("Reintentar")); });
  expect(state.taxSettingsReady).toBe(true);
  expect(toggleTaxSettings).toHaveBeenCalledTimes(1);
});

test("profile update event invalidates before refetch and ignores old responses", async () => {
  let resolveOld!: (value: any) => void;
  vi.mocked(getTaxProfile).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  await mount();
  vi.mocked(getTaxProfile).mockResolvedValue(profile(true));
  await act(async () => { window.dispatchEvent(new Event("tax-profile-updated")); });
  expect(state.taxSettingsEnabled).toBe(true);
  await act(async () => { resolveOld(profile(false)); });
  expect(state.taxSettingsEnabled).toBe(true);
  expect(state.taxSettingsLoading).toBe(false);
});

test("tenant/session changes discard in-flight responses and clear state on logout", async () => {
  let resolveOld!: (value: any) => void;
  vi.mocked(getTaxProfile).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  await mount();
  vi.mocked(getTaxProfile).mockResolvedValue(profile(false, "two", []));
  await act(async () => {
    localStorage.setItem("accessToken", "two-session");
    window.dispatchEvent(new Event("auth-session-changed"));
  });
  await act(async () => { resolveOld(profile(true)); });
  expect(state.taxProfile?.businessId).toBe("two");
  expect(state.taxSettingsEnabled).toBe(false);
  await act(async () => {
    localStorage.removeItem("accessToken");
    window.dispatchEvent(new Event("auth-session-changed"));
  });
  expect(state.taxProfile).toBeNull();
  expect(state.taxSettingsLoading).toBe(false);
});
