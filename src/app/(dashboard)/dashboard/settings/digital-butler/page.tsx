import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";
import { DigitalButlerService } from "@/server/services/digital-butler";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { DigitalButlerFlowEditor } from "./flow-editor";

export default async function DigitalButlerSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireDigitalButlerEntitlement(storeId).catch(() => notFound());
  const flows = await new DigitalButlerService().listFlows(storeId);

  return (
    <PageShell>
      <PageHeader
        title="數位管家"
        subtitle="建立 LINE 自動互動流程；草稿不會影響已發布版本"
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600"
          >
            ← 返回設定
          </Link>
        }
      />
      <DigitalButlerFlowEditor flows={flows} />
    </PageShell>
  );
}
