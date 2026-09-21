import { DashboardLink as Link } from "@/components/dashboard-link";
import type { NotificationRow } from "@/server/queries/notification-center";
const labels: Record<string, string> = {
  SAME_DAY_BOOKING_CREATED: "當日新預約",
  PUBLIC_TRIAL_BOOKING_CREATED: "新體驗預約",
  VIP_INTEREST: "VIP 續購需求",
  DIGITAL_BUTLER_LEAD_CREATED: "數位管家新名單",
  HUMAN_SUPPORT_REQUESTED: "要求真人客服",
  HUMAN_SUPPORT_FINAL_REMINDER: "真人客服未接手",
  TRANSFER_PENDING_CONFIRMATION: "待確認付款",
  INCOMPLETE_SERVICE_REMINDER: "服務未完成",
  DAILY_ACTION_DIGEST: "每日待辦摘要",
  LAST_SESSION: "剩餘一堂",
  PLAN_USED_UP: "方案用完",
};
const statuses: Record<string, string> = {
  SENT: "已發送",
  FAILED: "失敗",
  PENDING: "待發送",
  SKIPPED: "已跳過",
};
export function NotificationLogList({
  data,
  params,
  baseHref = "/dashboard/reminders",
  course = false,
}: {
  data: {
    rows: NotificationRow[];
    page: number;
    hasMore: boolean;
    typeOptions: string[];
  };
  params: Record<string, string | undefined>;
  baseHref?: string;
  course?: boolean;
}) {
  // Keep historical types discoverable, without advertising unimplemented course events.
  const visibleLabels = course ? Object.fromEntries(Object.entries(labels).filter(([key]) =>
    ["SAME_DAY_BOOKING_CREATED", "TRANSFER_PENDING_CONFIRMATION"].includes(key)
    || data.typeOptions.includes(key) || data.rows.some(row => row.type === key) || params.type === key,
  )) : labels;
  function pageUrl(page: number) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    q.set("tab", "logs");
    q.set("page", String(page));
    return `${baseHref}?${q}`;
  }
  return (
    <section className="space-y-3">
      <form data-settings-panel-filter className="grid grid-cols-2 items-end gap-3 rounded-xl border border-earth-200 bg-white p-3 lg:grid-cols-6">
        <input type="hidden" name="tab" value="logs" />
        <label className="flex min-w-0 flex-col gap-1 text-xs text-earth-500 col-span-2 lg:col-span-1">
          <span>搜尋收件人</span>
          <input
            aria-label="搜尋收件人"
            name="search"
            defaultValue={params.search}
            placeholder="搜尋收件人"
            className="h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-earth-500">
          <span>通知對象</span>
          <select
            aria-label="通知對象"
            name="audience"
            defaultValue={params.audience ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-sm"
          >
            <option value="">全部對象</option>
            <option value="manager">店長</option>
            <option value="customer">顧客</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-earth-500">
          <span>通知類型</span>
          <select
            aria-label="通知類型"
            name="type"
            defaultValue={params.type ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-sm"
          >
            <option value="">全部類型</option>
            {[
              ...Object.entries(visibleLabels),
              ...[
                ...new Set([
                  ...data.typeOptions,
                  ...(course ? ["課程方案到期提醒"] : []),
                  ...data.rows.map((r) => r.type),
                  ...(params.type ? [params.type] : []),
                ]),
              ]
                .filter((k) => !visibleLabels[k])
                .map((k) => [k, k]),
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs text-earth-500 lg:col-span-1">
          <span>發送日期</span>
          <input
            aria-label="發送日期"
            name="date"
            type="date"
            defaultValue={params.date}
            className="block h-11 min-h-0 w-full min-w-0 max-w-full appearance-none rounded-lg border border-earth-200 bg-white p-2 text-sm [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left"
          />
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs text-earth-500 lg:col-span-1">
          <span>發送狀態</span>
          <select
            aria-label="發送狀態"
            name="status"
            defaultValue={params.status ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-2 text-sm"
          >
            <option value="">全部狀態</option>
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="col-span-2 h-11 rounded-lg bg-primary-700 p-2 text-sm text-white lg:col-span-1">
          篩選
        </button>
      </form>
      <p className="text-xs text-earth-500">
        店長通知紀錄自本次更新起保存；舊有顧客提醒紀錄保留。
      </p>
      <div className="hidden grid-cols-[180px_1fr_1fr_80px] gap-3 px-4 text-xs text-earth-500 md:grid">
        <span>時間</span>
        <span>收件人</span>
        <span>提醒類型</span>
        <span>結果</span>
      </div>
      {data.rows.length === 0 && (
        <p className="rounded-xl border border-earth-200 bg-white p-8 text-center text-earth-500">
          沒有符合條件的發送紀錄
        </p>
      )}
      {data.rows.map((r) => (
        <details
          key={r.id}
          className="rounded-xl border border-earth-200 bg-white p-4"
        >
          <summary className="grid cursor-pointer list-none gap-2 text-sm md:grid-cols-[180px_1fr_1fr_80px]">
            <span className="text-xs text-earth-500">
              {r.at.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
            </span>
            <span className="font-medium">
              {r.recipient}
              <span className="ml-2 text-xs text-earth-500">
                {r.audience === "manager" ? "店長" : "顧客"}
              </span>
            </span>
            <span>{labels[r.type] ?? r.type}</span>
            <span
              className={
                r.status === "FAILED"
                  ? "text-red-700"
                  : r.status === "SENT"
                    ? "text-green-700"
                    : "text-earth-500"
              }
            >
              {statuses[r.status] ?? r.status} ▾
            </span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-earth-100 pt-3 text-sm">
            {r.customerId && (
              <Link
                href={course ? `/dashboard/courses?view=customers&customerId=${encodeURIComponent(r.customerId)}` : `/dashboard/customers/${r.customerId}`}
                className="text-primary-700"
              >
                查看顧客 →
              </Link>
            )}
            {r.channel && <p className="text-xs text-earth-500">{r.channel}</p>}
            {r.planName && (
              <p>
                方案：{r.planName} · 顧客回覆：
                {r.responseAction === "VIP_INTEREST"
                  ? "想了解 VIP 方案"
                  : r.responseAction === "LATER"
                    ? "之後再看看"
                    : "尚未回覆"}
              </p>
            )}
            {r.managerStatus && (
              <p>
                店長通知：{statuses[r.managerStatus] ?? r.managerStatus}
                {r.managerError ? ` · ${r.managerError}` : ""}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words">
              {r.body ?? "此舊紀錄未保存訊息內容。"}
            </p>
            {r.status === "FAILED" && (
              <p className="text-red-700">
                通知未送出，請確認收件人的 LINE 綁定及本店連線設定。
              </p>
            )}
            {r.error && (
              <details>
                <summary className="text-xs text-earth-500">詳細原因</summary>
                <p className="mt-2 break-words text-xs text-earth-600">
                  {r.error}
                </p>
              </details>
            )}
          </div>
        </details>
      ))}
      <div className="flex justify-center gap-4 text-sm">
        {data.page > 1 && <Link href={pageUrl(data.page - 1)}>上一頁</Link>}
        <span>第 {data.page} 頁</span>
        {data.hasMore && <Link href={pageUrl(data.page + 1)}>下一頁</Link>}
      </div>
    </section>
  );
}
