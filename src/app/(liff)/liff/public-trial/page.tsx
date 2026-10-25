import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { resolveBookingLineEntry, resolveBookingLineStore } from "@/server/services/booking-line-entry";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getIndustryModule } from "@/lib/industry-modules";
import { LiffShell } from "../liff-shell";
import { PublicTrialLiffBridge } from "./public-trial-liff-bridge";

export const dynamic = "force-dynamic";

export default async function PublicTrialLiffPage({ searchParams }: { searchParams: Promise<{ bookingStore?: string }> }) {
  const endpointSlug = await resolveStoreSlugForLiff();
  if (!endpointSlug) notFound();
  const query = await searchParams;
  const storeSlug = resolveBookingLineStore(endpointSlug, typeof query.bookingStore === "string" ? query.bookingStore : undefined);
  if (!storeSlug) notFound();

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();
  const config = resolveBookingLineEntry(storeSlug);
  if (!config) notFound();
  const industry = await getStoreIndustryModule(presentation.id);
  if (config.configured && config.storeId !== presentation.id) notFound();
  if (industry === "course") return <LiffShell
    storeSlug={presentation.slug} storeName={presentation.name} liffId={config.liffId}
    contactUrl={presentation.contactUrl} healthAssessmentEnabled={false}
    terminology={getIndustryModule("course").customer} memberDataSource="course" bookingIntent
  />;
  if (industry !== "beauty" && industry !== "steamfoot") notFound();

  return (
    <PublicTrialLiffBridge
      liffId={config.liffId}
      storeSlug={presentation.slug}
      storeName={presentation.name}
      contactUrl={presentation.contactUrl}
      bookingPath={industry === "beauty" ? `/beauty-trial/${presentation.slug}` : undefined}
    />
  );
}
