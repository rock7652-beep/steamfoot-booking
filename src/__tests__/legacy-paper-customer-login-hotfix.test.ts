import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("legacy paper customer login hotfix", () => {
  it("accepts an existing same-user Customer.userId when no identity link exists", () => {
    const resolver = source("src/server/services/central-member-resolver.ts");

    expect(resolver).toContain("prisma.customer.findMany");
    expect(resolver).toContain("userId,");
    expect(resolver).toContain("mergedIntoCustomerId: null");
    expect(resolver).toContain('providers: ["legacy_user_id"]');
  });

  it("does not override verified links or conflicts and fails closed on duplicate legacy customers", () => {
    const resolver = source("src/server/services/central-member-resolver.ts");

    expect(resolver).toContain("linkedStoreIds.has(customer.storeId)");
    expect(resolver).toContain("conflictedStoreIds.has(customer.storeId)");
    expect(resolver).toContain('reason: "multiple_customers_in_store"');
  });

  it("does not restore a legacy membership after an approved unlink", () => {
    const resolver = source("src/server/services/central-member-resolver.ts");

    expect(resolver).toContain("prisma.centralMemberLinkReviewRequest.findMany");
    expect(resolver).toContain('type: "UNLINK_REQUEST"');
    expect(resolver).toContain('status: "APPROVED"');
    expect(resolver).toContain("approvedUnlinkKeys.has");
  });

  it("shows an explicit recovery message instead of a blank member page", () => {
    const page = source("src/app/store-select/page.tsx");

    expect(page).toContain("無法確認店舖資訊");
    expect(page).toContain("目前找不到可選擇的門市");
    expect(page).toContain("請聯絡店家協助確認會員資料");
  });
});
