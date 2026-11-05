import { LiffSignedOutView } from "./signed-out-view";
import { notFound } from "next/navigation";
import { resolveStorePresentation, resolveStoreSlugForLiff } from "@/lib/store-resolver";

export const dynamic = "force-dynamic";

/** Deliberately has no LIFF SDK/session exchange: logout must not immediately
 * recreate the member session. Login is an explicit user action. */
export default async function LiffSignedOutPage() {
  const slug = await resolveStoreSlugForLiff();
  const store = slug ? await resolveStorePresentation(slug) : null;
  if (!store) notFound();
  return <LiffSignedOutView storeSlug={store.slug} contactUrl={store.contactUrl} />;
}

