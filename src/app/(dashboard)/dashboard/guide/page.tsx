import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { isOperationGuidePreview } from "@/lib/operation-guide-preview";
import { OperationGuideContent } from "@/components/operation-guide-content";
import { PageShell, PageHeader } from "@/components/desktop";

export default async function OperationGuidePage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) redirect("/dashboard");
  if (!isOperationGuidePreview()) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || await getStoreIndustryModule(storeId) !== "steamfoot") notFound();
  return <PageShell>
    <PageHeader title="操作指南" subtitle="從遇到的事情，找到操作步驟。" />
    <div className="mx-auto max-w-3xl rounded-2xl border border-gold-200 bg-earth-50 p-5 sm:p-8">
      <OperationGuideContent full />
    </div>
  </PageShell>;
}
