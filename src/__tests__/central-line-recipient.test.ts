import { describe, expect, it } from "vitest";
import { resolveCentralLineRecipient, type CentralLineRecipientInput } from "@/server/services/central-line-recipient";

const LINE_ID = "U1234567890abcdef1234567890abcdef";

function input(overrides: Partial<CentralLineRecipientInput> = {}): CentralLineRecipientInput {
  return {
    customerId: "customer-a",
    directUserId: "user-a",
    legacyLineUserId: LINE_ID,
    identityLinks: [{ userId: "user-a", provider: "line", providerAccountId: LINE_ID, lineUserId: LINE_ID }],
    users: [{ id: "user-a", status: "ACTIVE", accounts: [{ provider: "line", providerAccountId: LINE_ID }] }],
    ...overrides,
  };
}

describe("resolveCentralLineRecipient", () => {
  it("resolves only the central LINE Account and masks the diagnostic output", () => {
    expect(resolveCentralLineRecipient(input())).toEqual({
      customerId: "customer-a",
      status: "READY",
      deliverable: true,
      centralUserId: "user-a",
      recipientLineUserId: LINE_ID,
      maskedRecipient: "U******cdef",
    });
  });

  it("does not infer a central user from legacy LINE alone", () => {
    expect(resolveCentralLineRecipient(input({ directUserId: null, identityLinks: [], users: [] })).status).toBe("NO_CENTRAL_USER");
  });

  it("blocks when direct and verified links point to different central users", () => {
    const result = resolveCentralLineRecipient(input({ identityLinks: [{ userId: "user-b", provider: "line", providerAccountId: LINE_ID, lineUserId: LINE_ID }] }));
    expect(result.status).toBe("CENTRAL_USER_CONFLICT");
    expect(result.recipientLineUserId).toBeNull();
  });

  it("blocks missing or multiple central LINE accounts", () => {
    expect(resolveCentralLineRecipient(input({ users: [{ id: "user-a", status: "ACTIVE", accounts: [] }] })).status).toBe("NO_CENTRAL_LINE");
    expect(resolveCentralLineRecipient(input({ users: [{ id: "user-a", status: "ACTIVE", accounts: [{ provider: "line", providerAccountId: LINE_ID }, { provider: "line", providerAccountId: "U-different-central" }] }] })).status).toBe("CENTRAL_LINE_CONFLICT");
  });

  it("allows a channel-scoped identity-link id when it belongs to the same central user", () => {
    const result = resolveCentralLineRecipient(input({ identityLinks: [{ userId: "user-a", provider: "line", providerAccountId: "U-other", lineUserId: "U-other" }] }));
    expect(result.status).toBe("READY");
    expect(result.recipientLineUserId).toBe(LINE_ID);
  });

  it("allows a channel-scoped legacy store id to differ from central LINE", () => {
    const result = resolveCentralLineRecipient(input({ legacyLineUserId: "U-other-store-binding" }));
    expect(result.status).toBe("READY");
    expect(result.recipientLineUserId).toBe(LINE_ID);
  });

  it("blocks inactive central users", () => {
    expect(resolveCentralLineRecipient(input({ users: [{ id: "user-a", status: "DISABLED", accounts: [{ provider: "line", providerAccountId: LINE_ID }] }] })).status).toBe("CENTRAL_USER_INACTIVE");
  });
});
