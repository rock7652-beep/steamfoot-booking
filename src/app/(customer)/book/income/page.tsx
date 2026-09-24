import { AppError } from "@/lib/errors";
import { settlementMonth } from "@/lib/course-monthly-settlement";
import { summarizePersonalIncome } from "@/lib/course-personal-income";
import { formatTWDateTime, toLocalMonthStr } from "@/lib/date-utils";
import { getStoreContext } from "@/lib/store-context";
import { readMyCourseIncome } from "@/server/services/course-personal-income";

export const dynamic = "force-dynamic";
const money = (n: number | null) => n === null ? "待核對" : `NT$ ${n.toLocaleString()}`;

export default async function MyCourseIncome({searchParams}: {searchParams: Promise<{month?:string}>}) {
  const params = await searchParams;
  const parsed = settlementMonth.safeParse(params.month ?? toLocalMonthStr());
  if (!parsed.success) return <p className="p-6">月份格式不正確，請使用 YYYY-MM。</p>;
  const month = parsed.data;
  const context = await getStoreContext();
  const prefix = context?.storeSlug ? `/s/${context.storeSlug}` : "";
  let report;
  try { report = await readMyCourseIncome(month); }
  catch (error) {
    if (!(error instanceof AppError) || error.code !== "FORBIDDEN") throw error;
    return <section className="mx-auto max-w-2xl space-y-4 p-6"><h1 className="text-xl font-bold">我的收入</h1><p role="status">{error.message}</p><a className="underline" href={`${prefix}/book`}>返回人員／會員首頁</a></section>;
  }
  return <section className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
    <a className="inline-flex min-h-11 items-center underline" href={`${prefix}/book`}>返回人員／會員首頁</a>
    <h1 className="text-2xl font-bold">我的收入</h1>
    <form action={`${prefix}/book/income`} className="flex flex-wrap items-end gap-3">
      <label>查詢月份<input className="mt-1 block min-h-11 rounded border px-3" type="month" name="month" defaultValue={month} min="2000-01" max="2099-12" required/></label>
      <button className="min-h-11 rounded bg-primary-700 px-4 text-white">查詢</button>
    </form>
    {!report.confirmed ? <p role="status" className="rounded-lg bg-earth-50 p-4">尚未結算。店長確認本月金額後，才會顯示收入明細；目前不代表收入為 0。</p> : <>
      <p className="text-sm text-earth-600">{month} · 店長已確認 · {formatTWDateTime(new Date(report.confirmedAt))}</p>
      {report.pending && <p role="status" className="rounded-lg bg-amber-50 p-4">調整待確認。目前保留上次已確認金額，待店長確認修正版後更新。</p>}
      <p className="text-sm text-earth-600">「店家已登錄付款」為店家登錄狀態，不代表您已確認收款；有疑問請洽店長。</p>
      {!report.lines.length && <p className="rounded-lg border p-4">本月尚無本人的已確認收入項目。</p>}
      {(["FEE","PROFIT"] as const).map(kind => {
        const lines = report.lines.filter(line => line.kind === kind);
        if (!lines.length) return null;
        const {total,paid,remaining,overpaid} = summarizePersonalIncome(lines);
        return <section key={kind} className="space-y-3 rounded-xl border border-earth-200 bg-white p-4">
          <h2 className="text-lg font-bold">{kind === "FEE" ? "我的授課費" : "我的店長利潤"}</h2>
          <p>已確認應付 {money(total)}</p><p>店家已登錄付款 {money(paid)}</p>
          <p className="font-medium">剩餘未付 {money(remaining)}</p>
          {overpaid!==null&&overpaid>0&&<p className="text-sm text-amber-800">溢付待核對 {money(overpaid)}，請洽店長。</p>}
          {remaining===0&&overpaid===0&&<p className="text-sm text-primary-700">{total===0?"無需付款":"店家已登錄全額付款"}</p>}
          {lines.map((line,index)=><details key={index} className="border-t py-3">
            <summary className="min-h-11 cursor-pointer">{line.label} · {money(line.amount)}</summary>
            <p className="mt-2 text-sm">{formatTWDateTime(new Date(line.date))}</p>
            <p className="text-sm">店家已登錄付款 {money(line.paid)}</p>
            {line.amount!==null&&line.paid!==null&&line.paid>line.amount&&<p className="text-sm text-amber-800">登錄付款超過已確認應付，請洽店長核對。</p>}
            {line.payments.map((payment,i)=><p key={i} className="mt-2 text-sm">{formatTWDateTime(new Date(payment.date))} · {money(payment.amount)} · {payment.voided ? "已更正，不計入付款" : "店家已登錄付款"}</p>)}
          </details>)}
        </section>;
      })}
    </>}
  </section>;
}
