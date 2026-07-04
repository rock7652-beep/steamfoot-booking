/**
 * /dashboard/cashbook — 現金管理（一頁式工作台）
 *
 * PR-8：把原本 /dashboard/cashbook 升級成「現金管理」主頁。
 * 上方嵌入 CashDrawerWorkspace（與 /dashboard/cash-drawer 共用同一元件）
 * 讓店長在同頁完成每日現金抽屜操作 + 月度現金帳檢視，不再跳頁。
 *
 * 資料模型嚴格分離維持不變：
 *   - CashDrawerSession / CashDrawerEntry：今日抽屜（上方 workspace 區）
 *   - CashbookEntry：月度現金帳（下方 records 區）
 *   - 提領 / 補入 / 調整 不寫入 CashbookEntry，不算損益
 *
 * 權限：
 *   - cashbook.read 必需（page-level）
 *   - cashDrawer.read 才會 render workspace section；否則只顯示下方現金帳
 */

import { listCashbookEntries, getMonthlySummary } from "@/server/queries/cashbook";
import { getCashDrawerView, listClosedBusinessDates } from "@/server/queries/cash-drawer";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedStorePlan } from "@/lib/query-cache";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FeatureGate } from "@/components/feature-gate";
import { FormErrorToast } from "@/components/form-error-toast";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell, PageHeader } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import type { CashbookEntryType } from "@prisma/client";
import { CashDrawerWorkspace } from "../cash-drawer/cash-drawer-workspace";

const ENTRY_TYPE_LABEL: Record<CashbookEntryType, string> = {
  INCOME: "收入",
  EXPENSE: "支出",
  WITHDRAW: "提領",
  ADJUSTMENT: "調整",
};

const ENTRY_TYPE_COLOR: Record<CashbookEntryType, string> = {
  INCOME: "bg-green-100 text-green-700",
  EXPENSE: "bg-red-100 text-red-700",
  WITHDRAW: "bg-orange-100 text-orange-700",
  ADJUSTMENT: "bg-earth-100 text-earth-600",
};

// PR-4：付款方式 badge。現金（影響現金抽屜）用偏藍、其他用中性灰，色調低調不搶眼。
const PAYMENT_METHOD_LABEL: Record<"CASH" | "OTHER", string> = {
  CASH: "現金",
  OTHER: "其他",
};

const PAYMENT_METHOD_COLOR: Record<"CASH" | "OTHER", string> = {
  CASH: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  OTHER: "bg-earth-50 text-earth-500 ring-1 ring-earth-200",
};

interface PageProps {
  searchParams: Promise<{
    month?: string;
    type?: CashbookEntryType;
    page?: string;
    cashDrawerError?: string;
  }>;
}

