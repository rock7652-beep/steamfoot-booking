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
}: {
  storeId: string;
  params: {
    dateFrom?: string;
    dateTo?: string;
    method?: string;
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
  const data = await getSpaRevenue(storeId, from, to, method, page);
  const week = parseTaiwanDateToDbDate(today);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const weekStart = week.toISOString().slice(0, 10);
  const href = (a: string, b: string, p = 1) =>
    `/dashboard/revenue?${new URLSearchParams({ dateFrom: a, dateTo: b, method, page: String(p) })}`;
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
            className={`rounded-lg border px-4 py-2 ${from === start && to === today ? "bg-earth-800 text-white" : "bg-white"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <form key={from+to+method} className="mb-5 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label>
          開始日期
          <input
            type="date"
            name="dateFrom"
            defaultValue={from}
            required
            className="mt-1 block min-w-0 w-full rounded-lg border p-2"
          />
        </label>
        <label>
          結束日期
          <input
            type="date"
            name="dateTo"
            defaultValue={to}
            required
            className="mt-1 block min-w-0 w-full rounded-lg border p-2"
          />
        </label>
        <label>
          付款方式
          <select
            name="method"
            defaultValue={method}
            className="mt-1 block w-full rounded-lg border p-2"
          >
            <option value="">全部付款方式</option>
            {SPA_CHECKOUT_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {SPA_PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-earth-800 p-3 text-white">
          查詢
        </button>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["本期收款", money(data.collected)],
          ["退款", money(data.refunded)],
          ["淨收款", money(data.collected - data.refunded)],
          ["完成服務", `${data.completed} 筆`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-earth-500">{label}</p>
            <strong className="text-xl">{value}</strong>
          </div>
        ))}
      </div>
      <p className="mb-5 text-sm text-earth-500">
        {from} ～ {to}
        。收款包含服務付款、購買方案與儲值；扣次、儲值扣款及額度退回不重複計入。完成服務按結帳時間統計，不受付款方式篩選影響。
      </p>
      <section className="overflow-hidden rounded-xl border bg-white">
        <header className="flex justify-between p-4">
          <h2 className="font-bold">交易紀錄</h2>
          <span>共 {data.count} 筆</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y bg-earth-50">
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
                <tr key={r.kind + r.id} className="border-b align-top">
                  <td className="p-3 whitespace-nowrap">
                    {toLocalDateStr(r.at)} {formatTWTime(r.at)}
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
                  <td className="p-3 whitespace-nowrap">
                    {r.method === "ENTITLEMENT"
                      ? `${r.uses ?? 0} 次`
                      : money(r.amount)}
                    <p
                      className={
                        r.kind === "REFUND" ? "text-red-700" : "text-earth-500"
                      }
                    >
                      {!r.external
                        ? r.kind === "REFUND"
                          ? "額度退回"
                          : "使用既有額度"
                        : r.kind === "REFUND"
                          ? "退款"
                          : "收款"}
                    </p>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/dashboard/customers?search=${encodeURIComponent(r.customerPhone ?? r.customerName ?? r.customerId)}`}
                      className="underline"
                    >
                      查看顧客
                    </Link>
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
