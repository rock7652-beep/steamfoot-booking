import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { ZHUBEI_PUBLIC_TRIAL_LIFF_ID } from "@/lib/liff/public-trial-config";
import { PublicTrialLiffBridge } from "./public-trial-liff-bridge";

export const dynamic = "force-dynamic";

export default async function PublicTrialLiffPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== "zhubei") notFound();

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();

  return (
    <PublicTrialLiffBridge
      liffId={ZHUBEI_PUBLIC_TRIAL_LIFF_ID}
      storeSlug={presentation.slug}
      storeName={presentation.name}
      contactUrl={presentation.contactUrl}
    />
  );
}