export default async function CashbookPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashbook.read"))) {
    redirect("/dashboard");
  }

  // 是否能看現金抽屜工作台（PARTNER 等可能無此權限，仍能看現金帳紀錄）
  const canViewCashDrawer = await checkPermission(user.role, user.staffId, "cashDrawer.read");

  const params = await searchParams;
  const page = Number(params.page ?? 1);

  const today = toLocalDateStr();
  const currentMonth = today.slice(0, 7); // "YYYY-MM"
  const month = params.month ?? currentMonth;

  const [year, mon] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const cashbookStoreId = storeIdForViewContext(activeStoreId, storeViewContext);

  // 平行 fetch：cashbook（必要）+ cash drawer（依權限）
  const [cashbookList, summary, plan, cashDrawerData] = await Promise.all([
    listCashbookEntries({
      dateFrom,
      dateTo,
      type: params.type,
      page,
      pageSize: 30,
      activeStoreId: cashbookStoreId,
    }),
    getMonthlySummary(month, cashbookStoreId),
    getCachedStorePlan(cashbookStoreId ?? undefined),
    canViewCashDrawer && cashbookStoreId
      ? (async () => {
          const cashDrawerEnabled = await hasStoreFeature(cashbookStoreId, FEATURES.CASH_DRAWER);
          if (!cashDrawerEnabled) {
            return { locked: true as const };
          }
          const [y, m, d] = today.split("-").map(Number);
          const todayBusinessDate = new Date(Date.UTC(y, m - 1, d));
          // 「記一筆收支」inline form 防呆提示用：近 ~180 天的已閉店營業日。
          const fromDate = new Date(Date.UTC(y, m - 1, d));
          fromDate.setUTCDate(fromDate.getUTCDate() - 180);
          const [
            view,
            canOpen,
            canClose,
            canAddEntry,
            canCreateCashbook,
            closedDates,
            staffOptions,
          ] = await Promise.all([
            getCashDrawerView(cashbookStoreId, todayBusinessDate),
            isViewMode
              ? Promise.resolve(false)
              : checkPermission(user.role, user.staffId, "cashDrawer.open"),
            isViewMode
              ? Promise.resolve(false)
              : checkPermission(user.role, user.staffId, "cashDrawer.close"),
            isViewMode
              ? Promise.resolve(false)
              : checkPermission(user.role, user.staffId, "cashDrawer.entry"),
            isViewMode
              ? Promise.resolve(false)
              : checkPermission(user.role, user.staffId, "cashbook.create"),
            listClosedBusinessDates(cashbookStoreId, fromDate.toISOString().slice(0, 10), today),
            listStaffSelectOptions(),
          ]);
          const canInit = !isViewMode && (user.role === "ADMIN" || user.role === "OWNER");
          const canAssignStaff = !isViewMode && user.role === "ADMIN";
          return {
            locked: false as const,
            view,
            canInit,
            canOpen,
            canClose,
            canAddEntry,
            canCreateCashbook,
            closedDates,
            staffOptions,
            canAssignStaff,
          };
        })()
      : Promise.resolve(null),
  ]);

  const { entries, total, pageSize } = cashbookList;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <FeatureGate plan={plan} feature={FEATURES.CASHBOOK}>
      <PageShell>
        <FormErrorToast />

        <PageHeader
          title="現金管理"
          subtitle="今日抽屜 + 月度現金帳紀錄"
          actions={
            isViewMode ? (
              <span className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">
                查看模式：不可新增記帳
              </span>
            ) : (
              <Link
                href="/dashboard/cashbook/new"
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                + 新增記帳
              </Link>
            )
          }
        />

        {/* 上方：今日現金抽屜工作台（無權限者不 render） */}
        {cashDrawerData && (
          <section id="cash-drawer-workspace" className="space-y-3">
            {cashDrawerData.locked ? (
              <CashDrawerInlineLockedState />
            ) : (
              <CashDrawerWorkspace
                view={cashDrawerData.view}
                todayStr={today}
                canInit={cashDrawerData.canInit}
                canOpen={cashDrawerData.canOpen}
                canClose={cashDrawerData.canClose}
                canAddEntry={cashDrawerData.canAddEntry}
                canCreateCashbook={cashDrawerData.canCreateCashbook}
                closedDates={cashDrawerData.closedDates}
                canAssignStaff={cashDrawerData.canAssignStaff}
                staffOptions={cashDrawerData.staffOptions}
                returnPath="/dashboard/cashbook#cash-drawer-workspace"
              />
            )}
          </section>
        )}

        {/* 下方：月度現金帳紀錄（與 workspace 視覺分隔） */}
        <section id="cashbook-records" className="space-y-4 border-t border-earth-200 pt-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-earth-900">現金帳紀錄</h2>
            <p className="text-xs text-earth-500">
              這裡是所有現金帳紀錄，包含現金與其他付款。只有
              <span className="font-medium text-sky-700">「現金」</span>
              會影響上方抽屜金額。
            </p>
          </div>

          {/* 月份 / 類型 篩選 */}
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-earth-500">月份</label>
              <input
                name="month"
                type="month"
                defaultValue={month}
                className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <select
              name="type"
              defaultValue={params.type ?? ""}
              className="rounded-lg border border-earth-300 px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="">所有類型</option>
              {Object.entries(ENTRY_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-earth-100 px-3 py-1.5 text-sm text-earth-700 hover:bg-earth-200"
            >
              查詢
            </button>
          </form>

          {/* 月度統計：compact stats row（手機 1 col、桌機 / iPad 橫向 3 col） */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
              <p className="text-xs text-green-600">收入</p>
              <p className="text-lg font-bold tabular-nums text-green-700">
                NT$ {summary.income.toLocaleString()}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-xs text-red-600">支出 + 提領</p>
              <p className="text-lg font-bold tabular-nums text-red-700">
                NT$ {summary.expense.toLocaleString()}
              </p>
            </div>
            <div
              className={`flex items-baseline justify-between gap-2 rounded-lg border px-4 py-2.5 ${
                summary.net >= 0 ? "border-primary-200 bg-primary-50" : "border-orange-200 bg-orange-50"
              }`}
            >
              <p className={`text-xs ${summary.net >= 0 ? "text-primary-600" : "text-orange-600"}`}>
                淨額
              </p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  summary.net >= 0 ? "text-primary-700" : "text-orange-700"
                }`}
              >
                NT$ {summary.net.toLocaleString()}
              </p>
            </div>
          </div>

          {/* 明細列表 */}
          <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-earth-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">日期</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">類型</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">付款方式</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">分類</th>
                  <th className="px-4 py-3 text-right font-medium text-earth-600">金額</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">登錄人</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">備註</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-0">
                      <EmptyState
                        icon="empty"
                        title="尚無現金帳記錄"
                        description="新增第一筆現金帳記錄來開始追蹤"
                      />
                    </td>
                  </tr>
                )}
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-earth-50">
                    <td className="px-4 py-3 text-earth-600">
                      {new Date(e.entryDate).toLocaleDateString("zh-TW")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          ENTRY_TYPE_COLOR[e.type]
                        }`}
                      >
                        {ENTRY_TYPE_LABEL[e.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          PAYMENT_METHOD_COLOR[e.paymentMethod]
                        }`}
                      >
                        {PAYMENT_METHOD_LABEL[e.paymentMethod]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-earth-600">{e.category ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        e.type === "INCOME" ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      NT$ {Number(e.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-earth-600">
                      {e.staff?.displayName ?? "未指定"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-earth-400">
                      {e.note ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isViewMode ? (
                        <span className="text-earth-400">僅可查看</span>
                      ) : (
                        <Link
                          href={`/dashboard/cashbook/${e.id}/edit`}
                          className="text-primary-600 hover:underline"
                        >
                          編輯
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-earth-600">
              <span>
                共 {total} 筆，第 {page} / {totalPages} 頁
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`?${new URLSearchParams(Object.fromEntries(Object.entries({ ...params, page: String(page - 1) }).filter(([, v]) => v != null)))}`}
                    className="rounded border px-3 py-1 hover:bg-earth-50"
                  >
                    上一頁
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`?${new URLSearchParams(Object.fromEntries(Object.entries({ ...params, page: String(page + 1) }).filter(([, v]) => v != null)))}`}
                    className="rounded border px-3 py-1 hover:bg-earth-50"
                  >
                    下一頁
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </PageShell>
    </FeatureGate>
  );
}

function CashDrawerInlineLockedState() {
  return (
    <EmptyState
      icon="lock"
      title="現金抽屜尚未開通"
      description="請聯絡總部加購或升級方案後，再使用每日開店點錢、閉店點錢與抽屜異動。現金帳紀錄仍可照常查看。"
    />
  );
}
