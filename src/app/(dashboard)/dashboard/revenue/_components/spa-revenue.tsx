import { SpaCustomerDrawerButton } from "../../customers/_components/spa-customer-drawer-button";
import { SpaRevenueActions } from "./spa-revenue-actions";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { getSpaRevenue } from "@/server/queries/spa-revenue";
import {
  toLocalDateStr,
  formatTWTime,
  parseTaiwanDateToDbDate,
} from "@/lib/date-utils";
import { validSpaDate } from "@/lib/spa-scheduling";
import {
  SPA_PAYMENT_LABELS,
  SPA_CHECKOUT_PAYMENT_METHODS,
} from "@/lib/spa-payment-methods";
const money = (v: number) => `NT$ ${v.toLocaleString()}`;
export async function SpaRevenue({
  storeId,
  params,
  canManage,
}: {
  storeId: string;
  canManage: boolean;
  params: {
    dateFrom?: string;
    dateTo?: string;
    method?: string;
    search?: string;
    kind?: string;
    status?: string;
    page?: string;
  };
}) {
  const today = toLocalDateStr();
  const from =
    params.dateFrom && validSpaDate(params.dateFrom)
      ? params.dateFrom
      : today.slice(0, 7) + "-01";
  const to =
    params.dateTo && validSpaDate(params.dateTo) ? params.dateTo : today;
  const method = SPA_CHECKOUT_PAYMENT_METHODS.some((m) => m === params.method)
    ? params.method!
    : "";
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(params.page) || 1)),
  );
  if (from > to)
    return (
      <PageShell>
        <PageHeader title="營運" subtitle="SPA 收款與退款" />
        <p role="alert">開始日期不能晚於結束日期。</p>
        <Link href="/dashboard/revenue" className="underline">
          重設日期
        </Link>
      </PageShell>
    );
  const search = params.search?.trim().slice(0, 100) ?? "";
  const kind = ["SERVICE", "PACKAGE", "TOPUP", "REFUND"].includes(
    params.kind ?? "",
  )
    ? params.kind!
    : "";
  const status = ["ALL", "VOIDED"].includes(params.status ?? "")
    ? params.status!
    : "ACTIVE";
  const data = await getSpaRevenue(storeId, from, to, method, page, {
    search,
    kind,
    status,
  });
  const week = parseTaiwanDateToDbDate(today);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const weekStart = week.toISOString().slice(0, 10);
  const href = (a: string, b: string, p = 1) =>
    `/dashboard/revenue?${new URLSearchParams({ dateFrom: a, dateTo: b, method, search, kind, status, page: String(p) })}`;
  return (
    <PageShell>
      <PageHeader title="營運" subtitle="查看 SPA 實際收款、退款與額度使用" />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["今天", today],
          ["本週", weekStart],
          ["本月", today.slice(0, 7) + "-01"],
        ].map(([label, start]) => (
          <Link
            key={label}
            href={href(start, today)}
            className={`rounded-lg border border-earth-200 px-4 py-2 ${from === start && to === today ? "bg-[#596D45] hover:bg-[#4B5E3B] text-white" : "bg-white"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <form
        key={from + to + method + search + kind + status}
        className="mb-5 grid gap-3 rounded-xl border border-earth-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="min-w-0 text-sm text-earth-600">
          開始日期
          <input
            type="date"
            name="dateFrom"
            defaultValue={from}
            required
            className="mt-1 block min-w-0 max-w-full w-full rounded-lg border border-earth-200 p-2"
          />
        </label>
        <label className="min-w-0 text-sm text-earth-600">
          結束日期
          <input
            type="date"
            name="dateTo"
            defaultValue={to}
            required
            className="mt-1 block min-w-0 max-w-full w-full rounded-lg border border-earth-200 p-2"
          />
        </label>
        <label className="min-w-0 text-sm text-earth-600">
          付款方式
          <select
            name="method"
            defaultValue={method}
            className="mt-1 block w-full rounded-lg border border-earth-200 p-2"
          >
            <option value="">全部付款方式</option>
            {SPA_CHECKOUT_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {SPA_PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm text-earth-600">
          顧客
          <input
            name="search"
            defaultValue={search}
            placeholder="姓名／電話"
            maxLength={100}
            className="mt-1 block w-full min-w-0 rounded-lg border border-earth-200 p-2"
          />
        </label>
        <label className="min-w-0 text-sm text-earth-600">
          交易類型
          <select
            name="kind"
            defaultValue={kind}
            className="mt-1 block w-full rounded-lg border border-earth-200 p-2"
          >
            <option value="">全部類型</option>
            <option value="SERVICE">服務結帳</option>
            <option value="PACKAGE">購買方案</option>
            <option value="TOPUP">儲值</option>
            <option value="REFUND">退款</option>
          </select>
        </label>
        <label className="min-w-0 text-sm text-earth-600">
          紀錄狀態
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block w-full rounded-lg border border-earth-200 p-2"
          >
            <option value="ACTIVE">有效紀錄</option>
            <option value="VOIDED">已刪除／作廢</option>
            <option value="ALL">包含作廢紀錄</option>
          </select>
        </label>
        <div className="flex gap-3 items-center sm:col-span-2 lg:col-span-3">
          <button className="self-end rounded-lg bg-[#596D45] hover:bg-[#4B5E3B] p-3 text-white">
            套用篩選
          </button>
          <Link
            href="/dashboard/revenue"
            className="text-sm text-earth-500 underline"
          >
            重設
          </Link>
        </div>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["本期收款", money(data.collected)],
          ["退款", money(data.refunded)],
          ["淨收款", money(data.collected - data.refunded)],
          ["完成服務", `${data.completed} 筆`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-earth-200 bg-white p-4"
          >
            <p className="text-sm text-earth-500">{label}</p>
            <strong className="text-xl text-[#596D45] tabular-nums">
              {value}
            </strong>
          </div>
        ))}
      </div>
      <p className="mb-5 text-sm text-earth-500">
        {from} ～ {to}
        。收款包含服務付款、購買方案與儲值；扣次、儲值扣款及額度退回不重複計入。完成服務按結帳時間統計，不受付款方式篩選影響。
      </p>
      <section className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <header className="flex justify-between p-4">
          <h2 className="font-bold">交易紀錄</h2>
          <span>共 {data.count} 筆</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y border-earth-100 bg-earth-50">
              <tr>
                {["日期／類型", "項目", "付款方式", "金額／額度", "明細"].map(
                  (t) => (
                    <th className="p-3" key={t}>
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.kind + r.id}
                  className="border-b border-earth-100 align-top hover:bg-earth-50/50"
                >
                  <td className="p-3 whitespace-nowrap">
                    <span className="block">
                      {formatTWTime(r.at).split(" ")[0]}
                    </span>
                    <span className="text-xs text-earth-500">
                      {formatTWTime(r.at).split(" ").slice(1).join(" ")}
                    </span>
                    <p className="text-earth-500">
                      {(
                        {
                          SERVICE: "服務結帳",
                          PACKAGE: "購買方案",
                          TOPUP: "儲值",
                          REFUND: "退款",
                        } as Record<string, string>
                      )[r.kind] ?? r.kind}
                    </p>
                  </td>
                  <td className="p-3">
                    {r.customerName && (
                      <strong className="block">{r.customerName}</strong>
                    )}
                    {r.name}
                    {r.reason && <p className="text-earth-500">{r.reason}</p>}
                  </td>
                  <td className="p-3">
                    {SPA_PAYMENT_LABELS[r.method] ?? r.method}
                    {r.last4 && <p>後四碼 {r.last4}</p>}
                  </td>
                  <td
                    className={`p-3 text-right whitespace-nowrap tabular-nums ${r.voided ? "text-earth-400 line-through" : ""}`}
                  >
                    {r.method === "ENTITLEMENT"
                      ? `${r.uses ?? 0} 次`
                      : money(r.amount)}
                    <p
                      className={
                        r.kind === "REFUND" ? "text-red-700" : "text-earth-500"
                      }
                    >
                      {r.voided
                        ? "已作廢，不計入收款"
                        : !r.external
                          ? r.kind === "REFUND"
                            ? "額度退回"
                            : "使用既有額度"
                          : r.kind === "REFUND"
                            ? "退款"
                            : "收款"}
                    </p>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <SpaCustomerDrawerButton customerId={r.customerId} />
                      <SpaRevenueActions row={r} canManage={canManage} />
                    </div>
                  </td>
                </tr>
              ))}
              {!data.rows.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-earth-500">
                    此期間沒有符合條件的 SPA 交易
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between p-4">
          {page > 1 ? (
            <Link href={href(from, to, page - 1)}>上一頁</Link>
          ) : (
            <span />
          )}
          <span>第 {page} 頁</span>
          {page * 30 < data.count ? (
            <Link href={href(from, to, page + 1)}>下一頁</Link>
          ) : (
            <span />
          )}
        </footer>
      </section>
    </PageShell>
  );
}
