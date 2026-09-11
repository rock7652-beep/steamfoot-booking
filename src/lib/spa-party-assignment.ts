import type { SpaBookableProvider } from "@/lib/spa-provider-availability";
import { isSpaProviderAvailable } from "@/lib/spa-provider-availability";
import { canProviderPerformServices, summarizeSpaServices, type SpaServiceItem } from "@/lib/spa-scheduling";

export type SpaPartyServiceRequest = {
  items: readonly SpaServiceItem[];
  providerId?: string;
};

export function findSpaPartyProviderAssignment({
  requests,
  providers,
  date,
  time,
  bufferMinutes = 30,
}: {
  requests: readonly SpaPartyServiceRequest[];
  providers: readonly SpaBookableProvider[];
  date: string;
  time: string;
  bufferMinutes?: number;
}): readonly SpaBookableProvider[] {
  const candidates = requests.map((request) => {
    const durationMinutes = summarizeSpaServices(request.items).durationMinutes;
    if (!request.items.length) return [];
    return providers.filter((provider) =>
      (!request.providerId || provider.id === request.providerId)
      && canProviderPerformServices(provider.specialties, request.items)
      && isSpaProviderAvailable({
        provider,
        date,
        startTime: time,
        serviceMinutes: durationMinutes,
        bufferMinutes,
      }));
  });
  if (candidates.some((options) => !options.length)) return [];

  const assignment: Array<SpaBookableProvider | undefined> = Array.from({ length: requests.length });
  const used = new Set<string>();
  const visit = (requestIndex: number): boolean => {
    if (requestIndex === requests.length) return true;
    for (const provider of candidates[requestIndex]) {
      if (used.has(provider.id)) continue;
      assignment[requestIndex] = provider;
      used.add(provider.id);
      if (visit(requestIndex + 1)) return true;
      used.delete(provider.id);
      assignment[requestIndex] = undefined;
    }
    return false;
  };
  return visit(0)
    ? assignment.filter((provider): provider is SpaBookableProvider => Boolean(provider))
    : [];
}
