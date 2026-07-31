import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Taichung provider-scoped LINE identity", () => {
  it("uses the provider-aware resolver only for the dedicated Taichung flow", () => {
    const form = read("src/app/(auth)/oauth-confirm/_components/oauth-confirm-form.tsx");

    expect(form).toContain("resolveTaichungProviderLineLogin");
    expect(form).toContain("taichungCoordinator");
    expect(form).toContain("await resolveTaichungProviderLineLogin");
    expect(form).toContain("await resolveLineLogin");
  });

  it("requires the authenticated central user to own the existing store identity link", () => {
    const action = read("src/server/actions/taichung-provider-line-login.ts");

    expect(action).toContain("const nextAuthSession = await auth()");
    expect(action).toContain("link.userId !== authenticatedUserId");
    expect(action).toContain('tempSession.channelKey !== "taichung"');
  });

  it("rotates only the Taichung Customer and store-scoped identity link", () => {
    const action = read("src/server/actions/taichung-provider-line-login.ts");

    expect(action).toContain("tx.customer.update");
    expect(action).toContain("tx.customerIdentityLink.update");
    expect(action).toContain("providerAccountId: tempSession.lineUserId");
    expect(action).not.toContain("tx.account.update");
    expect(action).not.toContain("syncLineAccountForUser");
  });
});
