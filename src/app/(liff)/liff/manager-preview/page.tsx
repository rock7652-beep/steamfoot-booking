import { notFound } from "next/navigation";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SpaManagerSchedulePreview } from "../_components/spa-manager-schedule-preview";

/**
 * Draft Preview only. It contains fictional in-memory data and is unavailable
 * in Production. No staff session, customer record, or database is read.
 */
export default async function SpaManagerPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== "demo") notFound();

  return <SpaManagerSchedulePreview />;
}
