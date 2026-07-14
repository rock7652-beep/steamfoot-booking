/**
 * PR-E2 Codex P1 #2：proxy.ts 在 rewrite /s/[slug]/liff 時，必須把 x-store-slug
 * 放進「往內部走的 request headers」，而不只是放在 response headers。
 *
 * 原因：Next.js Server Component 的 headers() 讀的是 INCOMING request headers。
 *       如果 proxy 只 set 在 response.headers，server 端讀不到，LIFF page 的
 *       resolveStoreSlugForLiff() 會拿到 null → 全部 LIFF 頁顯示「無法確認分店」。
 *
 * 直接執行 proxy.ts 的 storeRewrite 需要 NextRequest/NextResponse runtime，
 * vitest 環境 import proxy.ts 會 cascade 進 next/server。為避開這條，把純
 * helper 抽到 `src/lib/proxy-helpers.ts`，proxy.ts 與本測試都 import 同一份。
 */
import { describe, it, expect } from "vitest";
import { buildStoreRewriteRequestHeaders } from "@/lib/proxy-helpers";

describe("buildStoreRewriteRequestHeaders (PR-E2 Codex P1 #2)", () => {
  it("回傳的 Headers 含 x-store-slug=<slug>（server component headers() 讀得到）", () => {
    const incoming = new Headers();
    const result = buildStoreRewriteRequestHeaders(incoming, "zhubei", "/s/zhubei/liff");
    expect(result.get("x-store-slug")).toBe("zhubei");
  });

  it("回傳的 Headers 含 x-next-pathname=<pathname>", () => {
    const incoming = new Headers();
    const result = buildStoreRewriteRequestHeaders(incoming, "hsinchu", "/s/hsinchu/liff/bookings");
    expect(result.get("x-next-pathname")).toBe("/s/hsinchu/liff/bookings");
  });

  it("非預設店 slug 也正確 forward（多店場景）", () => {
    const incoming = new Headers();
    const result = buildStoreRewriteRequestHeaders(incoming, "taichung", "/s/taichung/liff");
    expect(result.get("x-store-slug")).toBe("taichung");
    expect(result.get("x-store-slug")).not.toBe("zhubei");
  });

  it("保留 incoming request headers 的其他欄位（user-agent / cookie 等）", () => {
    const incoming = new Headers({
      "user-agent": "Mozilla/5.0 (LINE WebView)",
      "accept-language": "zh-TW",
      cookie: "store-slug=stale-cookie-value",
    });
    const result = buildStoreRewriteRequestHeaders(incoming, "zhubei", "/s/zhubei/liff");
    expect(result.get("user-agent")).toBe("Mozilla/5.0 (LINE WebView)");
    expect(result.get("accept-language")).toBe("zh-TW");
    expect(result.get("cookie")).toBe("store-slug=stale-cookie-value");
  });

  it("覆蓋 incoming 內既有的 x-store-slug（不可讓 client-supplied header 通過）", () => {
    // 防偽造：即使 client 送了惡意 x-store-slug header，也要被 proxy 的真實 slug 覆蓋
    const incoming = new Headers({ "x-store-slug": "attacker-supplied" });
    const result = buildStoreRewriteRequestHeaders(incoming, "zhubei", "/s/zhubei/liff");
    expect(result.get("x-store-slug")).toBe("zhubei");
    expect(result.get("x-store-slug")).not.toBe("attacker-supplied");
  });

  it("profile request 會覆蓋前一頁殘留的 x-next-pathname", () => {
    const incoming = new Headers({
      "x-next-pathname": "/s/hsinchu/book/new",
    });
    const result = buildStoreRewriteRequestHeaders(
      incoming,
      "hsinchu",
      "/s/hsinchu/profile",
    );
    expect(result.get("x-next-pathname")).toBe("/s/hsinchu/profile");
  });

  it("不 mutate 傳入的 incoming Headers（純函數）", () => {
    const incoming = new Headers({ "user-agent": "test" });
    buildStoreRewriteRequestHeaders(incoming, "zhubei", "/s/zhubei/liff");
    // 原 Headers 物件不該被加上 x-store-slug
    expect(incoming.get("x-store-slug")).toBeNull();
    expect(incoming.get("x-next-pathname")).toBeNull();
    // 原來的 user-agent 仍在
    expect(incoming.get("user-agent")).toBe("test");
  });
});
