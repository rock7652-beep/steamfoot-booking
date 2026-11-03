import { afterEach, expect, it, vi } from "vitest";
import { saveManagerNotification } from "@/lib/manager-notification-save";
afterEach(() => vi.unstubAllGlobals());
it("uses a direct JSON request and validates its store/field receipt", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ success: true, storeId: "store-a", data: { id: "r", key: "trial", enabled: true } }));
  vi.stubGlobal("fetch", fetch);
  expect(await saveManagerNotification("store-a", "r", "trial", true)).toEqual({ success: true });
  expect(fetch.mock.calls[0][0]).toBe("/api/settings/manager-notification");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedStoreId: "store-a", id: "r", key: "trial", enabled: true });
});
it.each(["store", "field", "enabled"])("rejects mismatched %s receipts", async mismatch => {
  const data = { id: "r", key: mismatch === "field" ? "sameDay" : "trial", enabled: mismatch !== "enabled" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, storeId: mismatch === "store" ? "other" : "store-a", data })));
  await expect(saveManagerNotification("store-a", "r", "trial", true)).rejects.toThrow("Unconfirmed");
});
