import { createHash } from "node:crypto";
import { normalizePersonName } from "@/lib/healthflow-import-reconciliation";

export type SecondaryRecoveryProfile = {
  id: string;
  fullName: string | null;
  email: string | null;
  birthDate: Date | string | null;
  storeKey: string | null;
};

export type SecondaryRecoveryCustomer = {
  id: string;
  storeId: string;
  storeKey: string;
  name: string;
  email: string | null;
  birthday: Date | string | null;
  healthProfileId: string | null;
};

export type SecondaryRecoveryRecord = { id: string; userId: string };
export type SecondaryRecoveryExisting = {
  sourceRecordId: string | null;
  customerId: string;
  storeId: string;
};

export type SecondaryRecoveryMapping = {
  profileId: string;
  customerId: string;
  storeId: string;
  storeKey: string;
  sourceRecordIds: string[];
  pendingSourceRecordIds: string[];
  matchedBy: "name_birth" | "name_email" | "name_birth_and_email";
};

export type SecondaryRecoverySkipReason =
  | "missing_identity"
  | "ambiguous_source"
  | "missing_target"
  | "ambiguous_target"
  | "conflicting_identity"
  | "different_health_profile"
  | "existing_conflict";

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizeBirthDate(value: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string | null) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function identityKeys(item: {
  storeKey: string | null;
  fullName?: string | null;
  name?: string | null;
  email: string | null;
  birthDate?: Date | string | null;
  birthday?: Date | string | null;
}) {
  const name = normalizePersonName(item.fullName ?? item.name);
  if (!item.storeKey || !name) return { birth: null, email: null };
  const birth = normalizeBirthDate(item.birthDate ?? item.birthday ?? null);
  const email = normalizeEmail(item.email);
  return {
    birth: birth ? `${item.storeKey}|${name}|birth:${birth}` : null,
    email: email ? `${item.storeKey}|${name}|email:${email}` : null,
  };
}

