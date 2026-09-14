import { notFound } from "next/navigation";
import {
  resolveCentralMemberLiffId,
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { toLocalDateStr } from "@/lib/date-utils";
import { StaffWorkScreen } from "./staff-work-screen";

export const dynamic = "force-dynamic";

export default async function LiffStaffWorkPage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) notFound();
  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();
  const liffId = await resolveCentralMemberLiffId(storeSlug);
  if (!liffId) notFound();
  return <StaffWorkScreen storeName={presentation.name} storeSlug={presentation.slug} liffId={liffId} today={toLocalDateStr()} />;
}
