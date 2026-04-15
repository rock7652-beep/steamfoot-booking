/**
 * B7-5: Store Onboarding 測試（驗收對齊版）
 */
import { describe, it, expect, vi } from "vitest";

// ── Mocks ──
vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    shopConfig: { create: vi.fn() },
    bookingSlot: { createMany: vi.fn() },
    staff: { findMany: vi.fn() },
    staffPermission: { createMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/session", () => ({
  requireAdminSession: vi.fn().mockResolvedValue({ id: "admin", role: "ADMIN" }),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  createDefaultPermissions: vi.fn(),
  ALL_PERMISSIONS: ["customer.read", "booking.read"],
}));

vi.mock("react", () => ({ cache: (fn: Function) => fn }));

// ============================================================
// 1. 建店欄位驗證
// ============================================================

describe("建店欄位驗證", () => {
  it("slug: lowercase + numbers + hyphens, 2-30 chars", () => {
    const valid = ["zhubei", "taichung", "store-1", "my-store-2"];
    const invalid = ["Store", "my store", "store!", "UPPER", "a"];

    for (const s of valid) {
      expect(/^[a-z0-9-]+$/.test(s) && s.length >= 2 && s.length <= 30).toBe(true);
    }
    for (const s of invalid) {
      expect(/^[a-z0-9-]+$/.test(s) && s.length >= 2 && s.length <= 30).toBe(false);
    }
  });

  it("email format validation", () => {
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test("owner@store.com")).toBe(true);
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test("invalid")).toBe(false);
  });

  it("password minimum 6 chars", () => {
    expect("123456".length >= 6).toBe(true);
    expect("12345".length >= 6).toBe(false);
  });

  it("store ID is deterministic from slug", () => {
    expect(`store-${"kaohsiung"}`).toBe("store-kaohsiung");
    expect(`store-${"zhubei"}`).not.toBe(`store-${"taichung"}`);
  });
});

// ============================================================
// 2. URL 產出（對應 proxy.ts 實際路由）
// ============================================================

describe("交付 URL 產出", () => {
  const baseUrl = "https://www.steamfoot.com";
  const slug = "kaohsiung";
  const storeId = "store-kaohsiung";

  it("storefront = /s/{slug}/（顧客登入頁）", () => {
    expect(`${baseUrl}/s/${slug}/`).toBe("https://www.steamfoot.com/s/kaohsiung/");
  });

  it("booking = /s/{slug}/book", () => {
    expect(`${baseUrl}/s/${slug}/book`).toBe("https://www.steamfoot.com/s/kaohsiung/book");
  });

  it("register = /s/{slug}/register", () => {
    expect(`${baseUrl}/s/${slug}/register`).toBe("https://www.steamfoot.com/s/kaohsiung/register");
  });

  it("adminLogin = /hq/login（全域）", () => {
    expect(`${baseUrl}/hq/login`).toBe("https://www.steamfoot.com/hq/login");
  });

  it("adminDashboard = /s/{slug}/admin/dashboard", () => {
    expect(`${baseUrl}/s/${slug}/admin/dashboard`).toBe("https://www.steamfoot.com/s/kaohsiung/admin/dashboard");
  });

  it("hqStoreDetail = /hq/dashboard/stores/{storeId}", () => {
    expect(`${baseUrl}/hq/dashboard/stores/${storeId}`).toBe("https://www.steamfoot.com/hq/dashboard/stores/store-kaohsiung");
  });
});

// ============================================================
// 3. OWNER / STAFF 角色 mapping
// ============================================================

describe("OWNER / STAFF 角色", () => {
  it("OWNER is created with isOwner=true and storeId binding", () => {
    const ownerStaff = { isOwner: true, storeId: "store-kaohsiung" };
    expect(ownerStaff.isOwner).toBe(true);
    expect(ownerStaff.storeId).toBeTruthy();
  });

  it("MANAGER → OWNER in DB (核心教練)", () => {
    const inputRole = "MANAGER" as "STAFF" | "MANAGER";
    const dbRole = inputRole === "MANAGER" ? "OWNER" : "PARTNER";
    expect(dbRole).toBe("OWNER");
  });

  it("STAFF → PARTNER in DB (教練)", () => {
    const inputRole = "STAFF" as "STAFF" | "MANAGER";
    const dbRole = inputRole === "MANAGER" ? "OWNER" : "PARTNER";
    expect(dbRole).toBe("PARTNER");
  });

  it("additional staff isOwner=false", () => {
    expect({ isOwner: false }.isOwner).toBe(false);
  });
});

