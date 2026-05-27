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
  // PR-E2：resolveStoreSlugForLiff() — 不再對 LIFF 頁靜默 fallback zhubei
  //
  // 解析順序：x-store-slug header > store-slug cookie > null
  // null 時 callsite 應顯示「無法確認分店」安全提示，引導從 /s/<slug>/liff 重進。
  // ───────────────────────────────────────────────────────────────────────────
  describe("resolveStoreSlugForLiff (PR-E2)", () => {
    it("returns header value when x-store-slug header present", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockImplementation((name: string) => {
        if (name === "x-store-slug") return "hsinchu";
        return null;
      });
      mockCookieGet.mockReturnValue(undefined);

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBe("hsinchu");
    });

    it("falls through to cookie when header missing", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockReturnValue(null);
      mockCookieGet.mockImplementation((name: string) => {
        if (name === "store-slug") return { value: "taichung" };
        return undefined;
      });

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBe("taichung");
    });

    it("header wins over cookie when both present (proxy-injected header is authoritative)", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockImplementation((name: string) => {
        if (name === "x-store-slug") return "hsinchu";
        return null;
      });
      mockCookieGet.mockImplementation((name: string) => {
        if (name === "store-slug") return { value: "taichung" };
        return undefined;
      });

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBe("hsinchu");
    });

    it("returns null when both header and cookie missing — NO silent fallback to zhubei", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockReturnValue(null);
      mockCookieGet.mockReturnValue(undefined);

      const slug = await resolveStoreSlugForLiff();
      expect(slug).toBeNull();
      // 顯式：即使全失敗也絕不能默默回 "zhubei"
      expect(slug).not.toBe("zhubei");
    });

    it("returns null when header is empty string (defensive — Vercel key-exists-value-empty footgun)", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      // ?? 不會 catch 空字串，所以 header 值為 "" 時會被當有效；
      // 此測試確認此 footgun。若未來需要 normalize 空字串，可改用 emptyToNull。
      // 目前行為：空字串 header → 返回 ""（其後 page.tsx 的 if (!storeSlug) 仍會把 "" 當缺）。
      mockHeaderGet.mockImplementation((name: string) =>
        name === "x-store-slug" ? "" : null
      );
      mockCookieGet.mockReturnValue(undefined);

      const slug = await resolveStoreSlugForLiff();
      // 紀錄目前行為：?? 放行空字串，page.tsx 用 if (!storeSlug) 攔住
      expect(slug === "" || slug === null).toBe(true);
      // 絕不能變 zhubei
      expect(slug).not.toBe("zhubei");
    });

    it("cookie empty string with no header → still not zhubei", async () => {
      const { resolveStoreSlugForLiff } = await import("@/lib/store-resolver");

      mockHeaderGet.mockReturnValue(null);
      mockCookieGet.mockImplementation((name: string) =>
        name === "store-slug" ? { value: "" } : undefined
      );

      const slug = await resolveStoreSlugForLiff();
      // ?? chain 第二段 cookieStore.get("store-slug")?.value 為 ""，?? 放行
      // page.tsx 的 if (!storeSlug) 仍會攔住
      expect(slug === "" || slug === null).toBe(true);
      expect(slug).not.toBe("zhubei");
    });
  });
});
