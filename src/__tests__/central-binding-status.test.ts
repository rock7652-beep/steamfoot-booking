import { describe, expect, it } from "vitest";
import { resolveCentralBindingStatus } from "@/server/services/central-binding-status";

describe("resolveCentralBindingStatus", () => {
  it("requires the customer to establish a verified central user first", () => {
    expect(resolveCentralBindingStatus({
      hasCentralUser: false,
      hasVerifiedMemberLink: false,
      hasCentralLine: false,
    })).toBe("NEEDS_LOGIN");
  });

  it("does not treat a login account as a verified store membership", () => {
    expect(resolveCentralBindingStatus({
      hasCentralUser: true,
      hasVerifiedMemberLink: false,
      hasCentralLine: true,
    })).toBe("NEEDS_MEMBER_LINK");
  });

  it("requires central LINE after the membership link exists", () => {
    expect(resolveCentralBindingStatus({
      hasCentralUser: true,
      hasVerifiedMemberLink: true,
      hasCentralLine: false,
    })).toBe("NEEDS_LINE");
  });

  it("reports complete only when all verified evidence exists", () => {
    expect(resolveCentralBindingStatus({
      hasCentralUser: true,
      hasVerifiedMemberLink: true,
      hasCentralLine: true,
    })).toBe("COMPLETE");
  });
});