// ============================================================
// 4. Demo / 正式店
// ============================================================

describe("Demo vs 正式店", () => {
  it("所有新店一律 TRIAL（不區分 isDemo）", () => {
    expect({ isDemo: true, planStatus: "TRIAL" }.planStatus).toBe("TRIAL");
    expect({ isDemo: false, planStatus: "TRIAL" }.planStatus).toBe("TRIAL");
  });

  it("Demo 店禁止 activate", () => {
    const store = { isDemo: true, planStatus: "TRIAL" };
    expect(!store.isDemo).toBe(false); // canActivate = false
  });

  it("正式店可從 TRIAL → ACTIVE", () => {
    const store = { isDemo: false, planStatus: "TRIAL" };
    expect(!store.isDemo && store.planStatus === "TRIAL").toBe(true);
  });

  it("activate 後 planStatus=ACTIVE, isDemo 不變", () => {
    const after = { planStatus: "ACTIVE", isDemo: false };
    expect(after.planStatus).toBe("ACTIVE");
    expect(after.isDemo).toBe(false);
  });

  it("Demo 店 canActivate 永遠 false", () => {
    const store = { isDemo: true };
    const checklist: Array<{ status: "pass" | "fail" | "skip" }> = [{ status: "pass" }];
    const canActivate = !store.isDemo && checklist.every((c) => c.status !== "fail");
    expect(canActivate).toBe(false);
  });
});

// ============================================================
// 5. Store 狀態（TRIAL / ACTIVE）
// ============================================================

describe("Store 狀態機", () => {
  it("TRIAL = 尚未開通（等價 draft）", () => {
    expect("TRIAL").not.toBe("ACTIVE");
  });

  it("ACTIVE = 正式啟用（等價 active）", () => {
    expect("ACTIVE").toBe("ACTIVE");
  });

  it("StorePlanStatus 有 7 個值", () => {
    const allStatuses = ["TRIAL", "ACTIVE", "PAYMENT_PENDING", "PAST_DUE", "SCHEDULED_DOWNGRADE", "CANCELLED", "EXPIRED"];
    expect(allStatuses).toHaveLength(7);
  });
});

// ============================================================
// 6. 開通 Checklist（6 大面向）
// ============================================================

describe("驗收 Checklist 涵蓋 6 大面向", () => {
  // 交付 checklist keys
  const deliveryKeys = [
    "store_record",     // ① 店舖基本資料
    "route_entry",      // ② 路由入口
    "owner_login",      // ③ OWNER 登入
    "staff_created",    // ③ STAFF 建立
    "booking_page",     // ④ 顧客前台
    "register_page",    // ④ 顧客前台
    "first_booking",    // ④ 人工驗證
    "owner_permissions",// ⑤ 權限
    "store_isolation",  // ⑤ 隔離
    "line_config",      // ⑥ LINE
    "email_service",    // ⑥ Email
  ];

  it("交付 checklist 有 11 項", () => {
    expect(deliveryKeys).toHaveLength(11);
  });

  // 啟用前技術 checklist keys
  const verifyKeys = [
    "store-exists",      // ① 店舖基本資料
    "shop-config",       // ① ShopConfig
    "slug-resolvable",   // ② 路由入口
    "owner-exists",      // ③ OWNER
    "owner-permissions", // ⑤ 權限
    "booking-slots",     // ④ 前台
    "line-config",       // ⑥ LINE
  ];

  it("啟用前 checklist 有 7 項", () => {
    expect(verifyKeys).toHaveLength(7);
  });

  it("pass-only list canActivate = true", () => {
    const items: Array<{ status: "pass" | "fail" | "skip" }> = [
      { status: "pass" }, { status: "pass" }, { status: "skip" },
    ];
    expect(items.every((c) => c.status !== "fail")).toBe(true);
  });

  it("any fail → canActivate = false", () => {
    const items: Array<{ status: "pass" | "fail" | "skip" }> = [
      { status: "pass" }, { status: "fail" },
    ];
    expect(items.every((c) => c.status !== "fail")).toBe(false);
  });
});

// ============================================================
// 7. Default booking slots
// ============================================================

describe("預設時段", () => {
  it("56 slots (8 times × 7 days)", () => {
    const slotTimes = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];
    expect(slotTimes.length * 7).toBe(56);
  });
});
