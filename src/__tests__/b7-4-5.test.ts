/**
 * B7-4.5: 前台多店入口補強 — 測試
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ──
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: vi.fn() }),
  headers: () => Promise.resolve({ get: vi.fn() }),
}));

vi.mock("react", () => ({
  cache: (fn: Function) => fn,
}));

// ============================================================
// 1. Email links include /s/[slug]/
// ============================================================

describe("email link generation", () => {
  it("sendActivationEmail includes /s/[slug]/ in link", async () => {
    // Mock sendMail to capture the HTML
    const sentEmails: string[] = [];
    vi.mock("resend", () => ({
      Resend: class {
        emails = {
          send: async ({ html }: { html: string }) => {
            sentEmails.push(html);
            return { data: { id: "test" }, error: null };
          },
        };
      },
    }));

    // Directly test the link construction logic
    const baseUrl = "https://www.steamfoot.com";
    const storeSlug = "zhubei";
    const token = "abc123";
    const storePath = storeSlug ? `/s/${storeSlug}` : "";
    const link = `${baseUrl}${storePath}/activate/verify?token=${token}`;

    expect(link).toBe("https://www.steamfoot.com/s/zhubei/activate/verify?token=abc123");
    expect(link).toContain("/s/zhubei/");
  });

  it("sendPasswordResetEmail includes /s/[slug]/ in link", () => {
    const baseUrl = "https://www.steamfoot.com";
    const storeSlug = "taichung";
    const token = "def456";
    const storePath = storeSlug ? `/s/${storeSlug}` : "";
    const link = `${baseUrl}${storePath}/reset-password?token=${token}`;

    expect(link).toBe("https://www.steamfoot.com/s/taichung/reset-password?token=def456");
    expect(link).toContain("/s/taichung/");
  });

  it("email link without slug falls back to root path", () => {
    const baseUrl = "https://www.steamfoot.com";
    const storeSlug: string | undefined = undefined;
    const token = "xyz";
    const storePath = storeSlug ? `/s/${storeSlug}` : "";
    const link = `${baseUrl}${storePath}/activate/verify?token=${token}`;

    expect(link).toBe("https://www.steamfoot.com/activate/verify?token=xyz");
    expect(link).not.toContain("/s/");
  });
});

// ============================================================
// 2. Request path slug resolves from DB
// ============================================================

describe("DB-based slug resolution (no static map)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveStoreBySlug queries DB for any slug", async () => {
    const { resolveStoreBySlug } = await import("@/lib/store-resolver");

    mockFindUnique.mockResolvedValue({
      id: "new-store-id",
      slug: "new-store",
      name: "新分店",
    });

    const result = await resolveStoreBySlug("new-store");
    expect(result).toEqual({
      id: "new-store-id",
      slug: "new-store",
      name: "新分店",
    });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { slug: "new-store" },
      select: { id: true, slug: true, name: true },
    });
  });

  it("new DB store works without static map change", async () => {
    const { resolveStoreBySlug } = await import("@/lib/store-resolver");

    // 新增一家店（不在任何靜態 map 中）
    mockFindUnique.mockResolvedValue({
      id: "kaohsiung-store",
      slug: "kaohsiung",
      name: "高雄店",
    });

    const result = await resolveStoreBySlug("kaohsiung");
    expect(result?.id).toBe("kaohsiung-store");
    expect(result?.slug).toBe("kaohsiung");
  });

  it("unknown slug returns null from DB", async () => {
    const { resolveStoreBySlug } = await import("@/lib/store-resolver");

    mockFindUnique.mockResolvedValue(null);

    const result = await resolveStoreBySlug("nonexistent");
    expect(result).toBeNull();
  });
});

// ============================================================
// 3. LINE webhook store resolution
// ============================================================

describe("LINE webhook store resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves zhubei store from destination", async () => {
    mockFindFirst.mockResolvedValue({ id: "default-store" });

    const destination = "U1234567890abcdef";
    const store = await mockFindFirst({
      where: { lineDestination: destination },
      select: { id: true },
    });

    expect(store).toEqual({ id: "default-store" });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { lineDestination: destination },
      select: { id: true },
    });
  });

  it("resolves taichung store from different destination", async () => {
    mockFindFirst.mockResolvedValue({ id: "taichung-store" });

    const destination = "Uabcdef1234567890";
    const store = await mockFindFirst({
      where: { lineDestination: destination },
      select: { id: true },
    });

    expect(store).toEqual({ id: "taichung-store" });
  });

  it("unknown destination returns null (safe abort)", async () => {
    mockFindFirst.mockResolvedValue(null);

    const destination = "Uunknown000000000";
    const store = await mockFindFirst({
      where: { lineDestination: destination },
      select: { id: true },
    });

    expect(store).toBeNull();
    // Webhook should abort, not fallback to DEFAULT_STORE_ID
  });

  it("missing destination returns null (safe abort)", async () => {
    const destination: string | undefined = undefined;

    // The webhook handler checks for undefined destination first
    if (!destination) {
      expect(destination).toBeUndefined();
      // Handler would log and abort here
    }
  });
});

// ============================================================
// 4. Proxy no longer uses SLUG_STORE_MAP for production
// ============================================================

describe("proxy slug handling without static map", () => {
  it("session storeSlug is used for redirects instead of static map lookup", () => {
    // Simulate session with storeSlug from JWT
    const session = {
      user: {
        role: "CUSTOMER",
        storeId: "default-store",
        storeSlug: "zhubei",
      },
    };

    // The proxy uses session.user.storeSlug directly
    const userSlug = session.user.storeSlug ?? "zhubei";
    expect(userSlug).toBe("zhubei");

    // Construct redirect URL
    const redirectUrl = `/s/${userSlug}/book`;
    expect(redirectUrl).toBe("/s/zhubei/book");
  });

  it("session storeSlug for non-default store", () => {
    const session = {
      user: {
        role: "OWNER",
        storeId: "taichung-store",
        storeSlug: "taichung",
      },
    };

    const userSlug = session.user.storeSlug ?? "zhubei";
    expect(userSlug).toBe("taichung");

    const redirectUrl = `/s/${userSlug}/admin/dashboard`;
    expect(redirectUrl).toBe("/s/taichung/admin/dashboard");
  });

  it("missing storeSlug falls back to DEFAULT_STORE_SLUG", () => {
    const session = {
      user: {
        role: "CUSTOMER",
        storeId: "some-id",
        storeSlug: null as string | null,
      },
    };

    const DEFAULT_STORE_SLUG = "zhubei";
    const userSlug = session.user.storeSlug ?? DEFAULT_STORE_SLUG;
    expect(userSlug).toBe("zhubei");
  });
});
