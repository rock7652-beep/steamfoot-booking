import { CourseWorkReturnLink } from "@/components/course-work-return-link";
import { IncomeMonthFilter } from "@/components/income-month-filter";
import { PersonalIncomePanel } from "@/components/personal-income-panel";
import { coursePortalRoleCookie } from "@/lib/course-portal-role";
import { getCurrentUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { settlementMonth } from "@/lib/course-monthly-settlement";
import { formatTWDateTime, toLocalMonthStr } from "@/lib/date-utils";
import { getStoreContext } from "@/lib/store-context";
import { readMyCourseIncome } from "@/server/services/course-personal-income";

export const dynamic = "force-dynamic";

export default async function MyCourseIncome({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const parsed = settlementMonth.safeParse(params.month ?? toLocalMonthStr());
  if (!parsed.success) return <p className="p-6">月份格式不正確，請使用 YYYY-MM。</p>;
  const month = parsed.data;
  const [context, user] = await Promise.all([getStoreContext(), getCurrentUser()]);
  const prefix = context?.storeSlug ? `/s/${context.storeSlug}` : "";
  let report;
  try { report = await readMyCourseIncome(month); }
  catch (error) {
    if (!(error instanceof AppError) || error.code !== "FORBIDDEN") throw error;
    return <section className="mx-auto max-w-2xl space-y-4 p-6"><h1 className="text-xl font-bold">我的收入</h1><p role="status">{error.message}</p><a className="inline-flex min-h-11 items-center underline" href={`${prefix}/book`}>返回人員／會員首頁</a></section>;
  }
  return <section className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
    <header className="space-y-2">
      {user && context ? <CourseWorkReturnLink href={`${prefix}/book`} cookieName={coursePortalRoleCookie(user.id, context.storeId)} /> : <a className="inline-flex min-h-11 items-center underline" href={`${prefix}/book`}>返回首頁</a>}
      <h1 className="text-2xl font-bold">我的收入</h1>
      <IncomeMonthFilter month={month} />
    </header>
    {!report.confirmed ? <p role="status" className="rounded-xl bg-earth-50 p-4 text-sm">本月收入待店長確認。</p> : <>
      <p className="text-xs text-earth-600">店長已確認 · {formatTWDateTime(new Date(report.confirmedAt))}</p>
      {report.pending ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">金額調整中，應領金額為上次確認版本。</p> : null}
      <PersonalIncomePanel key={`${user?.id}:${context?.storeId}:${month}:${report.revision}`} lines={report.lines} />
    </>}
  </section>;
}
