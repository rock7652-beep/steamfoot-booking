import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { authorizeMusicSourceImport } from "@/server/services/music-source-import";
import { assertMusicOpeningPreviewEnvironment } from "../../../../../../scripts/music-opening-preview-scope.mjs";
import { OpeningImportForm } from "./import-form";

export default async function OpeningImportPage() {
  try {
    if (process.env.VERCEL !== "1") notFound();
    assertMusicOpeningPreviewEnvironment(process.env);
  } catch { notFound(); }
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "wallet.create")) || !(await checkPermission(user.role, user.staffId, "booking.update"))) notFound();
  if (!(await checkPermission(user.role, user.staffId, "customer.read")) || !(await checkPermission(user.role, user.staffId, "customer.create"))) notFound();
  try { await authorizeMusicSourceImport(); } catch { notFound(); }
  return <PageShell className="w-full min-w-0"><PageHeader title="音教雲資料匯入" subtitle="來源預覽 → 核對 → 匯入與批次備份" actions={<DashboardLink href="/dashboard/courses">返回課表</DashboardLink>} /><DashboardLink href="/dashboard/courses/source-pilot" className="inline-flex min-h-11 items-center rounded border px-3 text-sm">十人樣本：堂數、付款與可操作排課</DashboardLink><OpeningImportForm /></PageShell>;
}
