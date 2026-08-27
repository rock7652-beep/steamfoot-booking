import { createHash } from "node:crypto";
import {
  normalizePersonName,
  normalizeTaiwanPhone,
} from "@/lib/healthflow-import-reconciliation";

export type SafeMatchProfile = {
  id: string;
  fullName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  birthDate: Date | string | null;
  storeKey: string | null;
};

export type SafeMatchCustomer = {
  id: string;
  storeId: string;
  storeKey: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: Date | string | null;
  healthProfileId: string | null;
};

export type SafeMatchRecord = { id: string; userId: string };
export type SafeMatchExisting = {
  sourceRecordId: string | null;
  customerId: string;
  storeId: string;
};

export type SafeMatchEvidence =
  | "existing_import"
  | "health_profile_link"
  | "phone_name"
  | "phone_birth"
  | "phone_email"
  | "name_birth"
  | "name_email";

export type SafeMatchReviewReason =
  | "existing_conflict"
  | "source_identity_reused"
  | "target_ambiguous"
  | "identity_conflict"
  | "different_health_profile"
  | "insufficient_evidence"
  | "missing_identity"
  | "no_customer";

export type SafeMatchMapping = {
  profileId: string;
  customerId: string;
  storeId: string;
  storeKey: string;
  pendingSourceRecordIds: string[];
  evidence: SafeMatchEvidence[];
};

export type SafeMatchReview = {
  profileId: string;
  reason: SafeMatchReviewReason;
  pendingSourceRecordIds: string[];
  candidateCount: number;
};

