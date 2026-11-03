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
import { CourseTodoList } from "./home";
import { courseHomeAccess } from "@/server/queries/course-home-access";
import { HomeRetry } from "./home-controls";
export async function CourseTodos({ searchParams,source }: {
    source?:{authorize:(storeId:string)=>Promise<unknown>;load:typeof getCourseHomeTodos;href:(value:string)=>string;readOnly?:boolean;service?:boolean};
    searchParams: Promise<{
        page?: string;dataScope?:string;
    }>;
}) {
    const href=source?.href??((value:string)=>value);
    const user = await getCurrentUser();
    if (!user || !(await Promise.all((["booking.read", "transaction.read", "customer.read"] as const).map(p => checkPermission(user.role, user.staffId, p)))).some(Boolean))
        notFound();
    const storeId = await getActiveStoreForRead(user);
    if (!storeId)
        notFound();
    if(source)await source.authorize(storeId);else await requireCourseStore(storeId);
    const params = await searchParams;
    const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
    const a = await courseHomeAccess(user, storeId);
    const result = await (source?.load??getCourseHomeTodos)(storeId, { ...a.todos,...(source?.readOnly?{payments:false,attendance:false,followUp:false}:{}), followUp: !source?.readOnly&& a.todos.followUp && await hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER) }, new Date(), (page - 1) * 30, 30,source?undefined:params.dataScope).catch(error => {console.error("[course-todos]",error instanceof Error?error.message:"read failed");return null;});
    return <PageShell><PageHeader title="全部待處理" actions={<Link href={href("/dashboard")}>返回首頁</Link>}/>{result ? <><CourseTodoList result={result} showAll={false} offset={(page-1)*30} service={source?.service}/><nav className="mt-3 flex gap-4 text-sm">{page > 1 && <Link href={href(`/dashboard/courses/todos?page=${page - 1}${params.dataScope==="legacy"?"&dataScope=legacy":""}`)}>上一頁</Link>}{page * 30 < result.total && <Link href={href(`/dashboard/courses/todos?page=${page + 1}${params.dataScope==="legacy"?"&dataScope=legacy":""}`)}>下一頁</Link>}</nav></> : <><p role="alert">待辦讀取失敗，尚無法確認數量。</p><HomeRetry /></>}</PageShell>;
}
