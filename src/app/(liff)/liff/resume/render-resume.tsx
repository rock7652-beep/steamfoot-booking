import { notFound } from "next/navigation";
import { resolveCentralMemberLiffId, resolveStoreBySlug, resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { customerResumePath } from "@/lib/customer-resume-path";
import { LiffResumeEntry } from "./resume-entry";

export type ResumeQuery = { store?: string | string[]; next?: string | string[] };

export async function renderLiffResume(query: ResumeQuery, primary: boolean) {
  const endpointSlug = await resolveStoreSlugForLiff();
  const slug = query.store;
  if (!endpointSlug || typeof slug !== "string") notFound();
  const target = customerResumePath(query.next, slug, "line") ?? customerResumePath(query.next, slug, "web");
  if (!target) notFound();

  const store = await resolveStoreBySlug(slug);
  if (!store) notFound();
  const endpointId = await resolveCentralMemberLiffId(endpointSlug);
  if (!endpointId || endpointId !== await resolveCentralMemberLiffId(store.slug)) notFound();

  return <LiffResumeEntry liffId={endpointId} storeSlug={store.slug} target={target} primary={primary} />;
}
