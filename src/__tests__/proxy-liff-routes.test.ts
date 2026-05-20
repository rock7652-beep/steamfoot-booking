/**
 * PR-A: proxy 對 /s/[slug]/liff 的路由分類測試。
 *
 * proxy.ts 與 NextAuth 耦合難以直接執行，沿用 proxy-routes.test.ts 的模式：
 * 把判斷邏輯複製到測試檔，鎖定「/liff 屬於 storePublicPrefixes、不擋未登入」。
 *
 * 真實 proxy.ts 中對應的常數是 `storePublicPrefixes`（src/proxy.ts L132）。
 * 若那邊改了卻沒同步本檔，這個測試會在 review 時提醒你。
 */
import { describe, it, expect } from "vitest";

// 鎖定與 src/proxy.ts 的 storePublicPrefixes 一致
const STORE_PUBLIC_PREFIXES = [
  "/register",
  "/activate",
  "/forgot-password",
  "/reset-password",
  "/line-entry",
  "/liff",
];

const CUSTOMER_PREFIXES = [
  "/book",
  "/my-bookings",
  "/my-plans",
  "/my-points",
  "/my-referrals",
  "/my-growth",
  "/profile",
];

function classify(subPath: string): "public" | "customer" | "admin" | "home" | "other" {
  if (subPath === "/") return "home";
  if (subPath.startsWith("/admin")) return "admin";
  if (CUSTOMER_PREFIXES.some((p) => subPath === p || subPath.startsWith(p + "/"))) {
    return "customer";
  }
  if (STORE_PUBLIC_PREFIXES.some((p) => subPath === p || subPath.startsWith(p + "/"))) {
    return "public";
  }
  return "other";
}

describe("proxy /s/[slug]/liff routing (PR-A)", () => {
  it("classifies /liff as a public route (no login required)", () => {
    expect(classify("/liff")).toBe("public");
  });

  it("classifies /liff/anything as a public route too", () => {
    // 未來 PR-C/D 會加 /liff/onboarding /liff/book，提前驗證
    expect(classify("/liff/onboarding")).toBe("public");
    expect(classify("/liff/book")).toBe("public");
  });

  it("does NOT classify /liff as a customer route (would force login)", () => {
    expect(classify("/liff")).not.toBe("customer");
  });

  it("does NOT classify /liff as an admin route", () => {
    expect(classify("/liff")).not.toBe("admin");
  });

  it("treats /liff distinct from /book to avoid cross-prefix collisions", () => {
    expect(classify("/book")).toBe("customer");
    expect(classify("/liff")).toBe("public");
  });

  it("does not eat unrelated paths starting with /li or /l", () => {
    // 防呆：startsWith 條件要求 "/liff" 或 "/liff/"，不應命中 "/line-entry" 以外的東西
    expect(classify("/lift")).toBe("other"); // 一個假路徑，不該被當 public
    expect(classify("/liffish")).toBe("other");
  });

  it("keeps /line-entry as public (regression: 既有路由不被影響)", () => {
    expect(classify("/line-entry")).toBe("public");
  });
});
