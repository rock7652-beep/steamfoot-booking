import { DashboardLink as Link } from "@/components/dashboard-link";
import { formatTWDateTime } from "@/lib/date-utils";
import type { getCourseHomeTodos } from "@/server/queries/course-home";

export function CourseTodoList({ result, showAll = true, music = false, offset = 0 }: {
  result: Awaited<ReturnType<typeof getCourseHomeTodos>>;
  showAll?: boolean;
  music?: boolean;
  offset?: number;
}) {
  const labels: Record<string, string> = {
    payment: "付款待核帳", attendance: "課後待點名", followUp: music ? "學員跟進" : "顧客跟進",
  };
  const actions: Record<string, string> = { payment: "核對付款", attendance: "查看／點名", followUp: "查看跟進" };
  const actionClass = "inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-800 hover:bg-primary-50";
  return <>
    <p className="text-sm text-earth-600">共 {result.total} 件{result.items.length > 0 && ` · 顯示第 ${offset + 1}–${offset + result.items.length} 件`}，依時間由早到晚。</p>
    <ul className="divide-y divide-earth-100">
      {result.items.map(item => <li key={`${item.kind}:${item.id}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div className="min-w-0 flex-1 basis-48 break-words">
          <p className="font-semibold text-primary-900">{item.label}</p>
          <p className="flex flex-wrap gap-x-2 text-earth-600"><span className="text-amber-900">{labels[item.kind] ?? "待處理"}</span><span>{item.kind === "attendance" ? "上課" : "建立"} {formatTWDateTime(new Date(item.date))}</span></p>
        </div>
        <Link href={item.href} prefetch={false} className={actionClass} aria-label={`${actions[item.kind] ?? "查看明細"}：${item.label}，${formatTWDateTime(new Date(item.date))}`}>{actions[item.kind] ?? "查看明細"} →</Link>
      </li>)}
    </ul>
    {!result.items.length && <p className="py-3 text-sm">{result.total ? "此頁已無待辦，請返回上一頁或首頁。" : "目前沒有你可處理的待辦。"}</p>}
    {showAll && result.total > 0 && <Link className={actionClass} href="/dashboard/courses/todos">全部待處理 →</Link>}
  </>;
}
