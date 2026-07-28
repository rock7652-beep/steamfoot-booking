import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central member store selection fallback", () => {
  it("turns /store-select into an authenticated central-membership chooser", () => {
    const page = source("src/app/store-select/page.tsx");

    expect(page).toContain("getCurrentUser()");
    expect(page).toContain('user?.role === "CUSTOMER"');
    expect(page).toContain("resolveCentralMembershipsForUser(user.id)");
    expect(page).toContain("resolved.memberships.map");
    expect(page).toContain("selectCentralMemberStoreAction");
  });

  it("only submits the server-verified store slug and does not read operational data", () => {
    const page = source("src/app/store-select/page.tsx");

    expect(page).toContain('name="storeSlug"');
    expect(page).toContain("membership.storeSlug");
    expect(page).not.toContain("prisma.");
    expect(page).not.toContain("customerPlanWallet");
    expect(page).not.toContain("booking.");
  });

  it("keeps a safe fallback when no verified membership can be selected", () => {
    const page = source("src/app/store-select/page.tsx");

    expect(page).toContain("目前找不到可選擇的門市");
    expect(page).toContain("部分門市連結需要店家協助確認");
    expect(page).toContain('href="/"');
  });
});
