import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import {
  CENTRAL_LINE_STATUS_LABEL,
  getCentralLineRecipientAudit,
} from "@/server/queries/central-line-recipient";

export default async function CentralLineRecipientsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();
  const audit = await getCentralLineRecipientAudit();

  return (
    <PageShell>
      <PageHeader
        title="中央 LINE 收件人盤點"
        subtitle="唯讀檢查蒸管家 LINE Login、跨店身份與舊分店綁定是否一致。"
        actions={<Link href="/dashboard/central-user-merges" className="text-sm text-primary-700">← 中央會員整合</Link>}
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        此頁不會修改顧客或發送訊息。只有中央會員底下唯一的 LINE Account 才能成為收件人；手機、姓名與舊分店欄位都不會被拿來猜測。
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="有效顧客" value={audit.total} tone="earth" />
        <SummaryCard label="已對齊中央 LINE" value={audit.ready} tone="green" />
        <SummaryCard label="待處理／已阻擋" value={audit.blocked} tone={audit.blocked ? "red" : "green"} />
      </div>

      <section className="rounded-lg border border-earth-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-earth-900">狀態摘要</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(audit.statusCounts).map(([status, count]) => (
            <div key={status} className="rounded-md border border-earth-100 p-3 text-xs text-earth-700">
              <p>{CENTRAL_LINE_STATUS_LABEL[status as keyof typeof CENTRAL_LINE_STATUS_LABEL]}</p>
              <p className="mt-1 text-lg font-semibold text-earth-900">{count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-earth-900">待人工處理（最多顯示 200 筆）</h2>
          <p className="mt-1 text-xs text-earth-600">完整 LINE userId 不會顯示；PR-13 也不提供自動修復。</p>
        </div>
        {audit.rows.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">目前所有有效顧客皆已安全對齊中央 LINE。</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-earth-200 bg-white">
            {audit.rows.map((row) => (
              <div key={row.customerId} className="grid gap-2 border-b border-earth-100 p-4 text-sm last:border-b-0 md:grid-cols-[1fr_1fr_1.3fr]">
                <div><p className="font-medium text-earth-900">{row.customerName}</p><p className="text-xs text-earth-500">{row.storeName}</p></div>
                <p className="text-earth-700">{CENTRAL_LINE_STATUS_LABEL[row.status]}</p>
                <p className="text-xs text-earth-500">中央收件人：{row.maskedRecipient ?? "未提供（已阻擋）"}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "earth" | "green" | "red" }) {
  const styles = tone === "green" ? "border-green-200 bg-green-50 text-green-900" : tone === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-earth-200 bg-white text-earth-900";
  return <div className={`rounded-lg border p-4 ${styles}`}><p className="text-xs">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
