import { PublicTrialPage } from "@/components/public-trial/public-trial-page";
import { SportsPublicTrialForm } from "@/components/sports-public-trial-form";
import { readSportsPublicTrial } from "@/server/services/sports-public-trial";
import { resolveBookingLineEntry } from "@/server/services/booking-line-entry";
import { resolveStorePresentation } from "@/lib/store-resolver";
import "@/app/(customer)/book/course-portal.css";

export const dynamic = "force-dynamic";

export default async function SportsTrialPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ entry?: string }>;
}) {
  const { slug } = await params, query = await searchParams;
  const [{ store, slots }, presentation] = await Promise.all([readSportsPublicTrial(slug), resolveStorePresentation(slug)]);
  const durations = slots.map(slot => Math.round((+new Date(slot.endsAt) - +new Date(slot.startsAt)) / 60000));
  return <PublicTrialPage mode="sports" storeName={store.name} prices={slots.map(slot => slot.price)}
    durationLabel={durations.length ? `${Math.min(...durations)}${Math.min(...durations) !== Math.max(...durations) ? `–${Math.max(...durations)}` : ""} 分鐘` : undefined}
    address={presentation?.address} mapUrl={presentation?.mapUrl} contactUrl={presentation?.contactUrl}>
      <SportsPublicTrialForm slug={slug} slots={slots} entry={typeof query.entry === "string" && query.entry.length <= 512 ? query.entry : undefined}
        lineEntryHref={resolveBookingLineEntry(slug)?.url} contactUrl={presentation?.contactUrl} address={presentation?.address} mapUrl={presentation?.mapUrl} />
  </PublicTrialPage>;
}
