import { notFound } from "next/navigation";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { getCurrentSpaDemoNotification, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { listSpaDemoDailyAdjustments, listSpaDemoDailyRefunds, listSpaDemoReconciledDates } from "@/server/queries/spa-demo-daily-reconciliation";
import { toLocalDateStr } from "@/lib/date-utils";
import { SpaManagerSchedulePreview } from "../_components/spa-manager-schedule-preview";

/**
 * Draft Preview only. All reads and writes are pinned to the isolated Demo
 * tenant and the route is unavailable in Production.
 */
export default async function SpaManagerPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const [preview, reconciledDates, adjustments, refunds] = await Promise.all([
    getSpaDemoPreviewData(),
    listSpaDemoReconciledDates(),
    listSpaDemoDailyAdjustments(),
    listSpaDemoDailyRefunds(),
  ]);
  const previewDate = toLocalDateStr();
  const previewNow = new Date().toISOString();
  return (
    <SpaManagerSchedulePreview
      initialProviders={preview.providers}
      initialBookings={preview.bookings}
      previewDate={previewDate}
      previewNow={previewNow}
      initialNotification={getCurrentSpaDemoNotification(preview.notification, preview.bookings, previewDate)}
      initialReconciledDates={reconciledDates}
      initialAdjustments={adjustments}
      initialRefunds={refunds}
      adminBasePath={`/s/${SPA_DEMO_STORE.slug}/admin/dashboard`}
    />
  );
}
