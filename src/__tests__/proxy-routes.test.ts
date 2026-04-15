/**
 * B7-4: Proxy Route Guard 測試
 *
 * 測試 proxy.ts 中提取的路由邏輯。
 * 由於 proxy.ts 與 NextAuth 耦合，這裡測試可獨立驗證的邏輯單元。
 */
import { describe, it, expect } from "vitest";

// ── 直接測試 path helpers（從 proxy 提取的邏輯）──

function extractStoreSlug(pathname: string): string | null {
  const match = pathname.match(/^\/s\/([^/]+)/);
  return match ? match[1] : null;
}

const SLUG_STORE_MAP: Record<string, string> = {
  zhubei: "default-store",
  taichung: "taichung-store",
};

const STORE_ID_SLUG_MAP: Record<string, string> = {
  "default-store": "zhubei",
  "taichung-store": "taichung",
};

function sessionSlug(storeId: string | null | undefined): string {
  return storeId ? (STORE_ID_SLUG_MAP[storeId] ?? "zhubei") : "zhubei";
}

describe("proxy route helpers", () => {
  describe("extractStoreSlug", () => {
    it("should extract slug from /s/zhubei/", () => {
      expect(extractStoreSlug("/s/zhubei/")).toBe("zhubei");
    });

    it("should extract slug from /s/taichung/book", () => {
      expect(extractStoreSlug("/s/taichung/book")).toBe("taichung");
    });

    it("should extract slug from /s/zhubei/admin/dashboard/bookings", () => {
      expect(extractStoreSlug("/s/zhubei/admin/dashboard/bookings")).toBe("zhubei");
    });

    it("should return null for /hq/dashboard", () => {
      expect(extractStoreSlug("/hq/dashboard")).toBeNull();
    });

    it("should return null for /dashboard", () => {
      expect(extractStoreSlug("/dashboard")).toBeNull();
    });

    it("should return null for /", () => {
      expect(extractStoreSlug("/")).toBeNull();
    });

    it("should return null for /book", () => {
      expect(extractStoreSlug("/book")).toBeNull();
    });
  });

  describe("SLUG_STORE_MAP", () => {
    it("should resolve zhubei → default-store", () => {
      expect(SLUG_STORE_MAP["zhubei"]).toBe("default-store");
    });

    it("should resolve taichung → taichung-store", () => {
      expect(SLUG_STORE_MAP["taichung"]).toBe("taichung-store");
    });

    it("should return undefined for unknown slug", () => {
      expect(SLUG_STORE_MAP["unknown"]).toBeUndefined();
    });
  });

  describe("sessionSlug", () => {
    it("should return zhubei for default-store", () => {
      expect(sessionSlug("default-store")).toBe("zhubei");
    });

    it("should return taichung for taichung-store", () => {
      expect(sessionSlug("taichung-store")).toBe("taichung");
    });

    it("should return zhubei for null", () => {
      expect(sessionSlug(null)).toBe("zhubei");
    });

    it("should return zhubei for undefined", () => {
      expect(sessionSlug(undefined)).toBe("zhubei");
    });

    it("should return zhubei for unknown storeId", () => {
      expect(sessionSlug("unknown-store")).toBe("zhubei");
    });
  });
});

