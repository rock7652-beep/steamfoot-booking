import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central member self-link entry", () => {
  it("exposes one customer entry from profile and store-scoped routing", () => {
    const profile = source("src/app/(customer)/profile/page.tsx");
    const proxy = source("src/proxy.ts");

    expect(profile).toContain('href={`${prefix}/member-link`}');
    expect(profile).toContain("連結我的會員資料");
    expect(proxy).toContain('"/member-link"');
  });

  it("routes LINE linking through the guarded OAuth account-link handshake", () => {
    const flow = source("src/app/(customer)/member-link/central-member-link-flow.tsx");

    expect(flow).toContain('beginOAuthAccountLinkAction("line", "link")');
    expect(flow).toContain('signIn("line", { callbackUrl })');
    expect(flow).not.toContain("providerAccountId");
    expect(flow).not.toContain("lineUserId");
  });

  it("reuses fail-closed membership claiming and states the no-proof stop", () => {
    const flow = source("src/app/(customer)/member-link/central-member-link-flow.tsx");
    const page = source("src/app/(customer)/member-link/page.tsx");

    expect(flow).toContain("<CentralMemberClaimForm />");
    expect(flow).toContain("系統不會自動連結");
    expect(flow).toContain("手機完全相同、每店唯一、且尚未屬於其他帳號");
    expect(page).toContain("user.customerId && user.storeId === storeContext.storeId");
  });

  it("keeps store operational data outside the self-link page", () => {
    const page = source("src/app/(customer)/member-link/page.tsx");

    expect(page).toContain("不合併各店顧客");
    expect(page).toContain("不搬動方案／堂數／預約／交易");
    expect(page).not.toContain("prisma.");
  });
});
