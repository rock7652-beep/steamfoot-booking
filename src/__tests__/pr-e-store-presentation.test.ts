/**
 * PR-E：per-store presentation regression tests
 *
 * 兩條主要驗證：
 *   1. 「fallback safety net」— DB 全 null 時 resolveStorePresentation 必須回 messages.ts 常數
 *      （任何時點 LIFF 不空白；多店 backfill 前的安全網）
 *   2. 「zhubei backfill regression」— 模擬竹北 backfill 後 DB 有值，resolveStorePresentation
 *      回的就是 DB 值；逐欄與 messages.ts 既有常數比對應該完全一致
 *      （證明 PR-E 對竹北顧客「行為完全不變」）
 *   3. 「per-store override」— 模擬第二家店 DB 有不同值，回的是該店值（不是常數）
 *      （證明多店真的能用）
 *   4. 「liffId env fallback」— Store.liffId null 時讀 env `NEXT_PUBLIC_LIFF_ID_<SLUG>`
 *      （證明過渡期不破壞既有 env 部署）
 *   5. 「liffId env 也無」— DB / env 皆無時 liffId === null（page 端應顯示 NotOpenForLiff）
 *
 * 也測試 PR-E generateGoogleCalendarUrl 改為接 3 個 per-store args 後行為不變。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 必須在 import 受測程式碼前先 mock prisma
const mockStoreFindUnique = vi.fn();
const mockShopConfigFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...a: unknown[]) => mockStoreFindUnique(...a),
    },
    shopConfig: {
      findUnique: (...a: unknown[]) => mockShopConfigFindUnique(...a),
    },
  },
}));

import { resolveStorePresentation } from "@/lib/store-resolver";
import {
  contactStoreUrl,
  storeAddress,
  storeMapUrl,
} from "@/lib/liff/messages";
import { generateGoogleCalendarUrl } from "@/app/(liff)/liff/bookings/_helpers";

const STORE_ID_ZHUBEI = "store_zhubei";
const STORE_ID_DEMO2 = "store_demo2";

beforeEach(() => {
  mockStoreFindUnique.mockReset();
  mockShopConfigFindUnique.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-E patch（Codex P1）：resolveStorePresentation 現在做 2 次 store.findUnique：
//   1. resolveStoreBySlug() — select {id, slug, name}（保留 PR-E 前行為，避免
//      其他 22+ 個 caller 在 migration 未套用時 P2022）
//   2. 第二次 — select {liffId}（PR-E LIFF-only 新增）
// 加上 1 次 shopConfig.findUnique。Mock 需依此順序 mockResolvedValueOnce。
// ─────────────────────────────────────────────────────────────────────────────

/** Helper：mock 同一個 slug 的 store 查詢（兩次 findUnique）+ 它的 ShopConfig */
function mockStoreLookup(opts: {
  storeBySlug: { id: string; slug: string; name: string } | null;
  liffId: string | null;
  shopConfig: {
    lineOfficialUrl: string | null;
    address: string | null;
    mapUrl: string | null;
  } | null;
}) {
  mockStoreFindUnique
    .mockResolvedValueOnce(opts.storeBySlug) // 1st: resolveStoreBySlug
    .mockResolvedValueOnce(
      opts.storeBySlug === null ? null : { liffId: opts.liffId }
    ); // 2nd: liffId-only query
  mockShopConfigFindUnique.mockResolvedValueOnce(opts.shopConfig);
}

describe("PR-E：resolveStorePresentation fallback safety net", () => {
  it("DB 全 null → 全欄位回 messages.ts 常數（任何時點 LIFF 不空白）", async () => {
    mockStoreLookup({
      storeBySlug: { id: STORE_ID_ZHUBEI, slug: "zhubei", name: "竹北店" },
      liffId: null,
      shopConfig: { lineOfficialUrl: null, address: null, mapUrl: null },
    });

    const p = await resolveStorePresentation("zhubei");
    expect(p).not.toBeNull();
    expect(p!.contactUrl).toBe(contactStoreUrl);
    expect(p!.address).toBe(storeAddress);
    expect(p!.mapUrl).toBe(storeMapUrl);
  });

  it("ShopConfig row 不存在（null）→ 全欄位仍 fallback 到常數", async () => {
    mockStoreLookup({
      storeBySlug: { id: STORE_ID_DEMO2, slug: "demo2", name: "Demo 第二店" },
      liffId: null,
      shopConfig: null,
    });

    const p = await resolveStorePresentation("demo2");
    expect(p).not.toBeNull();
    expect(p!.contactUrl).toBe(contactStoreUrl);
    expect(p!.address).toBe(storeAddress);
    expect(p!.mapUrl).toBe(storeMapUrl);
  });
});

