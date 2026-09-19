import { notFound } from "next/navigation";
import {
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { resolvePublicTrialLiffConfig } from "@/lib/liff/public-trial-config";
import { PublicTrialLiffBridge } from "./public-trial-liff-bridge";
import { getLineBotInfo } from "@/lib/line";

export const dynamic = "force-dynamic";

export default async function PublicTrialLiffPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) notFound();

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();
  const config = resolvePublicTrialLiffConfig(storeSlug);
  if (!config) notFound();
  const bot = await getLineBotInfo(presentation.id).catch(() => null);
  const chatBookingUrl = bot?.ok
    ? `https://line.me/R/oaMessage/${encodeURIComponent(bot.data.basicId)}/?${encodeURIComponent("開始體驗預約")}`
    : null;

  return (
    <PublicTrialLiffBridge
      liffId={config.liffId}
      storeSlug={presentation.slug}
      storeName={presentation.name}
      contactUrl={presentation.contactUrl}
      chatBookingUrl={chatBookingUrl}
    />
  );
}
