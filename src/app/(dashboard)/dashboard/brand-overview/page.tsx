import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { BrandOverviewContent } from "@/components/hq-brand-overview";

// Retain existing bookmarks while HQ's unselected-store home uses this same view.
export default async function BrandOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/hq/login");
  if (getEffectiveActorRole(user) !== "ADMIN" || !(await checkPermission(user.role, user.staffId, "report.read"))) notFound();
  return <BrandOverviewContent />;
}
