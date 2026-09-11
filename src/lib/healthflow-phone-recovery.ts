import { createHash } from "node:crypto";
import { normalizeTaiwanPhone } from "@/lib/healthflow-import-reconciliation";

export type HealthflowPhoneRecoveryProfile = {
  id: string;
  phone: string | null;
  phoneNormalized: string | null;
  storeKey: string | null;
};

export type HealthflowPhoneRecoveryCustomer = {
  id: string;
  storeId: string;
  storeKey: string;
  phone: string | null;
  healthProfileId: string | null;
};

export type HealthflowPhoneRecoveryRecord = {
  id: string;
  userId: string;
};

export type HealthflowPhoneRecoveryExisting = {
  sourceRecordId: string | null;
  customerId: string;
  storeId: string;
};

export type HealthflowPhoneRecoveryMapping = {
  profileId: string;
  customerId: string;
  storeId: string;
  storeKey: string;
  sourceRecordIds: string[];
  pendingSourceRecordIds: string[];
};

export type HealthflowPhoneRecoverySkipReason =
  | "invalid_phone"
  | "ambiguous_source_phone"
  | "missing_target"
  | "ambiguous_target"
  | "different_health_profile"
  | "existing_conflict"
  | "store_conflict";

type ReasonCounts = Record<
  HealthflowPhoneRecoverySkipReason,
  { profiles: number; records: number }
>;

