import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import {
  getCustomerMergePreview,
  type CustomerMergePreviewRow,
} from "@/server/queries/customer";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { MergeConfirmForm } from "./merge-confirm-form";

/**
 * 顧客合併（Phase 1）
 *
 * 流程：
 *   1. 進頁無參數 → 顯示兩個 input（sourceCustomerId / targetCustomerId）
 *   2. 點「載入預覽」→ ?source=...&target=... 帶回，server 端 fetch preview
 *   3. 確認後在 client form 呼叫 mergeCustomerAction
 *
 * 權限：
 *   - OWNER only（user.role !== "OWNER" → notFound()，符合專案 staff-page 慣例）
 *   - 額外 checkPermission("customer.update")
 *
 * 注意：Phase 1 不做 candidate detection，只提供雙 ID 確認。
 */
export default async function CustomerMergePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; target?: string; result?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  // 高風險 staff 操作 — 僅 OWNER（單店店長）；ADMIN 也 ok
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    notFound();
  }
  if (!(await checkPermission(user.role, user.staffId, "customer.update"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const sourceId = (params.source ?? "").trim();
  const targetId = (params.target ?? "").trim();

  let preview: { source: CustomerMergePreviewRow; target: CustomerMergePreviewRow } | null = null;
  let previewError: string | null = null;

  if (sourceId && targetId) {
    if (sourceId === targetId) {
      previewError = "來源與目標不可相同";
    } else {
      try {
        preview = await getCustomerMergePreview(sourceId, targetId);
        if (preview.source.storeId !== preview.target.storeId) {
          previewError = "來源與目標屬於不同店別，無法合併";
        } else if (preview.source.mergedIntoCustomerId) {
          previewError = `來源顧客已被合併進 ${preview.source.mergedIntoCustomerId}`;
        } else if (preview.target.mergedIntoCustomerId) {
          previewError = `目標顧客本身已被合併進 ${preview.target.mergedIntoCustomerId}`;
        }
      } catch (err) {
        previewError = err instanceof Error ? err.message : "載入預覽失敗";
      }
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="顧客合併（Phase 1）"
        subtitle="把兩筆同人 Customer 合併為一筆。Source 會被歸檔，所有預約 / 方案 / 交易 / 點數搬到 Target。"
        actions={
          <Link
            href="/dashboard/customers"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 顧客列表
          </Link>
        }
      />

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-900">注意事項</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
          <li>合併不可復原。Source 會被標記為已合併（mergedIntoCustomerId），列表不再顯示。</li>
          <li>所有預約、課程方案、交易、點數紀錄都會搬到 Target。</li>
          <li>不允許跨店合併。兩邊都已綁定登入帳號（userId）時 Phase 1 會直接拒絕。</li>
          <li>Phase 1 為手動雙 ID 模式；候選清單與衝突解決 UI 將於 Phase 2 提供。</li>
        </ul>
      </div>

      {/* Step 1: 輸入兩個 ID 載入預覽 */}
      <form
        method="GET"
        action="/dashboard/customers/merge"
        className="rounded-lg border border-earth-200 bg-white p-4"
      >
        <h2 className="text-sm font-medium text-earth-700">Step 1 載入預覽</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-earth-700">
              來源顧客 ID（將被合併並歸檔）
            </label>
            <input
              type="text"
              name="source"
              defaultValue={sourceId}
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 font-mono text-xs text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              placeholder="ck00000..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-earth-700">
              目標顧客 ID（保留並接收所有資料）
            </label>
            <input
              type="text"
              name="target"
              defaultValue={targetId}
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 font-mono text-xs text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              placeholder="ck00000..."
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            載入預覽
          </button>
        </div>
      </form>

      {/* Step 2: 預覽 + 確認 */}
      {previewError ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {previewError}
        </div>
      ) : null}

      {preview && !previewError ? (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-earth-700">Step 2 確認合併</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PreviewCard title="來源（Source — 將被歸檔）" tone="warning" row={preview.source} />
            <PreviewCard title="目標（Target — 將保留並接收）" tone="success" row={preview.target} />
          </div>

          <div className="rounded-lg border border-earth-200 bg-white p-4 text-sm text-earth-700">
            合併後將把
            <strong className="mx-1 text-earth-900">{preview.source.bookingCount}</strong>
            筆預約 /
            <strong className="mx-1 text-earth-900">{preview.source.walletCount}</strong>
            筆方案 /
            <strong className="mx-1 text-earth-900">{preview.source.transactionCount}</strong>
            筆交易從
            <strong className="mx-1 text-earth-900">{preview.source.name}</strong>
            搬到
            <strong className="mx-1 text-earth-900">{preview.target.name}</strong>。
          </div>

          {preview.source.hasUserId && preview.target.hasUserId ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              來源與目標都有綁定的登入帳號（userId）。Phase 1 不自動處理此情境，請先人工取消其中一邊的 userId 綁定後再合併。
            </div>
          ) : (
            <MergeConfirmForm
              sourceCustomerId={preview.source.id}
              targetCustomerId={preview.target.id}
            />
          )}
        </div>
      ) : null}

      {params.result ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-700 whitespace-pre-wrap">
          {decodeURIComponent(params.result)}
        </div>
      ) : null}

      {params.error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {decodeURIComponent(params.error)}
        </div>
      ) : null}
    </PageShell>
  );
}

function PreviewCard({
  title,
  tone,
  row,
}: {
  title: string;
  tone: "warning" | "success";
  row: CustomerMergePreviewRow;
}) {
  const border = tone === "warning" ? "border-amber-300" : "border-emerald-300";
  const bg = tone === "warning" ? "bg-amber-50" : "bg-emerald-50";
  return (
    <div className={`rounded-lg border ${border} ${bg} p-4 text-sm`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-earth-600">{title}</h3>
      <p className="mt-2 text-base font-medium text-earth-900">{row.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-earth-700">
        <dt className="text-earth-500">ID</dt>
        <dd className="break-all font-mono">{row.id}</dd>
        <dt className="text-earth-500">店別</dt>
        <dd>{row.storeName}</dd>
        <dt className="text-earth-500">電話</dt>
        <dd>{row.phone || "—"}</dd>
        <dt className="text-earth-500">Email</dt>
        <dd className="break-all">{row.email || "—"}</dd>
        <dt className="text-earth-500">LINE 名稱</dt>
        <dd>{row.lineName || "—"}</dd>
        <dt className="text-earth-500">LINE 綁定</dt>
        <dd>{row.lineLinkStatus}</dd>
        <dt className="text-earth-500">登入帳號</dt>
        <dd>{row.hasUserId ? "已綁定" : "未綁定"}</dd>
        <dt className="text-earth-500">階段</dt>
        <dd>{row.customerStage}</dd>
        <dt className="text-earth-500">點數</dt>
        <dd>{row.totalPoints}</dd>
        <dt className="text-earth-500">預約數</dt>
        <dd>{row.bookingCount}</dd>
        <dt className="text-earth-500">方案數</dt>
        <dd>{row.walletCount}</dd>
        <dt className="text-earth-500">交易數</dt>
        <dd>{row.transactionCount}</dd>
      </dl>
    </div>
  );
}
