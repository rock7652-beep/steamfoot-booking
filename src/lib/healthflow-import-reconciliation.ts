export type HealthflowImportCustomer = {
  id: string;
  healthProfileId: string | null;
  phone: string | null;
  name?: string | null;
  email?: string | null;
  birthDate?: Date | string | null;
  storeKey?: string | null;
};

export type HealthflowImportProfile = {
  id: string;
  phone: string | null;
  phoneNormalized: string | null;
  fullName?: string | null;
  email?: string | null;
  birthDate?: Date | string | null;
  storeKey?: string | null;
};

export type HealthflowImportRecord = {
  userId: string;
};

export function normalizeTaiwanPhone(value: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("886")) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith("9")) digits = `0${digits}`;
  return /^09\d{8}$/.test(digits) ? digits : null;
}

export function normalizePersonName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·・.,，。．\-_'’]/g, "");
  return normalized || null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeBirthDate(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function reconcileHealthflowImport<TCustomer extends HealthflowImportCustomer>(
  customers: TCustomer[],
  profiles: HealthflowImportProfile[],
  records: HealthflowImportRecord[],
) {
  const customersByProfile = groupBy(
    customers.filter((customer) => customer.healthProfileId),
    (customer) => customer.healthProfileId!,
  );
  const confirmedProfileToCustomer = new Map<string, TCustomer>();
  for (const [profileId, matches] of customersByProfile) {
    if (matches.length === 1) confirmedProfileToCustomer.set(profileId, matches[0]);
  }

  const sourceProfileIds = new Set(records.map((record) => record.userId));
  const availableProfileIds = new Set(profiles.map((profile) => profile.id));
  const missingSourceProfileIds = new Set(
    [...sourceProfileIds].filter((profileId) => !availableProfileIds.has(profileId)),
  );
  const unmatchedProfiles = profiles.filter(
    (profile) =>
      sourceProfileIds.has(profile.id) && !confirmedProfileToCustomer.has(profile.id),
  );
  const eligibleCustomers = customers.filter((customer) => !customer.healthProfileId);
  const customersByPhone = groupByPhone(eligibleCustomers, (customer) => customer.phone);
  const profilesByPhone = groupByPhone(
    unmatchedProfiles,
    (profile) => profile.phoneNormalized ?? profile.phone,
  );

  const phoneReviewProfileIds = new Set<string>();
  const highConfidenceReviewProfileIds = new Set<string>();
  const secondaryReviewProfileIds = new Set<string>();
  const ambiguousProfileIds = new Set<string>();
  const storeConflictProfileIds = new Set<string>();
  const noCandidateProfileIds = new Set<string>();

  const secondaryCustomers = groupBy(
    eligibleCustomers.filter((customer) => secondaryKeyForCustomer(customer)),
    (customer) => secondaryKeyForCustomer(customer)!,
  );
  const secondaryProfiles = groupBy(
    unmatchedProfiles.filter((profile) => secondaryKeyForProfile(profile)),
    (profile) => secondaryKeyForProfile(profile)!,
  );

  for (const profile of unmatchedProfiles) {
    const phone = normalizeTaiwanPhone(profile.phoneNormalized ?? profile.phone);
    const customerMatches = phone ? customersByPhone.get(phone) ?? [] : [];
    const profileMatches = phone ? profilesByPhone.get(phone) ?? [] : [];

    if (customerMatches.length > 0) {
      if (customerMatches.length !== 1 || profileMatches.length !== 1) {
        ambiguousProfileIds.add(profile.id);
        continue;
      }

      const customer = customerMatches[0];
      if (
        profile.storeKey &&
        customer.storeKey &&
        profile.storeKey !== customer.storeKey
      ) {
        storeConflictProfileIds.add(profile.id);
        continue;
      }

      if (hasSupportingIdentitySignal(customer, profile)) {
        highConfidenceReviewProfileIds.add(profile.id);
      } else {
        phoneReviewProfileIds.add(profile.id);
      }
      continue;
    }

    const secondaryKey = secondaryKeyForProfile(profile);
    if (secondaryKey) {
      const secondaryCustomerMatches = secondaryCustomers.get(secondaryKey) ?? [];
      const secondaryProfileMatches = secondaryProfiles.get(secondaryKey) ?? [];
      if (
        secondaryCustomerMatches.length === 1 &&
        secondaryProfileMatches.length === 1
      ) {
        secondaryReviewProfileIds.add(profile.id);
        continue;
      }
      if (secondaryCustomerMatches.length > 0) {
        ambiguousProfileIds.add(profile.id);
        continue;
      }
    }

    noCandidateProfileIds.add(profile.id);
  }

  const countRecords = (profileIds: Set<string>) =>
    records.reduce(
      (total, record) => total + (profileIds.has(record.userId) ? 1 : 0),
      0,
    );
  const confirmedProfileIds = new Set(
    [...confirmedProfileToCustomer.keys()].filter((profileId) =>
      sourceProfileIds.has(profileId),
    ),
  );

  return {
    confirmedProfileToCustomer,
    summary: {
      sourceProfiles: sourceProfileIds.size,
      sourceRecords: records.length,
      confirmedProfiles: confirmedProfileIds.size,
      confirmedRecords: countRecords(confirmedProfileIds),
      highConfidenceReviewProfiles: highConfidenceReviewProfileIds.size,
      highConfidenceReviewRecords: countRecords(highConfidenceReviewProfileIds),
      phoneReviewProfiles: phoneReviewProfileIds.size,
      phoneReviewRecords: countRecords(phoneReviewProfileIds),
      secondaryReviewProfiles: secondaryReviewProfileIds.size,
      secondaryReviewRecords: countRecords(secondaryReviewProfileIds),
      ambiguousProfiles: ambiguousProfileIds.size,
      ambiguousRecords: countRecords(ambiguousProfileIds),
      storeConflictProfiles: storeConflictProfileIds.size,
      storeConflictRecords: countRecords(storeConflictProfileIds),
      noCandidateProfiles: noCandidateProfileIds.size,
      noCandidateRecords: countRecords(noCandidateProfileIds),
      missingSourceProfiles: missingSourceProfileIds.size,
      missingSourceRecords: countRecords(missingSourceProfileIds),
      duplicateConfirmedProfileIds: [...customersByProfile.values()].filter(
        (matches) => matches.length > 1,
      ).length,
    },
  };
}

function hasSupportingIdentitySignal(
  customer: HealthflowImportCustomer,
  profile: HealthflowImportProfile,
) {
  const customerName = normalizePersonName(customer.name);
  const profileName = normalizePersonName(profile.fullName);
  const customerEmail = normalizeEmail(customer.email);
  const profileEmail = normalizeEmail(profile.email);
  const customerBirthDate = normalizeBirthDate(customer.birthDate);
  const profileBirthDate = normalizeBirthDate(profile.birthDate);

  return Boolean(
    (customerName && profileName && customerName === profileName) ||
      (customerEmail && profileEmail && customerEmail === profileEmail) ||
      (customerBirthDate &&
        profileBirthDate &&
        customerBirthDate === profileBirthDate),
  );
}

function secondaryKeyForCustomer(customer: HealthflowImportCustomer) {
  const name = normalizePersonName(customer.name);
  const birthDate = normalizeBirthDate(customer.birthDate);
  return name && birthDate && customer.storeKey
    ? `${name}|${birthDate}|${customer.storeKey}`
    : null;
}

function secondaryKeyForProfile(profile: HealthflowImportProfile) {
  const name = normalizePersonName(profile.fullName);
  const birthDate = normalizeBirthDate(profile.birthDate);
  return name && birthDate && profile.storeKey
    ? `${name}|${birthDate}|${profile.storeKey}`
    : null;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function groupByPhone<T>(items: T[], phoneFor: (item: T) => string | null) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const phone = normalizeTaiwanPhone(phoneFor(item));
    if (phone) grouped.set(phone, [...(grouped.get(phone) ?? []), item]);
  }
  return grouped;
}
