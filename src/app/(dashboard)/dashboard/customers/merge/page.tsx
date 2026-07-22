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
import { prisma } from "@/lib/db";
import { getActiveStoreForRead } from "@/lib/store";

/**
 * 重複顧客處理
 *
 * 流程：
 *   1. 從顧客詳情帶入 source，或以姓名 / 電話搜尋候選
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
  searchParams: Promise<{ source?: string; target?: string; q?: string; result?: string; error?: string }>;
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
  const query = (params.q ?? "").trim();
  const activeStoreId = await getActiveStoreForRead(user);
  const candidates = query && activeStoreId
    ? await prisma.customer.findMany({
        where: {
          storeId: activeStoreId,
          mergedIntoCustomerId: null,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
          ],
        },
        select: { id: true, name: true, phone: true, lineLinkStatus: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

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
        title="重複顧客處理"
        subtitle="確認是同一人後，保留正確資料並安全整併重複帳號。"
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
          <li>「被整併資料」會歸檔；預約、方案、交易及點數會完整移到「保留資料」。</li>
          <li>不允許跨店整併；資料只會在目前門市內處理。</li>
          <li>若兩邊綁定不同登入身分，系統會停止，不會自行覆蓋。</li>
        </ul>
      </div>

      <form method="GET" action="/dashboard/customers/merge" className="rounded-lg border border-earth-200 bg-white p-4">
        {sourceId ? <input type="hidden" name="source" value={sourceId} /> : null}
        {targetId ? <input type="hidden" name="target" value={targetId} /> : null}
        <label className="block text-xs font-medium text-earth-700">搜尋另一筆顧客資料</label>
        <div className="mt-2 flex gap-2">
          <input name="q" defaultValue={query} placeholder="輸入姓名或手機" className="min-w-0 flex-1 rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
          <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">搜尋</button>
        </div>
        {query ? (
          <div className="mt-3 space-y-2">
            {candidates.length === 0 ? <p className="text-xs text-earth-500">找不到符合的顧客。</p> : candidates.map((candidate) => {
              const chooseHref = sourceId
                ? `/dashboard/customers/merge?source=${sourceId}&target=${candidate.id}`
                : targetId
                  ? `/dashboard/customers/merge?source=${candidate.id}&target=${targetId}`
                  : `/dashboard/customers/merge?source=${candidate.id}`;
              return (
                <Link key={candidate.id} href={chooseHref} className="flex items-center justify-between rounded-lg border border-earth-100 px-3 py-2 hover:bg-earth-50">
                  <span><span className="text-sm font-medium text-earth-900">{candidate.name}</span><span className="ml-2 text-xs text-earth-500">{candidate.phone}</span></span>
                  <span className="text-xs font-medium text-primary-700">選擇</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </form>

      {/* Step 1: 輸入兩個 ID 載入預覽 */}
      <form
        method="GET"
        action="/dashboard/customers/merge"
        className="rounded-lg border border-earth-200 bg-white p-4"
      >
        <h2 className="text-sm font-medium text-earth-700">選擇兩筆資料</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-earth-700">
              被整併資料 ID（將歸檔）
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
              保留資料 ID（接收所有紀錄）
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
            比對資料
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
          <h2 className="text-sm font-medium text-earth-700">確認資料與影響</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PreviewCard title="被整併資料（將歸檔）" tone="warning" row={preview.source} />
            <PreviewCard title="保留資料（接收所有紀錄）" tone="success" row={preview.target} />
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

          {preview.source.userId && preview.target.userId && preview.source.userId !== preview.target.userId ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              兩筆資料綁定不同登入身分，系統已停止整併。請先確認本人身分，再使用 LINE 重新綁定或交由系統管理者處理。
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
