import { notFound } from "next/navigation";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { toLocalDateStr } from "@/lib/date-utils";
import { SpaManagerSchedulePreview } from "../_components/spa-manager-schedule-preview";

/**
 * Draft Preview only. It contains fictional in-memory data and is unavailable
 * in Production. No staff session, customer record, or database is read.
 */
export default async function SpaManagerPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const preview = await getSpaDemoPreviewData();
  return (
    <SpaManagerSchedulePreview
      initialProviders={preview.providers}
      initialBookings={preview.bookings}
      previewDate={toLocalDateStr()}
      initialNotification={preview.notification}
    />
  );
}
