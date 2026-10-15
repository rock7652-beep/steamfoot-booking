import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireCourseStore } from "@/lib/industry-module-server";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCourseHomeTodos } from "@/server/queries/course-home";
import { CourseTodoList } from "../todo-list";
import { courseHomeAccess } from "@/server/queries/course-home-access";
import { HomeRetry } from "../home-controls";
export default async function CourseTodos({ searchParams }: {
    searchParams: Promise<{
        page?: string;
    }>;
}) {
    const user = await getCurrentUser();
    if (!user || !(await Promise.all((["booking.read", "transaction.read", "customer.read"] as const).map(p => checkPermission(user.role, user.staffId, p)))).some(Boolean))
        notFound();
    const storeId = await getActiveStoreForRead(user);
    if (!storeId)
        notFound();
    await requireCourseStore(storeId);
    const params = await searchParams;
    const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
    const a = await courseHomeAccess(user, storeId);
    const result = await getCourseHomeTodos(storeId, { ...a.todos, followUp: a.todos.followUp && await hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER) }, new Date(), (page - 1) * 30, 30).catch(() => null);
    return <PageShell><PageHeader title="全部待處理" actions={<Link href="/dashboard">返回首頁</Link>}/>{result ? <><CourseTodoList result={result} showAll={false} offset={(page - 1) * 30}/><nav aria-label="待辦分頁" className="mt-3 flex flex-wrap items-center gap-3 text-sm">{page > 1 && <Link className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3" href={`/dashboard/courses/todos?page=${page - 1}`}>上一頁</Link>}{page * 30 < result.total && <Link href={`/dashboard/courses/todos?page=${page + 1}`}>下一頁</Link>}</nav></> : <><p role="alert">待辦讀取失敗，尚無法確認數量。</p><HomeRetry /></>}</PageShell>;
}
