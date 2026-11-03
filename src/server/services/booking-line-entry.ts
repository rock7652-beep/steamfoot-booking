import "server-only";
import { getConfiguredStoreLine } from "@/lib/store-line-config";
import { resolvePublicTrialLiffConfig } from "@/lib/liff/public-trial-config";

/** Only public identifiers leave this boundary; never return credential names. */
export function resolveBookingLineEntry(slug: string) {
  const configured = getConfiguredStoreLine(slug);
  if (configured) return {
    liffId: configured.liffId, lineLoginChannelId: configured.loginChannelId,
    storeId: configured.storeId, configured: true as const,
    // LIFF appends this path to the existing, store-scoped /liff endpoint.
    url: `https://liff.line.me/${configured.liffId}/public-trial?bookingStore=${encodeURIComponent(slug)}`,
  };
  const legacy = resolvePublicTrialLiffConfig(slug);
  return legacy ? { ...legacy, storeId: null, configured: false as const,
    url: `https://liff.line.me/${legacy.liffId}` } : null;
}

/** A shared LIFF may select another store only inside its explicitly declared
 * physical account. Cookies and arbitrary return URLs are never evidence. */
export function resolveBookingLineStore(endpointSlug: string, selectedSlug?: string) {
  if (!selectedSlug || selectedSlug === endpointSlug) return endpointSlug;
  const endpoint = getConfiguredStoreLine(endpointSlug), selected = getConfiguredStoreLine(selectedSlug);
  if (!endpoint || !selected || !endpoint.sharedAccountKey ||
      endpoint.sharedAccountKey !== selected.sharedAccountKey || endpoint.liffId !== selected.liffId) return null;
  return selected.slug;
}
