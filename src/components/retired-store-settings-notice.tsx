import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";

/** Shared by the authorized HQ page and its synthetic read-only UI preview. */
export function RetiredStoreSettingsNotice({ storeId }: { storeId: string }) {
  return <PageShell>
    <PageHeader title="此模組已停用" subtitle="SPA 歷史設定已封存，無法修改功能授權或啟用服務。" />
    <Link href={`/hq/dashboard/stores/${storeId}`} className="inline-flex min-h-11 items-center text-primary-700 underline">返回店舖詳情</Link>
    <Link href="/hq/dashboard/operation-audits?module=SPA" className="inline-flex min-h-11 items-center text-primary-700 underline">查看 SPA 歷史操作紀錄</Link>
  </PageShell>;
}
