export type SpaQuickAlternative = {
  providerId: string;
  providerName: string;
  time: string;
};

export function buildSpaQuickAlternatives(input: {
  requestedProviderId: string;
  requestedTime: string;
  providers: readonly {
    id: string;
    displayName: string;
    startTimes: readonly string[];
  }[];
  limit?: number;
}): SpaQuickAlternative[] {
  const { requestedProviderId, requestedTime, providers, limit = 3 } = input;
  const candidates: SpaQuickAlternative[] = [];

  for (const provider of providers) {
    if (provider.id !== requestedProviderId && provider.startTimes.includes(requestedTime)) {
      candidates.push({
        providerId: provider.id,
        providerName: provider.displayName,
        time: requestedTime,
      });
    }
  }

  const requestedProvider = providers.find((provider) => provider.id === requestedProviderId);
  for (const time of requestedProvider?.startTimes.filter((time) => time > requestedTime).slice(0, 2) ?? []) {
    candidates.push({
      providerId: requestedProvider!.id,
      providerName: requestedProvider!.displayName,
      time,
    });
  }

  for (const provider of providers) {
    for (const time of provider.startTimes.filter((time) => time > requestedTime).slice(0, 2)) {
      candidates.push({
        providerId: provider.id,
        providerName: provider.displayName,
        time,
      });
    }
  }

  return candidates
    .filter((candidate, index, list) =>
      list.findIndex(
        (item) => item.providerId === candidate.providerId && item.time === candidate.time,
      ) === index,
    )
    .slice(0, limit);
}
