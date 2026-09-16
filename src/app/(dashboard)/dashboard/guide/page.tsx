import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ALL_PERMISSIONS, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { isOperationGuidePreview } from "@/lib/operation-guide-preview";
import { OperationGuideContent } from "@/components/operation-guide-content";
import { PageShell, PageHeader } from "@/components/desktop";

export default async function OperationGuidePage() {
  const user = await getCurrentUser();
  if (!user || user.role === "CUSTOMER" || !(await Promise.all(ALL_PERMISSIONS.map(permission => checkPermission(user.role, user.staffId, permission)))).some(Boolean)) redirect("/dashboard");
  if (!isOperationGuidePreview()) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  const industryModule = await getStoreIndustryModule(storeId);
  if (industryModule !== "steamfoot" && industryModule !== "spa") notFound();
  return <PageShell>
    <PageHeader title="操作指南" subtitle="從遇到的事情，找到操作步驟。" />
    <div className="w-full min-w-0 rounded-2xl border border-gold-200 bg-earth-50 p-5 sm:p-8">
      <OperationGuideContent full pathname="/dashboard/guide" />
    </div>
  </PageShell>;
}
