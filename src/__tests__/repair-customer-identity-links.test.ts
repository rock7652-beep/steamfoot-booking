import { describe, expect, it } from "vitest";
import {
  classifyLiveState,
  projectRefFromDatabaseUrl,
  runCandidateSequence,
  sha256,
  type Result,
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

  it("stops before the third candidate when the second conflicts", async () => {
    const visited: number[] = [];
    const run = await runCandidateSequence({
      candidates: [1, 2, 3],
      execute: true,
      maxWrites: 3,
      processCandidate: async (candidate): Promise<Result> => {
        visited.push(candidate);
        return candidate === 2
          ? { customerId: "customer-2", status: "conflict", reason: "test_conflict" }
          : { customerId: `customer-${candidate}`, status: "created", reason: "created" };
      },
    });
    expect(visited).toEqual([1, 2]);
    expect(run).toMatchObject({
      created: 1,
      abortedEarly: true,
      abortedAtIndex: 2,
      remainingNotProcessed: 1,
      abortReason: "conflict:test_conflict",
    });
  });

  it("stops before the third candidate when the second fails", async () => {
    const visited: number[] = [];
    const run = await runCandidateSequence({
      candidates: [1, 2, 3],
      execute: true,
      maxWrites: 3,
      processCandidate: async (candidate): Promise<Result> => {
        visited.push(candidate);
        if (candidate === 2) throw new Error("test_failure");
        return { customerId: `customer-${candidate}`, status: "created", reason: "created" };
      },
    });
    expect(visited).toEqual([1, 2]);
    expect(run).toMatchObject({
      created: 1,
      abortedEarly: true,
      abortedAtIndex: 2,
      remainingNotProcessed: 1,
      abortReason: "failed:test_failure",
    });
  });

  it("continues after skipped and already_exists", async () => {
    const statuses: Result["status"][] = ["skipped", "already_exists", "created"];
    const run = await runCandidateSequence({
      candidates: [0, 1, 2],
      execute: true,
      maxWrites: 3,
      processCandidate: async (_, index) => ({
        customerId: `customer-${index}`,
        status: statuses[index],
        reason: "test",
      }),
    });
    expect(run.results).toHaveLength(3);
    expect(run.abortedEarly).toBe(false);
    expect(run.created).toBe(1);
  });

  it("never creates more than maxWrites", async () => {
    let calls = 0;
    const run = await runCandidateSequence({
      candidates: [1, 2, 3],
      execute: true,
      maxWrites: 1,
      processCandidate: async (candidate) => {
        calls++;
        return { customerId: `customer-${candidate}`, status: "created", reason: "created" };
      },
    });
    expect(calls).toBe(1);
    expect(run.created).toBe(1);
    expect(run.abortReason).toBe("max_writes_reached");
    expect(run.remainingNotProcessed).toBe(2);
  });
});
