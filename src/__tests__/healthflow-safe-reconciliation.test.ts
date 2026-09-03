import { describe, expect, it } from "vitest";
import {
  planHealthflowSafeMatches,
  safeMatchPlanDigest,
  type SafeMatchCustomer,
  type SafeMatchProfile,
} from "@/lib/healthflow-safe-reconciliation";

const profile = (overrides: Partial<SafeMatchProfile> = {}): SafeMatchProfile => ({
  id: "profile-1",
  fullName: "王小明",
  phone: "0912-345-678",
  phoneNormalized: null,
  email: "ming@example.com",
  birthDate: "1980-05-01",
  storeKey: "zhubei",
  ...overrides,
});

const customer = (overrides: Partial<SafeMatchCustomer> = {}): SafeMatchCustomer => ({
  id: "customer-1",
  storeId: "store-1",
  storeKey: "zhubei",
  name: "王 小明",
  phone: "0912345678",
  email: "MING@example.com",
  birthday: "1980-05-01",
  healthProfileId: null,
  ...overrides,
});

function plan(input: {
  profiles?: SafeMatchProfile[];
  customers?: SafeMatchCustomer[];
  records?: Array<{ id: string; userId: string }>;
  existing?: Array<{ sourceRecordId: string | null; customerId: string; storeId: string }>;
} = {}) {
  return planHealthflowSafeMatches({
    profiles: input.profiles ?? [profile()],
    customers: input.customers ?? [customer()],
    records: input.records ?? [{ id: "record-1", userId: "profile-1" }],
    existing: input.existing ?? [],
  });
}

describe("HealthFlow remaining-record safe reconciliation", () => {
  it("accepts a unique same-store match backed by multiple identity signals", () => {
    const result = plan();
    expect(result.summary.safeRecords).toBe(1);
    expect(result.mappings[0]?.evidence).toContain("phone_name");
    expect(result.summary.accountedForRemainingRecords).toBe(1);
  });

  it("does not accept phone alone", () => {
    const result = plan({
      profiles: [profile({ fullName: null, email: null, birthDate: null })],
      customers: [customer({ name: "另一人", email: null, birthday: null })],
    });
    expect(result.summary.safeRecords).toBe(0);
    expect(result.reviews[0]?.reason).toBe("insufficient_evidence");
  });

  it("fails closed when any supplied identity field conflicts", () => {
    const result = plan({ customers: [customer({ email: "other@example.com" })] });
    expect(result.summary.safeRecords).toBe(0);
    expect(result.reviews[0]?.reason).toBe("identity_conflict");
  });

  it("sends multiple eligible targets to manual review", () => {
    const result = plan({
      customers: [customer(), customer({ id: "customer-2", storeId: "store-2" })],
    });
    expect(result.summary.safeRecords).toBe(0);
    expect(result.reviews[0]).toMatchObject({ reason: "target_ambiguous", candidateCount: 2 });
  });

  it("allows an unknown-store profile only when the target is globally unique", () => {
    const result = plan({ profiles: [profile({ storeKey: null })] });
    expect(result.summary.safeRecords).toBe(1);
  });

  it("uses a single verified existing target for a partially imported profile", () => {
    const result = plan({
      records: [
        { id: "record-1", userId: "profile-1" },
        { id: "record-2", userId: "profile-1" },
      ],
      existing: [{ sourceRecordId: "record-1", customerId: "customer-1", storeId: "store-1" }],
    });
    expect(result.summary.alreadyImportedRecords).toBe(1);
    expect(result.mappings[0]).toMatchObject({
      pendingSourceRecordIds: ["record-2"],
      evidence: ["existing_import"],
    });
  });

  it("does not auto-map two source profiles to the same target", () => {
    const result = plan({
      profiles: [profile(), profile({ id: "profile-2" })],
      records: [
        { id: "record-1", userId: "profile-1" },
        { id: "record-2", userId: "profile-2" },
      ],
    });
    expect(result.summary.safeRecords).toBe(0);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews.every((review) => review.reason === "source_identity_reused")).toBe(true);
  });

  it("rejects a target already linked to another HealthFlow profile", () => {
    const result = plan({ customers: [customer({ healthProfileId: "profile-other" })] });
    expect(result.summary.safeRecords).toBe(0);
    expect(result.reviews[0]?.reason).toBe("different_health_profile");
  });

  it("produces a stable digest independent of mapping order", () => {
    const mappings = [
      {
        profileId: "p1", customerId: "c1", storeId: "s1", storeKey: "zhubei",
        pendingSourceRecordIds: ["r2", "r1"], evidence: ["phone_name" as const],
      },
      {
        profileId: "p2", customerId: "c2", storeId: "s2", storeKey: "taichung",
        pendingSourceRecordIds: ["r3"], evidence: ["name_birth" as const],
      },
    ];
    expect(safeMatchPlanDigest(mappings)).toBe(safeMatchPlanDigest([...mappings].reverse()));
  });
});