function emptyReasonCounts(): ReasonCounts {
  return {
    invalid_phone: { profiles: 0, records: 0 },
    ambiguous_source_phone: { profiles: 0, records: 0 },
    missing_target: { profiles: 0, records: 0 },
    ambiguous_target: { profiles: 0, records: 0 },
    different_health_profile: { profiles: 0, records: 0 },
    existing_conflict: { profiles: 0, records: 0 },
    store_conflict: { profiles: 0, records: 0 },
  };
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

function mappingKey(storeId: string, customerId: string) {
  return `${storeId}:${customerId}`;
}

export function parseHealthflowMeasurementDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function healthflowPhoneRecoveryPlanDigest(
  mappings: HealthflowPhoneRecoveryMapping[],
) {
  const entries = mappings
    .flatMap((mapping) =>
      mapping.pendingSourceRecordIds.map(
        (sourceRecordId) =>
          `${sourceRecordId}:${mapping.customerId}:${mapping.storeId}`,
      ),
    )
    .sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

export function planHealthflowPhoneRecovery(input: {
  profiles: HealthflowPhoneRecoveryProfile[];
  customers: HealthflowPhoneRecoveryCustomer[];
  records: HealthflowPhoneRecoveryRecord[];
  existing: HealthflowPhoneRecoveryExisting[];
}) {
  const recordsByProfile = groupBy(input.records, (record) => record.userId);
  const sourceProfiles = input.profiles.filter((profile) =>
    recordsByProfile.has(profile.id),
  );
  const profilesByGlobalPhone = groupBy(sourceProfiles, (profile) =>
    normalizeTaiwanPhone(profile.phoneNormalized ?? profile.phone),
  );
  const profilesByStorePhone = groupBy(sourceProfiles, (profile) => {
    const phone = normalizeTaiwanPhone(profile.phoneNormalized ?? profile.phone);
    return profile.storeKey && phone ? `${profile.storeKey}:${phone}` : null;
  });
  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const customersByGlobalPhone = groupBy(input.customers, (customer) =>
    normalizeTaiwanPhone(customer.phone),
  );
  const customersByStorePhone = groupBy(input.customers, (customer) => {
    const phone = normalizeTaiwanPhone(customer.phone);
    return phone ? `${customer.storeKey}:${phone}` : null;
  });
  const existingBySourceId = new Map(
    input.existing
      .filter((row) => row.sourceRecordId)
      .map((row) => [row.sourceRecordId!, row]),
  );

  const mappings: HealthflowPhoneRecoveryMapping[] = [];
  const skippedProfiles: Array<{
    profileId: string;
    reason: HealthflowPhoneRecoverySkipReason;
    recordCount: number;
  }> = [];
  const skipped = emptyReasonCounts();
  let completeProfiles = 0;
  let completeRecords = 0;

  const skip = (
    profileId: string,
    reason: HealthflowPhoneRecoverySkipReason,
    recordCount: number,
  ) => {
    skippedProfiles.push({ profileId, reason, recordCount });
    skipped[reason].profiles += 1;
    skipped[reason].records += recordCount;
  };

  for (const profile of sourceProfiles) {
    const profileRecords = recordsByProfile.get(profile.id) ?? [];
    const sourceRecordIds = profileRecords.map((record) => record.id);
    const existingRows = sourceRecordIds
      .map((sourceRecordId) => existingBySourceId.get(sourceRecordId))
      .filter((row): row is HealthflowPhoneRecoveryExisting => Boolean(row));
    const existingTargets = new Set(
      existingRows.map((row) => mappingKey(row.storeId, row.customerId)),
    );

    if (existingRows.length === sourceRecordIds.length) {
      if (existingTargets.size !== 1) {
        skip(profile.id, "existing_conflict", profileRecords.length);
      } else {
        completeProfiles += 1;
        completeRecords += profileRecords.length;
      }
      continue;
    }
    if (existingTargets.size > 1) {
      skip(profile.id, "existing_conflict", profileRecords.length);
      continue;
    }

    const phone = normalizeTaiwanPhone(profile.phoneNormalized ?? profile.phone);
    if (!phone) {
      skip(profile.id, "invalid_phone", profileRecords.length);
      continue;
    }

    const sourceMatches = profile.storeKey
      ? profilesByStorePhone.get(`${profile.storeKey}:${phone}`) ?? []
      : profilesByGlobalPhone.get(phone) ?? [];
    if (sourceMatches.length !== 1) {
      skip(profile.id, "ambiguous_source_phone", profileRecords.length);
      continue;
    }

    let candidates: HealthflowPhoneRecoveryCustomer[] = [];
    if (existingTargets.size === 1) {
      const existing = existingRows[0];
      const candidate = existing ? customersById.get(existing.customerId) : null;
      if (!candidate || candidate.storeId !== existing?.storeId) {
        skip(profile.id, "existing_conflict", profileRecords.length);
        continue;
      }
      candidates = [candidate];
    } else {
      candidates = profile.storeKey
        ? customersByStorePhone.get(`${profile.storeKey}:${phone}`) ?? []
        : customersByGlobalPhone.get(phone) ?? [];
    }

    if (candidates.length === 0) {
      skip(profile.id, "missing_target", profileRecords.length);
      continue;
    }
    if (candidates.length !== 1) {
      skip(profile.id, "ambiguous_target", profileRecords.length);
      continue;
    }

    const customer = candidates[0];
    if (profile.storeKey && customer.storeKey !== profile.storeKey) {
      skip(profile.id, "store_conflict", profileRecords.length);
      continue;
    }
    if (normalizeTaiwanPhone(customer.phone) !== phone) {
      skip(profile.id, "existing_conflict", profileRecords.length);
      continue;
    }
    if (
      customer.healthProfileId &&
      customer.healthProfileId !== profile.id
    ) {
      skip(profile.id, "different_health_profile", profileRecords.length);
      continue;
    }
    if (
      existingRows.some(
        (row) =>
          row.customerId !== customer.id || row.storeId !== customer.storeId,
      )
    ) {
      skip(profile.id, "existing_conflict", profileRecords.length);
      continue;
    }

    mappings.push({
      profileId: profile.id,
      customerId: customer.id,
      storeId: customer.storeId,
      storeKey: customer.storeKey,
      sourceRecordIds,
      pendingSourceRecordIds: sourceRecordIds.filter(
        (sourceRecordId) => !existingBySourceId.has(sourceRecordId),
      ),
    });
  }

  const eligibleRecords = mappings.reduce(
    (total, mapping) => total + mapping.sourceRecordIds.length,
    0,
  );
  const alreadyPresentRecords = mappings.reduce(
    (total, mapping) =>
      total +
      (mapping.sourceRecordIds.length - mapping.pendingSourceRecordIds.length),
    0,
  );
  const pendingRecords = mappings.reduce(
    (total, mapping) => total + mapping.pendingSourceRecordIds.length,
    0,
  );
  const byStore = [...groupBy(mappings, (mapping) => mapping.storeKey)].map(
    ([storeKey, storeMappings]) => ({
      storeKey,
      profiles: storeMappings.length,
      pendingRecords: storeMappings.reduce(
        (total, mapping) => total + mapping.pendingSourceRecordIds.length,
        0,
      ),
    }),
  );

  return {
    mappings,
    skippedProfiles,
    digest: healthflowPhoneRecoveryPlanDigest(mappings),
    summary: {
      sourceProfiles: sourceProfiles.length,
      sourceRecords: input.records.length,
      completeProfiles,
      completeRecords,
      eligibleProfiles: mappings.length,
      eligibleRecords,
      alreadyPresentRecords,
      pendingRecords,
      skipped,
      byStore,
    },
  };
}
