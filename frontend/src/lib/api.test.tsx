import { afterEach, expect, test, vi } from "vitest";
import { api } from "./api";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test("fiscal network errors identify method/path and retain cause without logging payload or credentials", async () => {
  const cause = new TypeError("Failed to fetch");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(api("/sales/tax-preview", { method: "POST", body: JSON.stringify({ buyerName: "Private buyer" }) }))
    .rejects.toMatchObject({ cause, method: "POST", path: "/sales/tax-preview" });
  expect(log).toHaveBeenCalledWith("Fiscal request failed", { method: "POST", path: "/sales/tax-preview", cause: "TypeError" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("Private buyer");
});
test("cancelling obsolete preview does not report a network failure", async () => {
  const controller = new AbortController();
  controller.abort();
  const cause = new DOMException("Aborted", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(api("/sales/tax-preview", { signal: controller.signal })).rejects.toBe(cause);
  expect(log).not.toHaveBeenCalled();
});