type NormalizedIdentity = {
  phone: string | null;
  name: string | null;
  birth: string | null;
  email: string | null;
};

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizeBirth(value: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function profileIdentity(profile: SafeMatchProfile): NormalizedIdentity {
  return {
    phone: normalizeTaiwanPhone(profile.phoneNormalized ?? profile.phone),
    name: normalizePersonName(profile.fullName),
    birth: normalizeBirth(profile.birthDate),
    email: normalizeEmail(profile.email),
  };
}

function customerIdentity(customer: SafeMatchCustomer): NormalizedIdentity {
  return {
    phone: normalizeTaiwanPhone(customer.phone),
    name: normalizePersonName(customer.name),
    birth: normalizeBirth(customer.birthday),
    email: normalizeEmail(customer.email),
  };
}

function compareIdentity(source: NormalizedIdentity, target: NormalizedIdentity) {
  const matches = new Set<keyof NormalizedIdentity>();
  const conflicts = new Set<keyof NormalizedIdentity>();
  for (const key of ["phone", "name", "birth", "email"] as const) {
    if (!source[key] || !target[key]) continue;
    if (source[key] === target[key]) matches.add(key);
    else conflicts.add(key);
  }
  return { matches, conflicts };
}

function evidenceFor(matches: Set<keyof NormalizedIdentity>): SafeMatchEvidence[] {
  const evidence: SafeMatchEvidence[] = [];
  if (matches.has("phone") && matches.has("name")) evidence.push("phone_name");
  if (matches.has("phone") && matches.has("birth")) evidence.push("phone_birth");
  if (matches.has("phone") && matches.has("email")) evidence.push("phone_email");
  if (matches.has("name") && matches.has("birth")) evidence.push("name_birth");
  if (matches.has("name") && matches.has("email")) evidence.push("name_email");
  return evidence;
}

function mappingKey(storeId: string, customerId: string) {
  return `${storeId}:${customerId}`;
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

export function safeMatchPlanDigest(mappings: SafeMatchMapping[]) {
  const rows = mappings.flatMap((mapping) =>
    mapping.pendingSourceRecordIds.map(
      (sourceRecordId) => `${sourceRecordId}:${mapping.customerId}:${mapping.storeId}`,
    ),
  ).sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function planHealthflowSafeMatches(input: {
  profiles: SafeMatchProfile[];
  customers: SafeMatchCustomer[];
  records: SafeMatchRecord[];
  existing: SafeMatchExisting[];
}) {
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const customersByHealthProfile = groupBy(input.customers, (customer) => customer.healthProfileId);
  const recordsByProfile = groupBy(input.records, (record) => record.userId);
  const existingBySourceId = new Map(
    input.existing
      .filter((row) => row.sourceRecordId)
      .map((row) => [row.sourceRecordId!, row]),
  );

  const sourceRecordsMissingProfile = input.records.filter(
    (record) => !profilesById.has(record.userId),
  );
  const completeProfiles = new Set<string>();
  const provisionalMappings: SafeMatchMapping[] = [];
  const reviews: SafeMatchReview[] = [];

  const addReview = (
    profileId: string,
    reason: SafeMatchReviewReason,
    pendingSourceRecordIds: string[],
    candidateCount = 0,
  ) => reviews.push({ profileId, reason, pendingSourceRecordIds, candidateCount });

  for (const profile of input.profiles) {
    const profileRecords = recordsByProfile.get(profile.id) ?? [];
    if (profileRecords.length === 0) continue;
    const pendingSourceRecordIds = profileRecords
      .map((record) => record.id)
      .filter((id) => !existingBySourceId.has(id));
    if (pendingSourceRecordIds.length === 0) {
      completeProfiles.add(profile.id);
      continue;
    }

    const existingRows = profileRecords
      .map((record) => existingBySourceId.get(record.id))
      .filter((row): row is SafeMatchExisting => Boolean(row));
    const existingTargets = new Set(
      existingRows.map((row) => mappingKey(row.storeId, row.customerId)),
    );
    if (existingTargets.size > 1) {
      addReview(profile.id, "existing_conflict", pendingSourceRecordIds, existingTargets.size);
      continue;
    }

    if (existingTargets.size === 1) {
      const row = existingRows[0];
      const customer = row ? customersById.get(row.customerId) : null;
      if (
        !customer ||
        customer.storeId !== row.storeId ||
        (profile.storeKey && customer.storeKey !== profile.storeKey) ||
        (customer.healthProfileId && customer.healthProfileId !== profile.id)
      ) {
        addReview(profile.id, "existing_conflict", pendingSourceRecordIds, 1);
        continue;
      }
      provisionalMappings.push({
        profileId: profile.id,
        customerId: customer.id,
        storeId: customer.storeId,
        storeKey: customer.storeKey,
        pendingSourceRecordIds,
        evidence: ["existing_import"],
      });
      continue;
    }

    const directLinks = customersByHealthProfile.get(profile.id) ?? [];
    if (directLinks.length > 1) {
      addReview(profile.id, "target_ambiguous", pendingSourceRecordIds, directLinks.length);
      continue;
    }
    if (directLinks.length === 1) {
      const customer = directLinks[0];
      const comparison = compareIdentity(profileIdentity(profile), customerIdentity(customer));
      if (
        (profile.storeKey && customer.storeKey !== profile.storeKey) ||
        comparison.conflicts.size > 0
      ) {
        addReview(profile.id, "identity_conflict", pendingSourceRecordIds, 1);
        continue;
      }
      provisionalMappings.push({
        profileId: profile.id,
        customerId: customer.id,
        storeId: customer.storeId,
        storeKey: customer.storeKey,
        pendingSourceRecordIds,
        evidence: ["health_profile_link"],
      });
      continue;
    }

    const sourceIdentity = profileIdentity(profile);
    if (!Object.values(sourceIdentity).some(Boolean)) {
      addReview(profile.id, "missing_identity", pendingSourceRecordIds);
      continue;
    }

    const scopedCustomers = profile.storeKey
      ? input.customers.filter((customer) => customer.storeKey === profile.storeKey)
      : input.customers;
    const evaluated = scopedCustomers.map((customer) => {
      const comparison = compareIdentity(sourceIdentity, customerIdentity(customer));
      return {
        customer,
        ...comparison,
        evidence: evidenceFor(comparison.matches),
      };
    });
    const eligible = evaluated.filter(
      (candidate) =>
        candidate.conflicts.size === 0 &&
        candidate.evidence.length > 0 &&
        (!candidate.customer.healthProfileId || candidate.customer.healthProfileId === profile.id),
    );
    if (eligible.length > 1) {
      addReview(profile.id, "target_ambiguous", pendingSourceRecordIds, eligible.length);
      continue;
    }
    if (eligible.length === 1) {
      const candidate = eligible[0];
      provisionalMappings.push({
        profileId: profile.id,
        customerId: candidate.customer.id,
        storeId: candidate.customer.storeId,
        storeKey: candidate.customer.storeKey,
        pendingSourceRecordIds,
        evidence: candidate.evidence,
      });
      continue;
    }

    const withAnyMatch = evaluated.filter((candidate) => candidate.matches.size > 0);
    const blockedByOtherProfile = evaluated.some(
      (candidate) =>
        candidate.evidence.length > 0 &&
        candidate.customer.healthProfileId &&
        candidate.customer.healthProfileId !== profile.id,
    );
    const hasIdentityConflict = evaluated.some(
      (candidate) => candidate.evidence.length > 0 && candidate.conflicts.size > 0,
    );
    addReview(
      profile.id,
      blockedByOtherProfile
        ? "different_health_profile"
        : hasIdentityConflict
          ? "identity_conflict"
          : withAnyMatch.length > 0
            ? "insufficient_evidence"
            : "no_customer",
      pendingSourceRecordIds,
      withAnyMatch.length,
    );
  }

  const mappingsByCustomer = groupBy(
    provisionalMappings,
    (mapping) => mappingKey(mapping.storeId, mapping.customerId),
  );
  const mappings: SafeMatchMapping[] = [];
  for (const mapping of provisionalMappings) {
    const sameTarget = mappingsByCustomer.get(mappingKey(mapping.storeId, mapping.customerId)) ?? [];
    if (sameTarget.length > 1) {
      addReview(
        mapping.profileId,
        "source_identity_reused",
        mapping.pendingSourceRecordIds,
        sameTarget.length,
      );
    } else {
      mappings.push(mapping);
    }
  }

  const reviewCounts = reviews.reduce(
    (counts, review) => {
      const current = counts[review.reason];
      current.profiles += 1;
      current.records += review.pendingSourceRecordIds.length;
      return counts;
    },
    Object.fromEntries(
      [
        "existing_conflict",
        "source_identity_reused",
        "target_ambiguous",
        "identity_conflict",
        "different_health_profile",
        "insufficient_evidence",
        "missing_identity",
        "no_customer",
      ].map((reason) => [reason, { profiles: 0, records: 0 }]),
    ) as Record<SafeMatchReviewReason, { profiles: number; records: number }>,
  );
  const remainingRecords = input.records.filter((record) => !existingBySourceId.has(record.id)).length;
  const safeRecords = mappings.reduce(
    (total, mapping) => total + mapping.pendingSourceRecordIds.length,
    0,
  );
  const manualRecords = reviews.reduce(
    (total, review) => total + review.pendingSourceRecordIds.length,
    0,
  );

  return {
    mappings,
    reviews,
    digest: safeMatchPlanDigest(mappings),
    summary: {
      sourceProfiles: recordsByProfile.size,
      sourceRecords: input.records.length,
      alreadyImportedRecords: input.records.length - remainingRecords,
      remainingRecords,
      completeProfiles: completeProfiles.size,
      safeProfiles: mappings.length,
      safeRecords,
      manualProfiles: reviews.length,
      manualRecords,
      sourceRecordsMissingProfile: sourceRecordsMissingProfile.length,
      accountedForRemainingRecords: safeRecords + manualRecords,
      safeByEvidence: mappings.reduce<Record<string, number>>((counts, mapping) => {
        const key = mapping.evidence.join("+");
        counts[key] = (counts[key] ?? 0) + mapping.pendingSourceRecordIds.length;
        return counts;
      }, {}),
      reviewCounts,
    },
  };
}
