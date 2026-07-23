import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { getCentralUserMergeCandidates, getRecentCentralUserMergeReceipts } from "@/server/queries/central-user-merge";
import { previewCentralUserMerge } from "@/server/services/central-user-merge";
import { CentralUserMergeForm } from "./merge-form";

export default async function CentralUserMergesPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; target?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();
  const params = await searchParams;
  const sourceId = (params.source ?? "").trim();
  const targetId = (params.target ?? "").trim();
  const [candidates, receipts, preview] = await Promise.all([
    getCentralUserMergeCandidates(),
    getRecentCentralUserMergeReceipts(),
    sourceId && targetId && sourceId !== targetId
      ? previewCentralUserMerge(sourceId, targetId).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="重複中央會員整合"
        subtitle="僅列出手機完全相符的疑似重複帳號；不會自動合併。"
        actions={<div className="flex gap-3"><Link href="/dashboard/central-line-recipients" className="text-sm text-primary-700">中央 LINE 盤點</Link><Link href="/dashboard/member-link-reviews" className="text-sm text-primary-700">← 會員健康檢查</Link></div>}
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        姓名相同不視為重複。請先核對本人與分店資料，再指定來源帳號及主要帳號。同一個中央會員在同一家店只能對應一筆顧客；即使分別使用 LINE、Google 或手機登入，只要指向不同顧客就會阻擋。
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="待人工核對" value={`${candidates.length} 組`} tone={candidates.length ? "amber" : "green"} />
        <SummaryCard label="涉及中央帳號" value={`${new Set(candidates.flatMap((group) => group.users.map((item) => item.id))).size} 個`} tone="earth" />
        <SummaryCard label="近期驗收通過" value={`${receipts.filter((item) => item.status === "PASS").length} 筆`} tone="green" />
      </div>

      <form method="GET" className="rounded-lg border border-earth-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-earth-900">Dry Run</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-earth-700">來源 User ID<input name="source" defaultValue={sourceId} required className="mt-1 block w-full rounded-md border border-earth-300 px-3 py-2 font-mono text-xs" /></label>
          <label className="text-xs text-earth-700">主要 User ID<input name="target" defaultValue={targetId} required className="mt-1 block w-full rounded-md border border-earth-300 px-3 py-2 font-mono text-xs" /></label>
        </div>
        <button className="mt-3 rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white">產生合併預覽</button>
      </form>

      {preview ? (
        <div className="space-y-4 rounded-lg border border-earth-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <UserCard title="來源帳號（將停用）" user={preview.source} />
            <UserCard title="主要帳號（保留）" user={preview.target} />
          </div>
          <div className={`rounded-md border p-3 text-sm ${preview.plan.executable ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            <p className="font-medium">{preview.plan.executable ? "安全檢查通過，可以人工確認" : "安全檢查未通過，禁止整合"}</p>
            <p className="mt-1">預計移動：登入方式 {preview.plan.moves.accounts}、跨店連結 {preview.plan.moves.identityLinks}、直接顧客關聯 {preview.plan.moves.directCustomer}</p>
            {preview.plan.blockers.map((item) => <p key={item} className="mt-1">• {item}</p>)}
            {preview.plan.warnings.map((item) => <p key={item} className="mt-1 text-amber-800">• {item}</p>)}
          </div>
          {preview.plan.executable ? <CentralUserMergeForm sourceUserId={preview.source.id} targetUserId={preview.target.id} /> : null}
        </div>
      ) : sourceId || targetId ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">無法載入預覽，請確認兩個 User ID。</div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-earth-900">疑似重複名單（{candidates.length} 組）</h2>
        {candidates.length === 0 ? <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">目前沒有手機完全相符的重複中央會員。</div> : candidates.map((group) => (
          <div key={group.phone} className="rounded-lg border border-earth-200 bg-white p-4">
            <p className="text-sm font-medium text-earth-900">手機 {group.phone}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {group.users.map((candidate) => (
                <div key={candidate.id} className="rounded-md border border-earth-100 p-3 text-xs text-earth-700">
                  <p className="text-sm font-medium text-earth-900">{candidate.name}</p>
                  <p className="mt-1 font-mono">{candidate.id}</p>
                  <p className="mt-1">分店：{candidate.stores.join("、") || "尚無"}</p>
                  <p>登入：{candidate.providers.join("、") || "手機密碼／未辨識"}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-earth-900">近期整合驗收憑證</h2>
          <p className="mt-1 text-xs text-earth-600">只顯示不含姓名、手機、Email、provider ID 或 token 的安全結果。</p>
        </div>
        {receipts.length === 0 ? (
          <div className="rounded-lg border border-earth-200 bg-white p-4 text-sm text-earth-700">尚無中央會員整合紀錄。</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-earth-200 bg-white">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="grid gap-2 border-b border-earth-100 p-4 text-xs text-earth-700 last:border-b-0 md:grid-cols-[1.2fr_1fr_1fr]">
                <div>
                  <p className="font-medium text-earth-900">{receipt.status === "PASS" ? "驗收通過" : "舊版紀錄（無自動驗收憑證）"}</p>
                  <p className="mt-1">{receipt.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
                </div>
                <div><p>主要 User</p><p className="mt-1 font-mono">{receipt.targetUserId}</p></div>
                <div>
                  <p>移動登入 {receipt.movedAccounts}、跨店連結 {receipt.movedLinks}</p>
                  <p className="mt-1">{receipt.checkedCustomers === null ? "未記錄門店驗收數" : `已核對 ${receipt.checkedCustomers} 筆門店會員；保留 ${receipt.targetLoginMethods} 種登入方式`}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">異常處理與復原</p>
        <p className="mt-1">若畫面未顯示「驗收通過」，請勿重複執行或人工修改資料庫。保留 User ID 與發生時間交由工程檢查 transaction／audit；驗收失敗時系統會自動回滾，不會留下半套合併。</p>
      </div>
    </PageShell>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "amber" | "green" | "earth" }) {
  const styles = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : tone === "green"
      ? "border-green-200 bg-green-50 text-green-900"
      : "border-earth-200 bg-white text-earth-900";
  return <div className={`rounded-lg border p-4 ${styles}`}><p className="text-xs">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function UserCard({ title, user }: { title: string; user: Awaited<ReturnType<typeof previewCentralUserMerge>>["source"] }) {
  return (
    <div className="rounded-md border border-earth-100 p-3 text-sm text-earth-700">
      <p className="font-medium text-earth-900">{title}</p>
      <p className="mt-2">{user.name}</p><p className="font-mono text-xs">{user.id}</p>
      <p className="mt-1">登入方式：{user.accounts.map((row) => row.provider).join("、") || (user.hasPassword ? "手機密碼" : "無")}</p>
      <p>跨店連結：{user.identityLinks.length}；直接顧客：{user.customer ? `${user.customer.name}（${user.customer.storeId}）` : "無"}</p>
    </div>
  );
}
