import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { SpaMemberStaffMobilePreview } from "./mobile-preview";

export const dynamic = "force-dynamic";

/** Design review only. Real member/staff data is never loaded by this route. */
export default async function SpaServiceFlowPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) notFound();
  const store = await resolveStorePresentation(storeSlug);
  if (!store) notFound();

  return (
    <SpaMemberStaffMobilePreview
      storeName={store.name}
      mapUrl={store.mapUrl}
    />
  );
}
