import { describe, expect, it } from "vitest";
import {
  healthflowPhoneRecoveryPlanDigest,
  parseHealthflowMeasurementDate,
  planHealthflowPhoneRecovery,
  type HealthflowPhoneRecoveryCustomer,
  type HealthflowPhoneRecoveryProfile,
} from "@/lib/healthflow-phone-recovery";

const profile = (
  overrides: Partial<HealthflowPhoneRecoveryProfile> = {},
): HealthflowPhoneRecoveryProfile => ({
  id: "profile-1",
  phone: "0912-345-678",
  phoneNormalized: null,
  storeKey: "zhubei",
  ...overrides,
});

const customer = (
  overrides: Partial<HealthflowPhoneRecoveryCustomer> = {},
): HealthflowPhoneRecoveryCustomer => ({
  id: "customer-1",
  storeId: "store-1",
  storeKey: "zhubei",
  phone: "0912345678",
  healthProfileId: null,
  ...overrides,
});

const records = [
  { id: "record-1", userId: "profile-1" },
  { id: "record-2", userId: "profile-1" },
];

function plan(overrides: Partial<Parameters<typeof planHealthflowPhoneRecovery>[0]> = {}) {
  return planHealthflowPhoneRecovery({
    profiles: [profile()],
    customers: [customer()],
    records,
    existing: [],
    ...overrides,
  });
}

describe("parseHealthflowMeasurementDate", () => {
  it("accepts a real calendar date only", () => {
    expect(parseHealthflowMeasurementDate("2024-02-29")?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect(parseHealthflowMeasurementDate("2023-02-29")).toBeNull();
    expect(parseHealthflowMeasurementDate("2024-02-30")).toBeNull();
    expect(parseHealthflowMeasurementDate("2024-2-09")).toBeNull();
  });
});

describe("planHealthflowPhoneRecovery", () => {
  it("matches a unique phone inside a known store", () => {
    const result = plan();
    expect(result.summary.pendingRecords).toBe(2);
    expect(result.mappings[0]).toMatchObject({
      profileId: "profile-1",
      customerId: "customer-1",
      storeId: "store-1",
      pendingSourceRecordIds: ["record-1", "record-2"],
    });
  });

  it("uses a globally unique phone for a legacy profile without a store", () => {
    const result = plan({ profiles: [profile({ storeKey: null })] });
    expect(result.summary.pendingRecords).toBe(2);
  });

  it("rejects a globally ambiguous target", () => {
    const result = plan({
      profiles: [profile({ storeKey: null })],
      customers: [customer(), customer({ id: "customer-2", storeId: "store-2", storeKey: "taichung" })],
    });
    expect(result.summary.pendingRecords).toBe(0);
    expect(result.summary.skipped.ambiguous_target).toEqual({ profiles: 1, records: 2 });
  });

  it("does not match a known-store profile to another store", () => {
    const result = plan({ customers: [customer({ storeKey: "taichung" })] });
    expect(result.summary.skipped.missing_target.profiles).toBe(1);
  });

  it("rejects duplicate source profiles sharing the matching phone", () => {
    const result = plan({
      profiles: [profile(), profile({ id: "profile-2" })],
      records: [...records, { id: "record-3", userId: "profile-2" }],
    });
    expect(result.summary.skipped.ambiguous_source_phone).toEqual({ profiles: 2, records: 3 });
  });

  it("rejects a customer already linked to another health profile", () => {
    const result = plan({ customers: [customer({ healthProfileId: "profile-other" })] });
    expect(result.summary.skipped.different_health_profile.profiles).toBe(1);
  });

  it("protects a fully imported profile", () => {
    const result = plan({
      existing: records.map((record) => ({ sourceRecordId: record.id, customerId: "customer-1", storeId: "store-1" })),
    });
    expect(result.summary.completeProfiles).toBe(1);
    expect(result.summary.completeRecords).toBe(2);
    expect(result.summary.pendingRecords).toBe(0);
  });

  it("uses a valid partial import as an authoritative target", () => {
    const result = plan({
      existing: [{ sourceRecordId: "record-1", customerId: "customer-1", storeId: "store-1" }],
    });
    expect(result.summary.alreadyPresentRecords).toBe(1);
    expect(result.mappings[0].pendingSourceRecordIds).toEqual(["record-2"]);
  });

  it("rejects conflicting existing destinations", () => {
    const result = plan({
      customers: [customer(), customer({ id: "customer-2", storeId: "store-2" })],
      existing: [
        { sourceRecordId: "record-1", customerId: "customer-1", storeId: "store-1" },
        { sourceRecordId: "record-2", customerId: "customer-2", storeId: "store-2" },
      ],
    });
    expect(result.summary.skipped.existing_conflict.profiles).toBe(1);
  });

  it("produces a deterministic digest tied to exact destinations", () => {
    const mapping = plan().mappings;
    expect(healthflowPhoneRecoveryPlanDigest(mapping)).toBe(
      healthflowPhoneRecoveryPlanDigest([...mapping].reverse()),
    );
    expect(
      healthflowPhoneRecoveryPlanDigest([
        { ...mapping[0], customerId: "another-customer" },
      ]),
    ).not.toBe(healthflowPhoneRecoveryPlanDigest(mapping));
  });
});
