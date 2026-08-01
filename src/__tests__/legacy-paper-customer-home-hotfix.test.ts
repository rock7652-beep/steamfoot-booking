import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("legacy paper customer home hotfix", () => {
  it("guards the actual customer home route with recovered session and customer helpers", () => {
    const layout = source("src/app/(customer)/book/layout.tsx");

    expect(layout).toContain("getCurrentUser()");
    expect(layout).toContain("getCurrentCustomer()");
    expect(layout).toContain("getStoreContext()");
    expect(layout).toContain('user?.role === "CUSTOMER" && customer && storeCtx');
  });

  it("never renders a blank page when the legacy customer context cannot be recovered", () => {
    const layout = source("src/app/(customer)/book/layout.tsx");
    const error = source("src/app/(customer)/book/error.tsx");

    expect(layout).toContain("會員資料暫時無法載入");
    expect(layout).toContain("登出並重新登入");
    expect(error).toContain("會員首頁載入失敗");
    expect(error).toContain("重新載入");
    expect(error).not.toContain("return null");
  });

  it("keeps the legacy paper customer contract independent of CustomerIdentityLink", () => {
    const resolver = source("src/server/services/central-member-resolver.ts");
    const layout = source("src/app/(customer)/book/layout.tsx");

    expect(resolver).toContain('providers: ["legacy_user_id"]');
    expect(layout).not.toContain("customerIdentityLink");
  });
});
