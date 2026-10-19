import { notFound } from "next/navigation";
import { sportsStagingEnabled } from "@/lib/sports-staging";
import { requireSession } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { loadSportsStaging } from "@/server/actions/sports-staging";
import { SportsStagingWorkspace } from "@/components/admin/sports-staging-workspace";
export default async function SportsStagingPage() {
  if (!sportsStagingEnabled()) notFound();
  const user = await requireSession();
  if (!(await checkPermission(user.role, user.staffId, "booking.read")))
    return <p>無權限</p>;
  const result = await loadSportsStaging();
  if (!result.success) return <p role="alert">{result.error}</p>;
  return <SportsStagingWorkspace initial={result.data} />;
}
