import { IncomeMonthFilter } from "@/components/income-month-filter";
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
    <IncomeMonthFilter month={month}/>
    {!report.confirmed ? <p role="status" className="rounded-lg bg-earth-50 p-4">本月收入待店長確認。</p> : <>
      <p className="text-sm text-earth-600">{month} · 店長已確認 · {formatTWDateTime(new Date(report.confirmedAt))}</p>
      {report.pending && <p role="status" className="rounded-lg bg-amber-50 p-4">金額調整中，以下為上次確認的金額。</p>}
      {!!report.lines.length&&<div className="rounded-xl bg-primary-50 p-5"><p className="text-sm text-earth-600">應領合計</p><p className="mt-1 text-3xl font-bold tabular-nums">{money(summarizePersonalIncome(report.lines).total)}</p></div>}
      {!report.lines.length && <p className="rounded-lg border p-4">本月尚無本人的已確認收入項目。</p>}
      {(["FEE","PROFIT"] as const).map(kind => {
        const lines = report.lines.filter(line => line.kind === kind);
        if (!lines.length) return null;
        const {total} = summarizePersonalIncome(lines);
        return <section key={kind} className="space-y-3 rounded-xl border border-earth-200 bg-white p-4">
          <h2 className="text-lg font-bold">{kind === "FEE" ? "我的授課費" : "我的店長利潤"}</h2>
          <p className="text-xl font-semibold tabular-nums">{money(total)}</p>
          {lines.map((line,index)=><details key={index} className="border-t py-3">
            <summary className="min-h-11 cursor-pointer">{line.label} · {money(line.amount)}</summary>
            <p className="mt-2 text-sm">{formatTWDateTime(new Date(line.date))}</p>
          </details>)}
        </section>;
      })}
      {report.lines.some(line=>line.payments.length>0)&&<details className="rounded-lg border border-earth-200 px-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm">歷史付款紀錄</summary><p className="pb-2 text-xs text-earth-500">店家登記紀錄，請以實際入帳為準。</p>{report.lines.filter(line=>line.payments.length>0).map((line,index)=><div key={index} className="border-t py-3 text-sm"><p>{line.label}</p>{line.payments.map((payment,i)=><p key={i} className="py-1 text-earth-600">{formatTWDateTime(new Date(payment.date))} · {money(payment.amount)} · {payment.voided?"已更正":"已登記"}</p>)}</div>)}</details>}
    </>}
  </section>;
}
