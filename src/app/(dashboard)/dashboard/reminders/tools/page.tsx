import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  listMessageTemplates,
  getLineSmokeTestContext,
} from "@/server/queries/reminder";
import { isLineSmokeTestEnabled } from "@/lib/line-config";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { LineSmokeTestCard } from "../line-smoke-test-card";
import { CreateTemplateForm } from "../create-template-form";
export default async function ReminderTools() {
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "business_hours.manage"))
  )
    redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || !(await hasStoreFeature(storeId, FEATURES.LINE_REMINDER)))
    redirect("/dashboard/reminders");
  const [templates, context] = await Promise.all([
    listMessageTemplates(storeId),
    isLineSmokeTestEnabled()
      ? getLineSmokeTestContext(storeId)
      : Promise.resolve(null),
  ]);
  return (
    <PageShell>
      <PageHeader
        title="通知進階工具"
        actions={<Link href="/dashboard/reminders">← 返回提醒管理</Link>}
      />
      {context && (
        <LineSmokeTestCard
          storeName={context.storeName}
          customers={context.customers}
        />
      )}
      <details className="rounded-xl border border-earth-200 bg-white p-4">
        <summary className="cursor-pointer font-medium">
          舊版文字模板（{templates.length}）
        </summary>
        <p className="my-3 text-xs text-earth-500">
          僅供維護既有規則，未綁定規則的模板不會自動發送。
        </p>
        <CreateTemplateForm />
        {templates.map((t) => (
          <div key={t.id} className="mt-3 rounded-lg bg-earth-50 p-3 text-sm">
            {t.name} · 綁定 {t._count.rules} 項規則
          </div>
        ))}
      </details>
    </PageShell>
  );
}
