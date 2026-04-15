/**
 * B7-4: Store Context 測試
 *
 * 測試 store-context.ts 的 server-side 與 client-side helpers。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock next/headers ──
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
}));

describe("store-context server-side", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStoreContext", () => {
    it("should return store context from cookies", async () => {
      const { getStoreContext } = await import("@/lib/store-context");

      mockCookieGet.mockImplementation((name: string) => {
        if (name === "store-slug") return { value: "zhubei" };
        if (name === "store-id") return { value: "default-store" };
        return undefined;
      });

      const ctx = await getStoreContext();
      expect(ctx).toEqual({ storeSlug: "zhubei", storeId: "default-store" });
    });

    it("should return null when cookies are missing", async () => {
      const { getStoreContext } = await import("@/lib/store-context");

      mockCookieGet.mockReturnValue(undefined);

      const ctx = await getStoreContext();
      expect(ctx).toBeNull();
    });

    it("should return null for __hq__ slug", async () => {
      const { getStoreContext } = await import("@/lib/store-context");

      mockCookieGet.mockImplementation((name: string) => {
        if (name === "store-slug") return { value: "__hq__" };
        if (name === "store-id") return { value: "default-store" };
        return undefined;
      });

      const ctx = await getStoreContext();
      expect(ctx).toBeNull();
    });
  });

  describe("requireStoreContext", () => {
    it("should throw when no store context", async () => {
      const { requireStoreContext } = await import("@/lib/store-context");

      mockCookieGet.mockReturnValue(undefined);

      await expect(requireStoreContext()).rejects.toThrow("缺少店舖 context");
    });
  });
});

describe("store-context client-side helpers", () => {
  describe("storeHref", () => {
    it("should construct correct store-scoped path", async () => {
      const { storeHref } = await import("@/lib/store-context");
      expect(storeHref("zhubei", "/book")).toBe("/s/zhubei/book");
      expect(storeHref("taichung", "/register")).toBe("/s/taichung/register");
      expect(storeHref("zhubei", "/admin/dashboard")).toBe("/s/zhubei/admin/dashboard");
    });
  });
});
