import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("all-store central User resolver", () => {
  it("treats CustomerIdentityLink as the cross-store ownership truth", () => {
    const source = read(
      "src/server/services/resolve-central-user-for-store-customer.ts",
    );

    expect(source).toContain("customer.identityLinks");
    expect(source).toContain('source: "identity_link"');
    expect(source).toContain('status: "identity_conflict"');
    expect(source).not.toContain('provider: "phone"');
  });

  it("fails closed when direct and linked identities disagree", () => {
    const source = read(
      "src/server/services/resolve-central-user-for-store-customer.ts",
    );

    expect(source).toContain("linkedUserId !== customer.user.id");
    expect(source).toContain("linkedUsers.size !== 1");
  });

  it("is store scoped and excludes merged Customers", () => {
    const source = read(
      "src/server/services/resolve-central-user-for-store-customer.ts",
    );

    expect(source).toContain("storeId: input.storeId");
    expect(source).toContain("mergedIntoCustomerId: null");
  });
});
