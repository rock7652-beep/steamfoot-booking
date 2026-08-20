import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { resolvePublicTrialLiffConfig } from "@/lib/liff/public-trial-config";
import { PublicTrialLiffBridge } from "./public-trial-liff-bridge";

export const dynamic = "force-dynamic";

export default async function PublicTrialLiffPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) notFound();

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();
  const config = resolvePublicTrialLiffConfig(storeSlug);
  if (!config) notFound();

  return (
    <PublicTrialLiffBridge
      liffId={config.liffId}
      storeSlug={presentation.slug}
      storeName={presentation.name}
      contactUrl={presentation.contactUrl}
    />
  );
}