describe("PR-E：zhubei backfill regression（行為完全不變）", () => {
  it("backfill 後 DB 值 === 既有 messages.ts 常數 → resolveStorePresentation 回 DB 值", async () => {
    // 模擬 backfill 已完成：DB 有與既有常數完全相同的值
    mockStoreLookup({
      storeBySlug: { id: STORE_ID_ZHUBEI, slug: "zhubei", name: "竹北店" },
      liffId: "1234567890-zhubeiLiff",
      shopConfig: {
        lineOfficialUrl: contactStoreUrl,
        address: storeAddress,
        mapUrl: storeMapUrl,
      },
    });

    const p = await resolveStorePresentation("zhubei");
    expect(p).not.toBeNull();
    // 與 backfill 前（直接 import 常數）行為完全一致
    expect(p!.contactUrl).toBe(contactStoreUrl);
    expect(p!.address).toBe(storeAddress);
    expect(p!.mapUrl).toBe(storeMapUrl);
    expect(p!.liffId).toBe("1234567890-zhubeiLiff");
  });
});

describe("PR-E：per-store override（多店真的能用）", () => {
  it("demo2 DB 有不同值 → 回 demo2 值，不會誤回常數", async () => {
    mockStoreLookup({
      storeBySlug: { id: STORE_ID_DEMO2, slug: "demo2", name: "Demo 第二店" },
      liffId: "9876543210-demo2Liff",
      shopConfig: {
        lineOfficialUrl: "https://lin.ee/DEMO2",
        address: "台中市某區某路一號",
        mapUrl: "https://maps.app.goo.gl/DEMO2",
      },
    });

    const p = await resolveStorePresentation("demo2");
    expect(p).not.toBeNull();
    expect(p!.contactUrl).toBe("https://lin.ee/DEMO2");
    expect(p!.address).toBe("台中市某區某路一號");
    expect(p!.mapUrl).toBe("https://maps.app.goo.gl/DEMO2");
    expect(p!.liffId).toBe("9876543210-demo2Liff");
    // 不應該意外混到常數
    expect(p!.contactUrl).not.toBe(contactStoreUrl);
    expect(p!.address).not.toBe(storeAddress);
  });
});

describe("PR-E：liffId 過渡期 env fallback", () => {
  it("Store.liffId null 但 env NEXT_PUBLIC_LIFF_ID_ZHUBEI 有設 → 用 env 值", async () => {
    const ORIGINAL = process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI;
    process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI = "env_fallback_liff_id";

    mockStoreLookup({
      storeBySlug: { id: STORE_ID_ZHUBEI, slug: "zhubei", name: "竹北店" },
      liffId: null, // DB 未填
      shopConfig: null,
    });

    const p = await resolveStorePresentation("zhubei");
    expect(p!.liffId).toBe("env_fallback_liff_id");

    // 還原 env
    if (ORIGINAL === undefined) {
      delete process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI;
    } else {
      process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI = ORIGINAL;
    }
  });

  it("Store.liffId null AND env 也無 → liffId === null（page 應顯示 NotOpenForLiff）", async () => {
    const ORIGINAL = process.env.NEXT_PUBLIC_LIFF_ID_NOSTORE;
    delete process.env.NEXT_PUBLIC_LIFF_ID_NOSTORE;

    mockStoreLookup({
      storeBySlug: { id: "ghost", slug: "nostore", name: "Ghost" },
      liffId: null,
      shopConfig: null,
    });

    const p = await resolveStorePresentation("nostore");
    expect(p!.liffId).toBeNull();

    if (ORIGINAL !== undefined) {
      process.env.NEXT_PUBLIC_LIFF_ID_NOSTORE = ORIGINAL;
    }
  });
});

describe("PR-E：store 不存在 → resolveStorePresentation 回 null", () => {
  it("findUnique 回 null → 整個 resolver 回 null（page 顯示「找不到分店」）", async () => {
    // store 不存在：第一次 findUnique 回 null，後續查詢應該短路不執行
    mockStoreFindUnique.mockResolvedValueOnce(null);

    const p = await resolveStorePresentation("nonexistent");
    expect(p).toBeNull();
    // 應該短路：第二次 store.findUnique（liffId）與 shopConfig.findUnique 都不該被呼叫
    expect(mockStoreFindUnique).toHaveBeenCalledTimes(1);
    expect(mockShopConfigFindUnique).not.toHaveBeenCalled();
  });
});