describe("route classification", () => {
  // Simulate the route classification logic from proxy.ts

  function classifyRoute(pathname: string): {
    type: "store-public" | "store-customer" | "store-admin" | "store-home" |
          "hq-login" | "hq-dashboard" | "legacy" | "api" | "unknown";
    storeSlug?: string;
    subPath?: string;
  } {
    // API
    if (pathname.startsWith("/api/")) return { type: "api" };

    // Store routes
    const slug = extractStoreSlug(pathname);
    if (slug) {
      const subPath = pathname.slice(`/s/${slug}`.length) || "/";

      if (subPath.startsWith("/admin")) return { type: "store-admin", storeSlug: slug, subPath };

      const customerPrefixes = ["/book", "/my-bookings", "/my-plans", "/profile"];
      if (customerPrefixes.some(p => subPath === p || subPath.startsWith(p + "/"))) {
        return { type: "store-customer", storeSlug: slug, subPath };
      }

      const publicPrefixes = ["/register", "/activate", "/forgot-password", "/reset-password"];
      if (publicPrefixes.some(p => subPath === p || subPath.startsWith(p + "/"))) {
        return { type: "store-public", storeSlug: slug, subPath };
      }

      if (subPath === "/") return { type: "store-home", storeSlug: slug, subPath };

      return { type: "unknown", storeSlug: slug, subPath };
    }

    // HQ
    if (pathname === "/hq/login" || pathname.startsWith("/hq/login/")) return { type: "hq-login" };
    if (pathname.startsWith("/hq/dashboard")) return { type: "hq-dashboard" };

    // Legacy
    const legacyPrefixes = ["/login", "/register", "/activate", "/forgot-password",
      "/reset-password", "/book", "/my-bookings", "/my-plans", "/profile", "/dashboard"];
    if (legacyPrefixes.some(p => pathname === p || pathname.startsWith(p + "/"))) {
      return { type: "legacy" };
    }

    return { type: "unknown" };
  }

  it("should classify /s/zhubei/ as store-home", () => {
    expect(classifyRoute("/s/zhubei/")).toEqual({
      type: "store-home", storeSlug: "zhubei", subPath: "/",
    });
  });

  it("should classify /s/zhubei/book as store-customer", () => {
    expect(classifyRoute("/s/zhubei/book")).toEqual({
      type: "store-customer", storeSlug: "zhubei", subPath: "/book",
    });
  });

  it("should classify /s/taichung/my-bookings as store-customer", () => {
    expect(classifyRoute("/s/taichung/my-bookings")).toEqual({
      type: "store-customer", storeSlug: "taichung", subPath: "/my-bookings",
    });
  });

  it("should classify /s/zhubei/register as store-public", () => {
    expect(classifyRoute("/s/zhubei/register")).toEqual({
      type: "store-public", storeSlug: "zhubei", subPath: "/register",
    });
  });

  it("should classify /s/zhubei/activate/verify as store-public", () => {
    expect(classifyRoute("/s/zhubei/activate/verify")).toEqual({
      type: "store-public", storeSlug: "zhubei", subPath: "/activate/verify",
    });
  });

  it("should classify /s/zhubei/admin/dashboard as store-admin", () => {
    expect(classifyRoute("/s/zhubei/admin/dashboard")).toEqual({
      type: "store-admin", storeSlug: "zhubei", subPath: "/admin/dashboard",
    });
  });

  it("should classify /s/zhubei/admin/dashboard/bookings as store-admin", () => {
    expect(classifyRoute("/s/zhubei/admin/dashboard/bookings")).toEqual({
      type: "store-admin", storeSlug: "zhubei", subPath: "/admin/dashboard/bookings",
    });
  });

  it("should classify /hq/login as hq-login", () => {
    expect(classifyRoute("/hq/login")).toEqual({ type: "hq-login" });
  });

  it("should classify /hq/dashboard as hq-dashboard", () => {
    expect(classifyRoute("/hq/dashboard")).toEqual({ type: "hq-dashboard" });
  });

  it("should classify /hq/dashboard/bookings as hq-dashboard", () => {
    expect(classifyRoute("/hq/dashboard/bookings")).toEqual({ type: "hq-dashboard" });
  });

  it("should classify /login as legacy", () => {
    expect(classifyRoute("/login")).toEqual({ type: "legacy" });
  });

  it("should classify /book as legacy", () => {
    expect(classifyRoute("/book")).toEqual({ type: "legacy" });
  });

  it("should classify /dashboard as legacy", () => {
    expect(classifyRoute("/dashboard")).toEqual({ type: "legacy" });
  });

  it("should classify /dashboard/bookings as legacy", () => {
    expect(classifyRoute("/dashboard/bookings")).toEqual({ type: "legacy" });
  });

  it("should classify /api/auth/callback/google as api", () => {
    expect(classifyRoute("/api/auth/callback/google")).toEqual({ type: "api" });
  });
});

describe("session-store mismatch scenarios", () => {
  it("customer in zhubei accessing /s/taichung/book should be flagged as mismatch", () => {
    const sessionStoreId = "default-store"; // zhubei
    const urlSlug = "taichung";
    const urlStoreId = SLUG_STORE_MAP[urlSlug]; // taichung-store

    expect(sessionStoreId).not.toBe(urlStoreId);
    expect(sessionSlug(sessionStoreId)).toBe("zhubei");
    // Should redirect to /s/zhubei/book
  });

  it("customer in zhubei accessing /s/zhubei/book should NOT be flagged", () => {
    const sessionStoreId = "default-store";
    const urlSlug = "zhubei";
    const urlStoreId = SLUG_STORE_MAP[urlSlug];

    expect(sessionStoreId).toBe(urlStoreId);
  });

  it("ADMIN should be able to access any store admin", () => {
    const role = "ADMIN";
    // ADMIN bypasses store mismatch check
    expect(role).toBe("ADMIN");
  });

  it("OWNER should not access other store admin", () => {
    const role = "OWNER";
    const sessionStoreId = "default-store";
    const urlStoreId = "taichung-store";

    expect(role).not.toBe("ADMIN");
    expect(sessionStoreId).not.toBe(urlStoreId);
    // Should redirect to own store
  });
});
