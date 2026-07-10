import { describe, expect, it } from "vitest";
import {
  classifyLiveState,
  projectRefFromDatabaseUrl,
  sha256,
  type SnapshotCandidate,
} from "../../scripts/repair-customer-identity-links";

const lineUserId = "U1234567890abcdef";
const expected: SnapshotCandidate = {
  customerId: "customer-1",
  storeId: "store-1",
  userId: "user-1",
  lineIdentitySha256: sha256(lineUserId),
};

const base = {
  customer: {
    id: expected.customerId,
    storeId: expected.storeId,
    userId: expected.userId,
    lineUserId,
    lineLinkStatus: "LINKED",
    mergedIntoCustomerId: null,
  },
  account: { userId: expected.userId, providerAccountId: lineUserId },
  linkByCustomer: null,
  linkByIdentity: null,
};

describe("CustomerIdentityLink guarded repair", () => {
  it("accepts only the exact production project ref", () => {
    expect(projectRefFromDatabaseUrl("postgresql://postgres.qijlnhtpbintanzpxkvf:x@aws.pooler.supabase.com/postgres"))
      .toBe("qijlnhtpbintanzpxkvf");
    expect(projectRefFromDatabaseUrl("postgresql://localhost/db")).toBeNull();
  });

  it("marks the unchanged snapshot candidate ready", () => {
    expect(classifyLiveState(expected, base)).toEqual({ status: "ready", reason: "all_guards_pass" });
  });

  it("skips when customer identity changed after snapshot", () => {
    expect(classifyLiveState(expected, {
      ...base,
      customer: { ...base.customer, lineUserId: "Uchanged" },
    })).toEqual({ status: "skipped", reason: "line_identity_changed" });
  });

  it("rejects an Account owned by another User", () => {
    expect(classifyLiveState(expected, {
      ...base,
      account: { userId: "other-user", providerAccountId: lineUserId },
    })).toEqual({ status: "conflict", reason: "line_account_owned_by_other_user" });
  });

  it("recognizes an idempotent exact link", () => {
    const exact = {
      userId: expected.userId,
      storeId: expected.storeId,
      customerId: expected.customerId,
      provider: "line",
      providerAccountId: lineUserId,
    };
    expect(classifyLiveState(expected, { ...base, linkByCustomer: exact, linkByIdentity: exact }))
      .toEqual({ status: "already_exists", reason: "exact_link_present" });
  });

  it("rejects a LINE identity linked to another customer", () => {
    expect(classifyLiveState(expected, {
      ...base,
      linkByIdentity: {
        userId: expected.userId,
        storeId: expected.storeId,
        customerId: "other-customer",
        provider: "line",
        providerAccountId: lineUserId,
      },
    })).toEqual({ status: "conflict", reason: "line_identity_linked_elsewhere" });
  });
});