describe("PR-E patch（Codex P1）：resolveStoreBySlug 不再 select liffId", () => {
  it("resolveStorePresentation 內部仍能拿到 liffId（不影響行為）", async () => {
    mockStoreLookup({
      storeBySlug: { id: STORE_ID_ZHUBEI, slug: "zhubei", name: "竹北店" },
      liffId: "abc123",
      shopConfig: null,
    });

    const p = await resolveStorePresentation("zhubei");
    expect(p!.liffId).toBe("abc123");

    // 驗證 patch 的核心：resolveStoreBySlug 的 select 沒有 liffId
    // （第 1 個 findUnique call 應該只 select 既有 3 欄位）
    expect(mockStoreFindUnique.mock.calls[0]?.[0]).toEqual({
      where: { slug: "zhubei" },
      select: { id: true, slug: true, name: true },
    });
    // 第 2 個 findUnique call 才是 liffId-only query
    expect(mockStoreFindUnique.mock.calls[1]?.[0]).toEqual({
      where: { id: STORE_ID_ZHUBEI },
      select: { liffId: true },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PR-E patch（Codex P2）：getShopConfig 不 select PR-E 新欄位 address/mapUrl
// 同 P1 邏輯：getShopConfig 有 9 個 caller（reminder / checkout / settings / cache），
// 若它 select 新欄位，migration 還沒套用前 deploy 會炸所有 caller。
// address / mapUrl 已移到 resolveStorePresentation 內單獨查（LIFF only）。
// ─────────────────────────────────────────────────────────────────────────────
describe("PR-E patch（Codex P2）：getShopConfig 不 select PR-E 新欄位", () => {
  it("getShopConfig 的 select 保持 PR-E 前欄位（保護 9 個 caller）", async () => {
    const { getShopConfig } = await import("@/lib/shop-config");
    mockShopConfigFindUnique.mockReset();
    mockShopConfigFindUnique.mockResolvedValueOnce(null);

    await getShopConfig("any-store-id");

    const callArg = mockShopConfigFindUnique.mock.calls[0]?.[0] as
      | { select: Record<string, boolean> }
      | undefined;
    expect(callArg).toBeDefined();
    // 必須完全等於 PR-E 前的 select shape（鎖死 — 不可再加 PR-E 後 schema 欄位）
    expect(callArg!.select).toEqual({
      id: true,
      storeId: true,
      shopName: true,
      dutySchedulingEnabled: true,
      bankName: true,
      bankCode: true,
      bankAccountNumber: true,
      lineOfficialUrl: true,
      createdAt: true,
      updatedAt: true,
    });
    // 顯式斷言：不可包含 PR-E 新欄位
    expect(callArg!.select).not.toHaveProperty("address");
    expect(callArg!.select).not.toHaveProperty("mapUrl");
  });

  it("getShopConfig 缺 ShopConfig row 時的 fallback shape 不含 address/mapUrl", async () => {
    const { getShopConfig } = await import("@/lib/shop-config");
    mockShopConfigFindUnique.mockReset();
    mockShopConfigFindUnique.mockResolvedValueOnce(null);

    const result = await getShopConfig("any-store-id");
    expect(result).not.toHaveProperty("address");
    expect(result).not.toHaveProperty("mapUrl");
  });

  it("getShopConfig(null) 的 system-default fallback 不含 address/mapUrl", async () => {
    const { getShopConfig } = await import("@/lib/shop-config");
    const result = await getShopConfig(null);
    expect(result).not.toHaveProperty("address");
    expect(result).not.toHaveProperty("mapUrl");
  });
});

describe("PR-E：generateGoogleCalendarUrl 接 per-store args 後行為", () => {
  it("用 per-store address / mapUrl / contactUrl 組 details", () => {
    const url = generateGoogleCalendarUrl({
      bookingDate: "2026-06-15",
      slotTime: "14:00",
      storeName: "Demo 第二店",
      storeAddress: "台中市某區某路一號",
      storeMapUrl: "https://maps.app.goo.gl/DEMO2",
      contactUrl: "https://lin.ee/DEMO2",
    });
    // URL 應該是 Google Calendar TEMPLATE（HTTP，不是 data URI；hotfix #184 保留）
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    // 用 URL API 正確解析 querystring（URLSearchParams 把空格編成 +，decodeURIComponent 不解）
    const parsed = new URL(url);
    const details = parsed.searchParams.get("details") ?? "";
    const location = parsed.searchParams.get("location") ?? "";
    const text = parsed.searchParams.get("text") ?? "";
    expect(details).toContain("台中市某區某路一號");
    expect(details).toContain("https://maps.app.goo.gl/DEMO2");
    expect(details).toContain("https://lin.ee/DEMO2");
    expect(location).toBe("台中市某區某路一號");
    expect(text).toBe("Demo 第二店 預約");
  });

  it("竹北 regression：傳 messages.ts 常數值 → URL 與 PR-E 前等價", () => {
    const url = generateGoogleCalendarUrl({
      bookingDate: "2026-06-15",
      slotTime: "14:00",
      storeName: "竹北店",
      storeAddress,
      storeMapUrl,
      contactUrl: contactStoreUrl,
    });
    const parsed = new URL(url);
    const details = parsed.searchParams.get("details") ?? "";
    const location = parsed.searchParams.get("location") ?? "";
    expect(details).toContain(storeAddress);
    expect(details).toContain(storeMapUrl);
    expect(details).toContain(contactStoreUrl);
    expect(location).toBe(storeAddress);
  });
});
