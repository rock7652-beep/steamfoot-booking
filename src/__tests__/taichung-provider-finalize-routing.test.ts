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

  it("uses a provider-aware server route after password verification", () => {
    const login = read("src/server/actions/oauth-confirm.ts");
    const finalizeRoute = read("src/app/api/line-oauth/taichung/finalize/route.ts");
    expect(login).toContain("/api/line-oauth/taichung/finalize?customerId=");
    expect(finalizeRoute).toContain("completeTaichungProviderLineOwnershipProof");
    expect(finalizeRoute).not.toContain("issueTaichungLineSession");
    expect(finalizeRoute).toContain('new URL("/s/taichung/book"');
  });

  it("writes only a namespaced line_login identity inside a server transaction", () => {
    const finalize = read("src/server/actions/taichung-provider-line-finalize.ts");
    expect(finalize).toContain("completeTaichungProviderLineOwnershipProof");
    expect(finalize).toContain("createVerifiedCustomerIdentityLink");
    expect(finalize).toContain("$transaction");
    expect(finalize).not.toContain("customer.update");
    expect(finalize).not.toContain("account.");
    expect(finalize).not.toContain("provider: \"line\"");
  });
});
