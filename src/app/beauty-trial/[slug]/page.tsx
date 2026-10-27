import { PublicTrialPage } from "@/components/public-trial/public-trial-page";
import { serviceDuration } from "@/lib/beauty/service-duration";
import "@/app/(customer)/book/course-portal.css";
import { BeautyBookingForm } from "@/components/beauty/booking-form";
import { publicBeautyCatalog } from "@/server/beauty/queries";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
import { resolveStorePresentation } from "@/lib/store-resolver";
import { resolveBookingLineEntry } from "@/server/services/booking-line-entry";
import { resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  if (process.env.BEAUTY_MODULE_ENABLED !== "1") return <BeautyClosedNotice />;
  const { slug } = await params,
    q = await searchParams,
    [data, presentation] = await Promise.all([publicBeautyCatalog(slug), resolveStorePresentation(slug)]);
  const lineEntry = resolveBookingLineEntry(slug);
  const identity = typeof q.entry === "string" && q.entry.length <= 512 ? await resolveTrialBookingChatLink(q.entry) : null;
  const verified = identity?.storeId === data.store.id && identity.channel === "LINE";
  const trialServices = data.services.filter(service => service.trialPrice !== null);
  const durations = trialServices.map(service => serviceDuration(service, true));
  const durationLabel = durations.length
    ? `${Math.min(...durations)}${Math.min(...durations) !== Math.max(...durations) ? `–${Math.max(...durations)}` : ""} 分鐘`
    : undefined;
  return (
    <PublicTrialPage mode="beauty" storeName={data.store.name}
      prices={trialServices.map(service => Number(service.trialPrice))}
      durationLabel={durationLabel}
      address={presentation?.address} mapUrl={presentation?.mapUrl} contactUrl={presentation?.contactUrl}>
      <BeautyBookingForm
        catalog={data}
        mode="public"
        slug={slug}
        entry={q.entry}
        publicInfo={{ ...(presentation ? {address:presentation.address,mapUrl:presentation.mapUrl,contactUrl:presentation.contactUrl} : {}), massageReminder: slug === "soulife", lineEntryHref: lineEntry?.url, lineIdentityVerified: verified }}
      />
    </PublicTrialPage>
  );
}
