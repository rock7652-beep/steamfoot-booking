import { notFound } from "next/navigation";
import { SpaStaffSchedulePreview } from "@/app/(liff)/liff/_components/spa-staff-schedule-preview";
import { toLocalDateStr } from "@/lib/date-utils";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SPA_DEMO_LIVE_FLOW_BOOKING_ID, SPA_DEMO_PROVIDERS, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";

/** Draft Preview only. Production keeps the authenticated staff workspace. */
export default async function SpaStaffPreviewPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const preview = await getSpaDemoPreviewData();
  const previewDate = toLocalDateStr();
  const { staff: requestedStaffId } = await searchParams;
  const liveBooking = preview.bookings.find((booking) => booking.id === SPA_DEMO_LIVE_FLOW_BOOKING_ID);
  const provider = preview.providers.find((item) => item.id === requestedStaffId || item.badge === requestedStaffId)
    ?? preview.providers.find((item) => item.id === liveBooking?.providerId)
    ?? preview.providers.find((item) => item.id === SPA_DEMO_PROVIDERS[0].id);
  if (!provider) notFound();

  return (
    <main className="spa-preview-page min-h-screen bg-earth-50 px-4 py-6">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <div className="mx-auto max-w-2xl space-y-4">
        <SpaStaffSchedulePreview provider={provider} allBookings={preview.bookings} today={previewDate} />
      </div>
    </main>
  );
}
