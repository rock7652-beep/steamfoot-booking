/**
 * B7-4: Store Resolver 測試
 *
 * 測試 store-resolver.ts 的各種解析場景。
 * 使用 mock Prisma client。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ──
const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// ── Mock next/headers (for cookie-based resolution) ──
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
  headers: () => Promise.resolve({ get: vi.fn() }),
}));

// ── Mock React.cache (pass through) ──
vi.mock("react", () => ({
  cache: (fn: Function) => fn,
}));

describe("store-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveStoreBySlug", () => {
    it("should resolve a valid slug", async () => {
      const { resolveStoreBySlug } = await import("@/lib/store-resolver");

      mockFindUnique.mockResolvedValue({
        id: "default-store",
        slug: "zhubei",
        name: "暖暖蒸足",
      });

      const result = await resolveStoreBySlug("zhubei");
      expect(result).toEqual({
        id: "default-store",
        slug: "zhubei",
        name: "暖暖蒸足",
      });
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { slug: "zhubei" },
        select: { id: true, slug: true, name: true },
      });
    });

    it("should return null for unknown slug", async () => {
      const { resolveStoreBySlug } = await import("@/lib/store-resolver");

      mockFindUnique.mockResolvedValue(null);

      const result = await resolveStoreBySlug("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("resolveStoreIdFromSlug", () => {
    it("should return storeId for valid slug", async () => {
      const { resolveStoreIdFromSlug } = await import("@/lib/store-resolver");

      mockFindUnique.mockResolvedValue({
        id: "taichung-store",
        slug: "taichung",
        name: "台中店",
      });

      const id = await resolveStoreIdFromSlug("taichung");
      expect(id).toBe("taichung-store");
    });

    it("should throw NOT_FOUND for invalid slug", async () => {
      const { resolveStoreIdFromSlug } = await import("@/lib/store-resolver");

      mockFindUnique.mockResolvedValue(null);

      await expect(resolveStoreIdFromSlug("bad")).rejects.toThrow("找不到店舖：bad");
    });
  });

  describe("getStoreSlugById", () => {
    it("should return slug for valid storeId", async () => {
      const { getStoreSlugById } = await import("@/lib/store-resolver");

      mockFindUnique.mockResolvedValue({ slug: "zhubei" });

      const slug = await getStoreSlugById("default-store");
      expect(slug).toBe("zhubei");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: "default-store" },
        select: { slug: true },
      });
    });

    it("should return null for unknown storeId", async () => {
      const { getStoreSlugById } = await import("@/lib/store-resolver");

      mockFindUnique.mockResolvedValue(null);

      const slug = await getStoreSlugById("unknown-id");
      expect(slug).toBeNull();
    });
  });

  describe("resolveStoreFromOAuthCookie", () => {
    it("should resolve store from oauth-store-slug cookie", async () => {
      const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");

      mockCookieGet.mockImplementation((name: string) => {
        if (name === "oauth-store-slug") return { value: "taichung" };
        return undefined;
      });

      mockFindUnique.mockImplementation(({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug === "taichung") {
          return Promise.resolve({ id: "taichung-store", slug: "taichung", name: "台中店" });
        }
        return Promise.resolve(null);
      });

      const result = await resolveStoreFromOAuthCookie();
      expect(result.storeId).toBe("taichung-store");
      expect(result.storeSlug).toBe("taichung");
    });

    it("should fallback to DEFAULT_STORE_ID when cookie is missing", async () => {
      const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");

      mockCookieGet.mockReturnValue(undefined);
      mockFindUnique.mockImplementation(({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.id === "default-store") {
          return Promise.resolve({ slug: "zhubei" });
        }
        return Promise.resolve(null);
      });

      const result = await resolveStoreFromOAuthCookie();
      expect(result.storeId).toBe("default-store");
      expect(result.storeSlug).toBe("zhubei");
    });
  });
});
