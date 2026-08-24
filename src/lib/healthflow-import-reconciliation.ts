export type HealthflowImportCustomer = {
  id: string;
  healthProfileId: string | null;
  phone: string | null;
};

export type HealthflowImportProfile = {
  id: string;
  phone: string | null;
  phoneNormalized: string | null;
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
  const ambiguousProfileIds = new Set<string>();
  const noCandidateProfileIds = new Set<string>();
  for (const profile of unmatchedProfiles) {
    const phone = normalizeTaiwanPhone(profile.phoneNormalized ?? profile.phone);
    if (!phone || !customersByPhone.has(phone)) {
      noCandidateProfileIds.add(profile.id);
      continue;
    }
    const customerMatches = customersByPhone.get(phone)!;
    const profileMatches = profilesByPhone.get(phone)!;
    if (customerMatches.length === 1 && profileMatches.length === 1) {
      phoneReviewProfileIds.add(profile.id);
    } else {
      ambiguousProfileIds.add(profile.id);
    }
  }

  const countRecords = (profileIds: Set<string>) =>
    records.reduce(
      (total, record) => total + (profileIds.has(record.userId) ? 1 : 0),
      0,
    );
  const confirmedProfileIds = new Set(confirmedProfileToCustomer.keys());

  return {
    confirmedProfileToCustomer,
    summary: {
      sourceProfiles: sourceProfileIds.size,
      sourceRecords: records.length,
      confirmedProfiles: confirmedProfileIds.size,
      confirmedRecords: countRecords(confirmedProfileIds),
      phoneReviewProfiles: phoneReviewProfileIds.size,
      phoneReviewRecords: countRecords(phoneReviewProfileIds),
      ambiguousProfiles: ambiguousProfileIds.size,
      ambiguousRecords: countRecords(ambiguousProfileIds),
      noCandidateProfiles: noCandidateProfileIds.size,
      noCandidateRecords: countRecords(noCandidateProfileIds),
      duplicateConfirmedProfileIds: [...customersByProfile.values()].filter(
        (matches) => matches.length > 1,
      ).length,
    },
  };
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
