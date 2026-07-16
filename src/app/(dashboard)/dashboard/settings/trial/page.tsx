import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getTrialSettings } from "@/lib/shop-config";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { TrialSettingsForm } from "./trial-form";
import { getActiveStoreForRead } from "@/lib/store";

export default async function TrialSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "trial.manage"))) {
    redirect("/dashboard");
  }

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) {
    return (
      <PageShell>
        <PageHeader title="體驗課設定" subtitle="請先從右上角切換到特定店舖" />
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
          <p className="text-sm text-earth-500">請先切換到特定店舖，才能查看或儲存體驗課設定。</p>
        </div>
      </PageShell>
    );
  }

  const trial = await getTrialSettings(storeId);

  return (
    <PageShell>
      <PageHeader
        title="體驗課設定"
        subtitle="體驗客流程使用的預設體驗價格與可調整範圍。體驗課只有一個，建立體驗單時可依活動調整金額；調整預設價不影響已建立的體驗單。"
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      <TrialSettingsForm key={storeId} storeId={storeId} initial={trial} />
    </PageShell>
  );
}
