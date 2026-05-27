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

// ── Mock next/headers (for cookie + header based resolution) ──
const mockCookieGet = vi.fn();
const mockHeaderGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
  headers: () => Promise.resolve({ get: mockHeaderGet }),
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
      // PR-E patch（Codex P1）：保留 PR-E 前的 {id, slug, name} select。
      // liffId 不從 resolveStoreBySlug 取，已移到 resolveStorePresentation 內單獨查。
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
      expect(result).not.toBeNull();
      expect(result?.storeId).toBe("taichung-store");
      expect(result?.storeSlug).toBe("taichung");
    });

    it("should return null when cookie is missing (no silent DEFAULT_STORE_ID fallback)", async () => {
      const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");

      mockCookieGet.mockReturnValue(undefined);

      const result = await resolveStoreFromOAuthCookie();
      expect(result).toBeNull();
    });

    it("should return null when cookie slug does not exist in DB", async () => {
      const { resolveStoreFromOAuthCookie } = await import("@/lib/store-resolver");

      mockCookieGet.mockImplementation((name: string) => {
        if (name === "oauth-store-slug") return { value: "unknown-store" };
        return undefined;
      });
      mockFindUnique.mockResolvedValue(null);

      const result = await resolveStoreFromOAuthCookie();
      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PR-E2 + Codex P1：resolveStoreSlugForLiff() header-only strict gate
  //
  // 解析：x-store-slug header（emptyToNull 過濾空字串）→ null
  // **不**讀 store-slug cookie。stale cookie 是 PR-E2 strict gate 的漏洞——
  // 顧客上次去 zhubei 後 cookie 留下「store-slug=zhubei」，下次點到沒 header
  // 的 URL 會被 silently 拉回 zhubei，等於沒鎖。
  //
  // null 時 callsite 應顯示「無法確認分店」安全提示，引導從 /s/<slug>/liff 重進。
  // ───────────────────────────────────────────────────────────────────────────
  describe("resolveStoreSlugForLiff (PR-E2 strict, header-only)", () => {
    it("1. header present → returns header slug", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "hsinchu" : null
      );
      mockCookieGet.mockReturnValue(undefined);

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBe("hsinchu");
    });

    it("2. header missing + cookie 'zhubei' → null (Codex P1: stale cookie must not leak)", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockReturnValue(null);
      mockCookieGet.mockImplementation((name: string) =>
        name === "store-slug" ? { value: "zhubei" } : undefined
      );

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBeNull();
      // 顯式：stale cookie 即使值是 "zhubei" 也不可漏進來
      expect(slug).not.toBe("zhubei");
    });

    it("3. header empty + cookie 'zhubei' → null (empty header normalized; cookie ignored)", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "" : null
      );
      mockCookieGet.mockImplementation((name: string) =>
        name === "store-slug" ? { value: "zhubei" } : undefined
      );

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBeNull();
      expect(slug).not.toBe("zhubei");
    });

    it("4. no header + no cookie → null", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockReturnValue(null);
      mockCookieGet.mockReturnValue(undefined);

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBeNull();
      expect(slug).not.toBe("zhubei");
    });

    it("5. never returns zhubei unless header explicitly is zhubei", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      // 5a. header 顯式 "zhubei" → 允許（這是合法的 prod 路徑）
      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "zhubei" : null
      );
      mockCookieGet.mockReturnValue(undefined);
      expect(await resolveStoreSlugForLiff()).toBe("zhubei");

      // 5b. header 是別的店，cookie 是 zhubei → 用 header 不用 cookie
      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "hsinchu" : null
      );
      mockCookieGet.mockImplementation((name: string) =>
        name === "store-slug" ? { value: "zhubei" } : undefined
      );
      expect(await resolveStoreSlugForLiff()).toBe("hsinchu");

      // 5c. 任何 stale cookie zhubei 都不可漏進來
      for (const headerVal of [null, "", "   ", "\t\n"] as const) {
        mockHeaderGet.mockImplementation((name: string) =>
          name === "x-store-slug" ? headerVal : null
        );
        mockCookieGet.mockImplementation((name: string) =>
          name === "store-slug" ? { value: "zhubei" } : undefined
        );
        const slug = await resolveStoreSlugForLiff();
        expect(slug).toBeNull();
        expect(slug).not.toBe("zhubei");
      }
    });

    it("6. whitespace-only header → null (emptyToNull normalization)", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "   \t" : null
      );
      mockCookieGet.mockReturnValue(undefined);

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBeNull();
    });

    it("7. cookie reading is structurally removed (mockCookieGet must NOT be called)", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "hsinchu" : null
      );
      mockCookieGet.mockReset();
      mockCookieGet.mockImplementation((name: string) => {
        if (name === "store-slug") return { value: "should-never-be-read" };
        return undefined;
      });

      await resolveStoreSlugForLiff();
      // helper 不該讀 cookie，這條 mock 完全沒被呼叫
      expect(mockCookieGet).not.toHaveBeenCalled();
    });
  });
});
