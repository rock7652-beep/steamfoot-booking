import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taichung provider-scoped LINE finalize", () => {
  it("keeps unauthenticated Taichung members inside the password gate", () => {
    const resolver = read("src/server/actions/taichung-provider-line-login.ts");
    expect(resolver).toContain('status: "NEED_LOGIN"');
    expect(resolver).not.toContain('if (!authenticatedUserId) {\n    return resolveLineLogin');
  });

  it("uses a provider-aware finalize after password verification", () => {
    const trigger = read("src/app/(auth)/oauth-confirm/finalize/_components/finalize-trigger.tsx");
    expect(trigger).toContain("finalizeTaichungProviderLineBind");
    expect(trigger).toContain("taichungCoordinator");
  });

  it("hands verified ownership to the signed bridge without writing any identity", () => {
    const finalize = read("src/server/actions/taichung-provider-line-finalize.ts");
    expect(finalize).toContain("issueTaichungLineSession");
    expect(finalize).not.toContain("customer.update");
    expect(finalize).not.toContain("account.");
    expect(finalize).not.toContain("customerIdentityLink");
  });
});
