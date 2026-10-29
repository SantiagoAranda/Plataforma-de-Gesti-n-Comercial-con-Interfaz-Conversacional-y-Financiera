import { afterEach, expect, test, vi } from "vitest";
import { api } from "@/src/lib/api";
import { updateTaxProfile, updateIcaRate } from "./api";

vi.mock("@/src/lib/api", () => ({ api: vi.fn() }));
afterEach(() => vi.resetAllMocks());
test("a successful profile write publishes invalidation even when a later ICA write fails", async () => {
  const listener = vi.fn();
  window.addEventListener("tax-profile-updated", listener);
  try {
    vi.mocked(api).mockResolvedValueOnce({ taxSettingsEnabled: true }).mockRejectedValueOnce(new Error("ICA failed"));
    await updateTaxProfile({ responsibilityCodes: ["52"] });
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(updateIcaRate("one", {})).rejects.toThrow("ICA failed");
    expect(listener).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener("tax-profile-updated", listener); }
});
