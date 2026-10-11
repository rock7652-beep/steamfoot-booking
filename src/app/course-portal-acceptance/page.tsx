import { notFound } from "next/navigation";
import { CUSTOMER_COURSE_PORTAL_PREVIEW_BRANCH, assertReviewedReleaseEnvironment } from "../../../scripts/consultation-preview-scope.mjs";
import { CoursePortalAcceptanceFrame } from "./preview-frame";

export const dynamic = "force-dynamic";

/** Preview-only measurement wrapper. The existing iframe route authorizes every read. */
export default async function CoursePortalAcceptancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== CUSTOMER_COURSE_PORTAL_PREVIEW_BRANCH) notFound();
  assertReviewedReleaseEnvironment(process.env);
  const p = await searchParams;
  if (!p.storeId || !p.personId || (p.role !== "member" && p.role !== "work")) notFound();
  const { authorizeFrontendPreview } = await import("@/server/services/frontend-preview");
  const access = await authorizeFrontendPreview({ storeId: p.storeId, personId: p.personId, role: p.role });
  const query = new URLSearchParams({ storeId: access.storeId, personId: access.personId, role: p.role });
  for (const key of ["month", "date", "view"] as const) if (p[key]) query.set(key, p[key]);
  return <CoursePortalAcceptanceFrame src={`/frontend-preview?${query}`} />;
}
