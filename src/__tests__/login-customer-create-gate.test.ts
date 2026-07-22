import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSource = readFileSync("src/lib/auth.ts", "utf8");
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

  it("logs in a linked second-store phone membership through the central User", () => {
    expect(authSource).toContain("customer?.user ?? customer?.identityLinks[0]?.user");
    expect(authSource).toContain("where: { provider: \"phone\", providerAccountId: phone }");
    expect(authSource).toContain("if (customer.user)");
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