export function secondaryRecoveryPlanDigest(mappings: SecondaryRecoveryMapping[]) {
  const entries = mappings.flatMap((mapping) =>
    mapping.pendingSourceRecordIds.map(
      (sourceRecordId) => `${sourceRecordId}:${mapping.customerId}:${mapping.storeId}`,
    ),
  ).sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

export function planHealthflowSecondaryRecovery(input: {
  profiles: SecondaryRecoveryProfile[];
  eligibleProfileIds: Set<string>;
  customers: SecondaryRecoveryCustomer[];
  records: SecondaryRecoveryRecord[];
  existing: SecondaryRecoveryExisting[];
}) {
  const recordsByProfile = groupBy(input.records, (record) => record.userId);
  const recordBearingProfiles = input.profiles.filter((profile) => recordsByProfile.has(profile.id));
  const sourceByBirth = groupBy(recordBearingProfiles, (profile) => identityKeys(profile).birth);
  const sourceByEmail = groupBy(recordBearingProfiles, (profile) => identityKeys(profile).email);
  const targetByBirth = groupBy(input.customers, (customer) => identityKeys(customer).birth);
  const targetByEmail = groupBy(input.customers, (customer) => identityKeys(customer).email);
  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const existingBySourceId = new Map(
    input.existing.filter((row) => row.sourceRecordId).map((row) => [row.sourceRecordId!, row]),
  );
  const reasons: Record<SecondaryRecoverySkipReason, { profiles: number; records: number }> = {
    missing_identity: { profiles: 0, records: 0 },
    ambiguous_source: { profiles: 0, records: 0 },
    missing_target: { profiles: 0, records: 0 },
    ambiguous_target: { profiles: 0, records: 0 },
    conflicting_identity: { profiles: 0, records: 0 },
    different_health_profile: { profiles: 0, records: 0 },
    existing_conflict: { profiles: 0, records: 0 },
  };
  const mappings: SecondaryRecoveryMapping[] = [];

  const skip = (reason: SecondaryRecoverySkipReason, recordCount: number) => {
    reasons[reason].profiles += 1;
    reasons[reason].records += recordCount;
  };

  for (const profile of recordBearingProfiles) {
    if (!input.eligibleProfileIds.has(profile.id)) continue;
    const profileRecords = recordsByProfile.get(profile.id) ?? [];
    const sourceRecordIds = profileRecords.map((record) => record.id);
    const existingRows = sourceRecordIds
      .map((id) => existingBySourceId.get(id))
      .filter((row): row is SecondaryRecoveryExisting => Boolean(row));
    const existingTargets = new Set(existingRows.map((row) => `${row.storeId}:${row.customerId}`));
    if (existingTargets.size > 1) {
      skip("existing_conflict", profileRecords.length);
      continue;
    }

    const keys = identityKeys(profile);
    if (!keys.birth && !keys.email) {
      skip("missing_identity", profileRecords.length);
      continue;
    }
    if (
      (keys.birth && (sourceByBirth.get(keys.birth)?.length ?? 0) !== 1) ||
      (keys.email && (sourceByEmail.get(keys.email)?.length ?? 0) !== 1)
    ) {
      skip("ambiguous_source", profileRecords.length);
      continue;
    }

    const birthMatches = keys.birth ? targetByBirth.get(keys.birth) ?? [] : [];
    const emailMatches = keys.email ? targetByEmail.get(keys.email) ?? [] : [];
    if (birthMatches.length > 1 || emailMatches.length > 1) {
      skip("ambiguous_target", profileRecords.length);
      continue;
    }
    const matchedCustomers = new Map(
      [...birthMatches, ...emailMatches].map((customer) => [customer.id, customer]),
    );
    if (matchedCustomers.size === 0) {
      skip("missing_target", profileRecords.length);
      continue;
    }
    if (matchedCustomers.size !== 1) {
      skip("conflicting_identity", profileRecords.length);
      continue;
    }
    const customer = [...matchedCustomers.values()][0];
    if (existingTargets.size === 1 && !existingTargets.has(`${customer.storeId}:${customer.id}`)) {
      skip("existing_conflict", profileRecords.length);
      continue;
    }
    if (customer.healthProfileId && customer.healthProfileId !== profile.id) {
      skip("different_health_profile", profileRecords.length);
      continue;
    }
    if (existingRows.some((row) => row.customerId !== customer.id || row.storeId !== customer.storeId)) {
      skip("existing_conflict", profileRecords.length);
      continue;
    }

    mappings.push({
      profileId: profile.id,
      customerId: customer.id,
      storeId: customer.storeId,
      storeKey: customer.storeKey,
      sourceRecordIds,
      pendingSourceRecordIds: sourceRecordIds.filter((id) => !existingBySourceId.has(id)),
      matchedBy: birthMatches.length && emailMatches.length
        ? "name_birth_and_email"
        : birthMatches.length ? "name_birth" : "name_email",
    });
  }

  const pendingRecords = mappings.reduce((sum, mapping) => sum + mapping.pendingSourceRecordIds.length, 0);
  const summary = {
    reviewedProfiles: input.eligibleProfileIds.size,
    eligibleProfiles: mappings.length,
    eligibleRecords: mappings.reduce((sum, mapping) => sum + mapping.sourceRecordIds.length, 0),
    alreadyPresentRecords: mappings.reduce(
      (sum, mapping) => sum + mapping.sourceRecordIds.length - mapping.pendingSourceRecordIds.length,
      0,
    ),
    pendingRecords,
    skipped: reasons,
    matchedBy: {
      nameBirth: mappings.filter((mapping) => mapping.matchedBy === "name_birth").length,
      nameEmail: mappings.filter((mapping) => mapping.matchedBy === "name_email").length,
      both: mappings.filter((mapping) => mapping.matchedBy === "name_birth_and_email").length,
    },
  };
  return { mappings, summary, digest: secondaryRecoveryPlanDigest(mappings) };
}
