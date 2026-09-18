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
import { CourseTodoList } from "../home";
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
    return <PageShell><PageHeader title="全部待處理" actions={<Link href="/dashboard">返回首頁</Link>}/>{result ? <><CourseTodoList result={result} showAll={false}/><nav className="mt-3 flex gap-4 text-sm">{page > 1 && <Link href={`/dashboard/courses/todos?page=${page - 1}`}>上一頁</Link>}{page * 30 < result.total && <Link href={`/dashboard/courses/todos?page=${page + 1}`}>下一頁</Link>}</nav></> : <><p role="alert">待辦讀取失敗，尚無法確認數量。</p><HomeRetry /></>}</PageShell>;
}
