import { describe, expect, it } from "vitest";
import {
  classifyCentralMemberResolution,
  type CentralMemberHealthCustomer,
  type CentralMemberHealthIssue,
  type CentralMemberHealthLink,
} from "@/server/services/central-member-health";

const customer = (overrides: Partial<CentralMemberHealthCustomer> = {}): CentralMemberHealthCustomer => ({
  id: "customer-1", storeId: "store-1", name: "顧客", phone: "0912345678",
  userId: "user-1", googleId: null, lineUserId: "old-line", mergedIntoCustomerId: null,
  ...overrides,
});
const link = (overrides: Partial<CentralMemberHealthLink> = {}): CentralMemberHealthLink => ({
  id: "link-1", storeId: "store-1", customerId: "customer-1", userId: "user-1",
  provider: "line", providerAccountId: "new-line", lineUserId: "new-line", ...overrides,
});
const issue: CentralMemberHealthIssue = {
  id: "line:link-1", category: "LINE", severity: "BLOCKED",
  reason: "line_identity_mismatch", customerIds: ["customer-1"],
};

describe("classifyCentralMemberResolution", () => {
  it("never recommends rebind from mismatched LINE namespaces", () => {
    expect(classifyCentralMemberResolution("store-1", issue, [customer()], [link()])).toBe("MANUAL_REVIEW");
  });

  it("routes an explicit duplicate phone issue to merge review", () => {
    expect(classifyCentralMemberResolution("store-1", {
      ...issue,
      id: "phone:0912345678",
      category: "PHONE",
      severity: "REVIEW",
      reason: "duplicate_phone",
    }, [customer(), customer({ id: "customer-2" })], [link()])).toBe("MERGE_REVIEW");
  });

  it("routes a LINE candidate used by another customer to manual review", () => {
    expect(classifyCentralMemberResolution("store-1", issue, [
      customer(), customer({ id: "customer-2", phone: "0922222222", lineUserId: "new-line" }),
    ], [link()])).toBe("MANUAL_REVIEW");
  });

  it("routes a mismatched central user to manual review", () => {
    expect(classifyCentralMemberResolution("store-1", issue, [customer()], [link({ userId: "user-2" })])).toBe("MANUAL_REVIEW");
  });
});
