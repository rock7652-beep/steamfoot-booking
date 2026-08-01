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

  it("requires phone and password ownership proof for an unrecognised Login subject", () => {
    const action = read("src/server/actions/taichung-provider-line-login.ts");

    expect(action).toContain('status: "NEED_LOGIN"');
    expect(action).toContain('tempSession.channelKey !== "taichung"');
    expect(action).not.toContain('provider: "line"');
    expect(action).not.toContain("lineUserId:");
  });

  it("requires the authenticated central user before issuing the one-time bridge", () => {
    const action = read("src/server/actions/taichung-provider-line-finalize.ts");

    expect(action).toContain("resolveCentralUserForStoreCustomer");
    expect(action).toContain("issueTaichungLineSession");
    expect(action).not.toContain("customer.update");
    expect(action).not.toContain("account.");
  });
});
