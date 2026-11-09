import { resolveOperationAuditScope } from "@/server/services/store-operation-audit-access";
import { StoreOperationAuditView } from "./store-operation-audit-view";
import { auditListDescription } from "@/lib/audit-presentation";
import { resolveAuditPresentation } from "@/server/services/audit-presentation";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, isStaffRole } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { listOperationAudits, type OperationModule } from "@/server/services/operation-audit";
import { LoginAuditView } from "./login-audit-view";
import { AuditAutoRefresh } from "./audit-auto-refresh";
import { AuditListState } from "./audit-list-state";
import { auditTimeLabel, auditReturnQuery } from "./audit-list-format";
import { OperationAuditFilters } from "./operation-audit-filters";
import { OperationAuditRow, auditListColumns } from "./operation-audit-row";

const MODULE_LABELS: Record<OperationModule, string> = {
  STEAM: "蒸足",
  SPA: "SPA",
  MUSIC: "音樂教室",
  FITNESS: "運動教室",
  COURSE: "課程（歷史）",
  SHARED: "共用店務",
  SYSTEM: "系統管理",
};

function dateDaysAgo(days: number) {
  return toLocalDateStr(new Date(Date.now() - days * 86_400_000));
}

export default async function OperationAuditsPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    dateMode?: string;
    actor?: string;
    module?: string;
    q?: string;
    page?: string;
    tab?: string;
    outcome?: string;
    login?: string;
    returnTo?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const scope = await resolveOperationAuditScope(user);
  if (!scope) notFound();
  if (!isStaffRole(user.role)) redirect("/dashboard");
  if (!(await checkPermission(user.role, user.staffId, scope.hq ? "audit.read" : "store.audit.read"))) notFound();

  const params = await searchParams;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateFrom = datePattern.test(params.dateFrom ?? "") ? params.dateFrom! : dateDaysAgo(6);
  const today = toLocalDateStr();
  const followToday = params.dateMode === "today" || (params.dateMode !== "fixed" && (!params.dateTo || params.dateTo === today));
  const dateTo = followToday ? today : datePattern.test(params.dateTo ?? "") ? params.dateTo! : today;
  const dateMode = followToday ? "today" : "fixed";
  const from = dayRange(dateFrom).start;
  const to = dayRange(dateTo).end;
  const moduleFilter = Object.hasOwn(MODULE_LABELS, params.module ?? "")
    ? params.module as OperationModule
    : undefined;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;

  if (!scope.hq) {
    // Login/session filters cannot be used as an oracle in store view.
    if (params.tab === "login" || params.login || params.outcome) notFound();
    return <StoreOperationAuditView storeId={scope.storeId} dateFrom={dateFrom} dateTo={dateTo} page={page} />;
  }
  const activeStoreId = await getActiveStoreForRead(user);
  const viewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(activeStoreId, viewContext);
  if (params.tab === "login") return <LoginAuditView storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} from={from} to={to} actor={params.actor} outcome={params.outcome} login={params.login} page={page} viewerKey={user.id} returnTo={params.returnTo} followToday={followToday} />;
  const pendingCount = await prisma.operationAuditOutbox.count({
    where: { deliveredAt: null, ...(storeId ? { payload: { path: ["storeId"], equals: storeId } } : {}) },
  });
  const result = await listOperationAudits({
    storeId,
    actorUserId: params.actor || undefined,
    loginRecordId: params.login || undefined,
    module: moduleFilter,
    keyword: params.q,
    dateFrom: from,
    dateTo: to,
    page,
    pageSize: 50,
  });
  const presentation = await resolveAuditPresentation(result.items, { hq: user.role === "ADMIN" });
  const storeIds = Array.from(new Set(result.items.flatMap((item) => item.storeId ? [item.storeId] : [])));
  const stores = storeIds.length
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : [];
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const hasExplicitFilters = [params.dateFrom, params.dateTo, params.actor, params.module, params.q]
    .some((value) => typeof value === "string");

  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    query.set("dateFrom", dateFrom);
    query.set("dateTo", dateTo);
    query.set("dateMode", dateMode);
    if (params.actor) query.set("actor", params.actor);
    if (moduleFilter) query.set("module", moduleFilter);
    if (params.q) query.set("q", params.q);
    if (params.login) query.set("login", params.login);
    query.set("page", String(nextPage));
    return `/dashboard/operation-audits?${query.toString()}`;
  };

  const backHref = auditReturnQuery(params.returnTo);
  const returnQuery = pageHref(result.page).split("?")[1];
  // Server read completion timestamp; this async component runs per authorized request.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const columns = auditListColumns(!storeId);
  return (
    <PageShell compact>
      <AuditAutoRefresh key={`${user.id}:${storeId ?? "all"}:operation`} renderedAt={renderedAt} dateTo={dateTo} followToday={followToday} page={page}>
      <nav className="flex gap-2 text-sm" aria-label="稽核分類">
        <Link className="rounded-lg bg-primary-50 p-3" href={`/dashboard/operation-audits?dateFrom=${dateFrom}&dateTo=${dateTo}&dateMode=${dateMode}`}>操作紀錄</Link>
        <Link className="rounded-lg border border-earth-200 p-3" href={`/dashboard/operation-audits?tab=login&dateFrom=${dateFrom}&dateTo=${dateTo}&dateMode=${dateMode}`}>登入紀錄</Link>
      </nav>
      {backHref ? <Link className="w-fit min-h-11 py-3 text-sm text-primary-800 underline" href={backHref}>← 返回紀錄列表</Link> : null}
      {pendingCount > 0 ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {storeId ? "本店" : "目前"}有 {pendingCount} 筆操作紀錄補記中，完成後會顯示於清單。
      </p> : null}
      {params.login ? <p className="text-sm text-earth-600">正在查看指定登入的操作 · <Link href="/dashboard/operation-audits">清除</Link></p> : null}

      <OperationAuditFilters
        followToday={followToday}
        actors={result.actors}
        cacheKey={`operation-audit-filters:${user.id}:${storeId ?? "all"}`}
        defaults={{ dateFrom, dateTo, actor: params.actor ?? "", module: moduleFilter ?? "", q: params.q ?? "" }}
        hasExplicitFilters={hasExplicitFilters}
        loginRecordId={params.login}
        showModuleFilter
      />

      <AuditListState viewKey={`${user.id}:${storeId ?? "all"}:${returnQuery}`}><div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2 text-sm text-earth-600">
          <span>共 {result.total} 筆</span><span>第 {result.page}／{totalPages} 頁</span>
        </div>
        <div aria-hidden="true" className={`hidden gap-3 border-b border-earth-100 bg-earth-50/50 px-3 py-2 text-sm text-earth-500 ${storeId ? "@[720px]:grid" : "@[640px]:grid"} ${columns}`}>
          <span>時間</span><span>操作人</span><span>做了什麼</span>{!storeId ? <span>店家</span> : null}
        </div>
        {result.items.length === 0 ? (
          <div className="px-6 py-14 text-center text-earth-500">指定期間尚無操作紀錄</div>
        ) : (
          <div className="divide-y divide-earth-100">
            {result.items.map((item, index) => (
              <OperationAuditRow key={item.id} id={item.id}
                time={<time dateTime={item.createdAt.toISOString()}>{auditTimeLabel(item.createdAt, result.items[index - 1]?.createdAt)}</time>}
                actor={item.loginRecordId ? <Link className="inline-flex min-h-11 items-center underline decoration-earth-200 underline-offset-4" aria-label={`查看${item.actorNameSnapshot ?? item.actor.name}當次登入`} href={`/dashboard/operation-audits?tab=login&login=${encodeURIComponent(item.loginRecordId)}&dateFrom=${dateFrom}&dateTo=${dateTo}&returnTo=${encodeURIComponent(returnQuery)}`}>{item.source === "SYSTEM" ? `系統（${item.actorNameSnapshot ?? item.actor.name}觸發）` : item.actorNameSnapshot ?? item.actor.name}</Link> : item.source === "SYSTEM" ? `系統（${item.actorNameSnapshot ?? item.actor.name}觸發）` : item.actorNameSnapshot ?? item.actor.name}
                description={auditListDescription(item, presentation.get(item.id)?.target, presentation.get(item.id)?.references, !storeId && item.storeId ? storeNames.get(item.storeId) : undefined)}
                storeName={!storeId ? item.storeId ? storeNames.get(item.storeId) ?? "已封存門市" : "系統" : undefined}
              />
            ))}
          </div>
        )}
      </div></AuditListState>

      <nav className="flex items-center justify-end gap-2" aria-label="操作紀錄分頁">
        {result.page > 1 ? <Link className="rounded-lg border border-earth-200 bg-white px-4 py-2 text-sm" href={pageHref(result.page - 1)}>上一頁</Link> : null}
        {result.page < totalPages ? <Link className="rounded-lg border border-earth-200 bg-white px-4 py-2 text-sm" href={pageHref(result.page + 1)}>下一頁</Link> : null}
      </nav>
      </AuditAutoRefresh>
    </PageShell>
  );
}
