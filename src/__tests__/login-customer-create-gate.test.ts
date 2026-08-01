import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSource = readFileSync("src/lib/auth.ts", "utf8");
const centralUserResolverSource = readFileSync(
  "src/server/services/resolve-central-user-for-store-customer.ts",
  "utf8",
);
const customerAuthSource = readFileSync("src/server/actions/customer-auth.ts", "utf8");
const registerSource = readFileSync("src/app/(auth)/register/page.tsx", "utf8");
const oauthConfirmSource = readFileSync("src/server/actions/oauth-confirm.ts", "utf8");

describe("PR-7 login customer creation gate", () => {
  it("does not assign an existing Google central user to a second Customer.userId", () => {
    expect(authSource).toContain("userId: existingGoogleAccount ? undefined : u.id");
    expect(authSource).toContain("customerIdentityLink.create");
    expect(authSource).toContain("provider: account.provider");
  });

  it("requires the existing password before reusing a phone central identity", () => {
    expect(customerAuthSource).toContain("compareSync(password, existingUser.passwordHash)");
    expect(customerAuthSource).toContain("existingUser.status !== \"ACTIVE\"");
  });

  it("creates a second-store phone membership without duplicating the User", () => {
    expect(customerAuthSource).toContain("const created = existingUser");
    expect(customerAuthSource).toContain("provider: \"phone\"");
    expect(customerAuthSource).toContain("providerAccountId: phone");
    expect(customerAuthSource).toContain("entryPoint: \"phone_password\"");
  });

  it("resolves a linked second-store phone membership through the central User", () => {
    expect(authSource).toContain("resolveCentralUserForStoreCustomer({\n            storeId,\n            phone,");
    expect(authSource).toContain('if (resolution.status !== "resolved") return null');
    expect(authSource).toContain('centralUser.role !== "CUSTOMER"');
    expect(authSource).toContain('centralUser.status !== "ACTIVE"');
    expect(authSource).toContain("!centralUser.passwordHash");

    // Store ownership is resolved through every valid identity link, not a
    // phone-provider-only fallback. Multiple owners must fail closed.
    expect(centralUserResolverSource).toContain("customer.identityLinks.map");
    expect(centralUserResolverSource).toContain("if (linkedUsers.size !== 1)");
    expect(centralUserResolverSource).not.toContain('provider: "phone"');

    // A credentials JWT must describe the current store Customer, while the
    // legacy direct-User repair remains unavailable to linked-only Customers.
    expect(authSource).toContain("if (customer.hasDirectUser)");
    expect(authSource).toContain("customerId: customer.id");
    expect(authSource).toContain("storeId: customer.storeId");
    expect(authSource).toContain("storeSlug: customer.store?.slug ?? null");
  });

  it("blocks an already-linked membership in the target store", () => {
    expect(customerAuthSource).toContain("existingUser?.customerIdentityLinks.length");
    expect(customerAuthSource).toContain("此手機號碼已註冊，請直接登入");
  });

  it("fails closed when two registration attempts race", () => {
    expect(customerAuthSource).toContain('e.code === "P2002" || e.code === "P2034"');
    expect(customerAuthSource).toContain("會員資料正在建立或已存在");
  });

  it("requires an explicit customer confirmation before cross-store phone linking", () => {
    expect(customerAuthSource).toContain('formData.get("confirmExistingMember") === "yes"');
    expect(customerAuthSource).toContain("existingUser && !confirmExistingMember");
    expect(registerSource).toContain("找到您原有的蒸管家會員");
    expect(registerSource).toContain("是，連結我的原有會員");
    expect(registerSource).toContain("這不是我的帳號");
  });

  it("only exposes a masked phone in the LINE existing-member confirmation URL", () => {
    expect(oauthConfirmSource).toContain("maskedPhone: `*******${phone.slice(-3)}`");
    expect(registerSource).toContain("其他門店的方案、堂數、預約與帳務不會合併或移動");
  });
});
