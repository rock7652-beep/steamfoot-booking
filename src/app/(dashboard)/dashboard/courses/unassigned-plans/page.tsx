import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireCourseStore } from "@/lib/industry-module-server";
import { toLocalDateStr } from "@/lib/date-utils";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { courseCustomerStaffScope } from "@/server/queries/course-home";
import { getCourseUnassignedPlanPage } from "@/server/queries/course-unassigned-plans";
import { HomeRetry } from "../home-controls";

export default async function CourseUnassignedPlansPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await Promise.all((["customer.read", "wallet.read"] as const).map(permission => checkPermission(user.role, user.staffId, permission)))).every(Boolean)) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireCourseStore(storeId);
  const { page } = await searchParams;
  const result = await getCourseUnassignedPlanPage(storeId, courseCustomerStaffScope(user, storeId), Number(page ?? 1)).catch(() => null);
  return <PageShell>
    <PageHeader title="未指派方案" subtitle="站內待辦提醒，不會自動傳送 LINE。完成指派後，重新整理即會移出名單。" actions={<div className="flex flex-wrap gap-3"><Link href="/dashboard">返回首頁</Link><Link href="/dashboard/courses?view=settings&section=notifications">返回通知設定</Link></div>} />
    <details className="mb-4 rounded-xl border border-earth-200 bg-white p-4 text-sm text-earth-600">
      <summary className="min-h-11 cursor-pointer py-3">哪些顧客會列入？</summary>
      <p>本店可見範圍內，沒有個人／共用課程方案紀錄、沒有待核帳訂單，也沒有已核帳／退款或持卡預約紀錄的顧客。</p>
      <p className="mt-2">已到期、用完、結清的方案仍算曾指派，不列入此處。純教練帳號、停用帳號及已合併顧客亦排除。僅體驗、尚無正式方案的顧客可以列入；本名單不是欠款或必須購課名單。</p>
    </details>
    {result ? <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p>未指派方案：<strong>{result.total}</strong> 人</p><HomeRetry /></div>
      {result.rows.length ? <ul className="divide-y divide-earth-100 rounded-xl border border-earth-200 bg-white px-4">{result.rows.map(customer => <li key={customer.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0"><h2 className="break-words font-medium text-primary-900">{customer.name}</h2><p className="mt-1 text-sm text-earth-600">{customer.phoneLastFour ? `電話末四碼 ${customer.phoneLastFour}` : "未提供電話"} · {customer.staffName ?? "未指派直屬店長"}</p><p className="mt-1 text-xs text-earth-500">建檔日期 {toLocalDateStr(new Date(customer.createdAt))}</p></div>
        <Link prefetch={false} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-earth-200 px-3 text-sm text-primary-800" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(customer.id)}`}>查看顧客與方案 →</Link>
      </li>)}</ul> : <p className="rounded-xl border border-earth-200 bg-white p-6 text-sm">目前沒有符合條件的顧客。</p>}
      <nav aria-label="未指派方案名單分頁" className="mt-4 flex flex-wrap items-center gap-4 text-sm"><span>第 {result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))} 頁</span>{result.page > 1 && <Link className="min-h-11 py-3" href={`/dashboard/courses/unassigned-plans?page=${result.page - 1}`}>上一頁</Link>}{result.page * result.pageSize < result.total && <Link className="min-h-11 py-3" href={`/dashboard/courses/unassigned-plans?page=${result.page + 1}`}>下一頁</Link>}</nav>
    </> : <><p role="alert">名單讀取失敗，尚無法確認人數，請重新整理。</p><HomeRetry /></>}
  </PageShell>;
}
