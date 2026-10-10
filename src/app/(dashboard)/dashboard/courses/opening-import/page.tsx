import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { authorizeMusicOpeningImport } from "@/server/services/music-opening-import";
import { assertMusicOpeningPreviewEnvironment } from "../../../../../../scripts/music-opening-preview-scope.mjs";
import { OpeningImportForm } from "./import-form";

export default async function OpeningImportPage() {
  try {
    if (process.env.VERCEL !== "1") notFound();
    assertMusicOpeningPreviewEnvironment(process.env);
  } catch { notFound(); }
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "wallet.create")) || !(await checkPermission(user.role, user.staffId, "booking.update"))) notFound();
  try { await authorizeMusicOpeningImport(); } catch { notFound(); }
  return <PageShell className="w-full min-w-0"><PageHeader title="期初資料補登" subtitle="陸比音樂預覽資料核對" actions={<DashboardLink href="/dashboard/courses">返回課表</DashboardLink>} /><OpeningImportForm /></PageShell>;
}
