import { describe, expect, it } from "vitest";
import {
  planHealthflowSecondaryRecovery,
  secondaryRecoveryPlanDigest,
  type SecondaryRecoveryCustomer,
  type SecondaryRecoveryProfile,
} from "@/lib/healthflow-secondary-recovery";

const profile = (overrides: Partial<SecondaryRecoveryProfile> = {}): SecondaryRecoveryProfile => ({
  id: "profile-1",
  fullName: "王 小明",
  email: "user@example.com",
  birthDate: "1990-01-02",
  storeKey: "zhubei",
  ...overrides,
});

const customer = (overrides: Partial<SecondaryRecoveryCustomer> = {}): SecondaryRecoveryCustomer => ({
  id: "customer-1",
  storeId: "store-1",
  storeKey: "zhubei",
  name: "王小明",
  email: "USER@example.com",
  birthday: new Date("1990-01-02T00:00:00.000Z"),
  healthProfileId: null,
  ...overrides,
});

function plan(overrides: Partial<Parameters<typeof planHealthflowSecondaryRecovery>[0]> = {}) {
  return planHealthflowSecondaryRecovery({
    profiles: [profile()],
    eligibleProfileIds: new Set(["profile-1"]),
    customers: [customer()],
    records: [{ id: "record-1", userId: "profile-1" }],
    existing: [],
    ...overrides,
  });
}

describe("planHealthflowSecondaryRecovery", () => {
  it("accepts a unique same-store name plus birth date and email", () => {
    const result = plan();
    expect(result.summary.pendingRecords).toBe(1);
    expect(result.mappings[0]).toMatchObject({
      customerId: "customer-1",
      matchedBy: "name_birth_and_email",
    });
  });

  it("accepts name plus email when no birth date is available", () => {
    const result = plan({ profiles: [profile({ birthDate: null })] });
    expect(result.mappings[0].matchedBy).toBe("name_email");
  });

  it("never crosses stores", () => {
    const result = plan({ customers: [customer({ storeKey: "taichung" })] });
    expect(result.summary.pendingRecords).toBe(0);
    expect(result.summary.skipped.missing_target.profiles).toBe(1);
  });

  it("rejects duplicate source identities", () => {
    const result = plan({
      profiles: [profile(), profile({ id: "profile-2" })],
      records: [
        { id: "record-1", userId: "profile-1" },
        { id: "record-2", userId: "profile-2" },
      ],
    });
    expect(result.summary.skipped.ambiguous_source.profiles).toBe(1);
  });

  it("rejects duplicate target identities", () => {
    const result = plan({ customers: [customer(), customer({ id: "customer-2" })] });
    expect(result.summary.skipped.ambiguous_target.profiles).toBe(1);
  });

  it("rejects birth date and email pointing to different customers", () => {
    const result = plan({
      customers: [
        customer({ email: "other@example.com" }),
        customer({ id: "customer-2", birthday: new Date("1991-01-02"), email: "user@example.com" }),
      ],
    });
    expect(result.summary.skipped.conflicting_identity.profiles).toBe(1);
  });

  it("rejects a target linked to another health profile", () => {
    const result = plan({ customers: [customer({ healthProfileId: "profile-other" })] });
    expect(result.summary.skipped.different_health_profile.profiles).toBe(1);
  });

  it("rejects conflicting existing record destinations", () => {
    const result = plan({
      customers: [customer(), customer({ id: "customer-2", name: "不同人" })],
      existing: [{ sourceRecordId: "record-1", customerId: "customer-2", storeId: "store-1" }],
    });
    expect(result.summary.skipped.existing_conflict.profiles).toBe(1);
  });

  it("produces a destination-sensitive deterministic digest", () => {
    const mappings = plan().mappings;
    expect(secondaryRecoveryPlanDigest(mappings)).toBe(secondaryRecoveryPlanDigest([...mappings].reverse()));
    expect(secondaryRecoveryPlanDigest([{ ...mappings[0], customerId: "different" }]))
      .not.toBe(secondaryRecoveryPlanDigest(mappings));
  });
});
