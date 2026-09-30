import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, ROLE_LABELS } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { listOperationAudits, type OperationModule } from "@/server/services/operation-audit";
import { OperationAuditFilters } from "./operation-audit-filters";

const MODULE_LABELS: Record<OperationModule, string> = {
  STEAM: "蒸足",
  SPA: "SPA",
  COURSE: "課程",
  SHARED: "共用",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "新增",
  UPDATE: "修改",
  DELETE: "刪除",
  VIEW_CROSS_STORE: "跨店查看",
};

function dateDaysAgo(days: number) {
  return toLocalDateStr(new Date(Date.now() - days * 86_400_000));
}

function jsonText(value: unknown) {
  return value == null ? "—" : JSON.stringify(value, null, 2);
}

export default async function OperationAuditsPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    actor?: string;
    module?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "audit.read"))) notFound();

  const params = await searchParams;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateFrom = datePattern.test(params.dateFrom ?? "") ? params.dateFrom! : dateDaysAgo(6);
  const dateTo = datePattern.test(params.dateTo ?? "") ? params.dateTo! : toLocalDateStr();
  const from = dayRange(dateFrom).start;
  const to = dayRange(dateTo).end;
  const moduleFilter = Object.hasOwn(MODULE_LABELS, params.module ?? "")
    ? params.module as OperationModule
    : undefined;
  const page = Math.max(Number(params.page ?? 1) || 1, 1);

  const activeStoreId = await getActiveStoreForRead(user);
  const viewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(activeStoreId, viewContext);
  const result = await listOperationAudits({
    storeId,
    actorUserId: params.actor || undefined,
    module: moduleFilter,
    keyword: params.q,
    dateFrom: from,
    dateTo: to,
    page,
    pageSize: 50,
  });
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
    if (params.actor) query.set("actor", params.actor);
    if (moduleFilter) query.set("module", moduleFilter);
    if (params.q) query.set("q", params.q);
    query.set("page", String(nextPage));
    return `/dashboard/operation-audits?${query.toString()}`;
  };

  return (
    <PageShell>
      <PageHeader title="操作紀錄" subtitle="查詢本店的資料異動與跨店查看紀錄；紀錄僅供查閱，不能修改或刪除" />

      <OperationAuditFilters
        actors={result.actors}
        cacheKey={`operation-audit-filters:${storeId ?? "all"}`}
        defaults={{ dateFrom, dateTo, actor: params.actor ?? "", module: moduleFilter ?? "", q: params.q ?? "" }}
        hasExplicitFilters={hasExplicitFilters}
      />

      <div className="overflow-hidden rounded-2xl border border-earth-200 bg-white">
        <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2 text-xs text-earth-600">
          <span>共 {result.total} 筆</span><span>第 {result.page}／{totalPages} 頁</span>
        </div>
        {result.items.length === 0 ? (
          <div className="px-6 py-14 text-center text-earth-500">指定期間尚無操作紀錄</div>
        ) : (
          <div className="divide-y divide-earth-100">
            {result.items.map((item) => (
              <details key={item.id} className="group px-3 py-2 open:bg-earth-50/60">
                <summary className="grid cursor-pointer list-none gap-1.5 text-sm md:grid-cols-[145px_105px_72px_1fr_105px] md:items-center">
                  <time className="tabular-nums text-earth-600">{item.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}</time>
                  <span className="truncate font-medium text-earth-900">{item.actorNameSnapshot ?? item.actor.name}</span>
                  <span className="w-fit rounded-full bg-primary-50 px-1.5 py-0.5 text-xs text-primary-800">{MODULE_LABELS[item.module as OperationModule] ?? item.module ?? "系統"}</span>
                  <span className="min-w-0 truncate text-earth-800">{item.summary ?? `${item.targetType} ${ACTION_LABELS[item.action] ?? item.action}`}</span>
                  <span className="truncate text-xs text-earth-500 md:text-right">{item.storeId ? storeNames.get(item.storeId) ?? "本店" : "系統"} · 詳情</span>
                </summary>
                <div className="mt-2 grid gap-2 border-t border-earth-100 pt-2 text-sm md:grid-cols-2">
                  <div><span className="text-earth-500">動作：</span>{ACTION_LABELS[item.action] ?? item.action}</div>
                  <div><span className="text-earth-500">身分：</span>{ROLE_LABELS[item.actor.role] ?? item.actor.role}</div>
                  <div className="md:col-span-2"><span className="text-earth-500">資料：</span>{item.targetType} · {item.targetId}</div>
                  <div><p className="mb-1 font-medium text-earth-700">異動前</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-earth-100 p-2 text-xs">{jsonText(item.beforeJson)}</pre></div>
                  <div><p className="mb-1 font-medium text-earth-700">異動後</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-earth-100 p-2 text-xs">{jsonText(item.afterJson)}</pre></div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <nav className="flex items-center justify-end gap-2" aria-label="操作紀錄分頁">
        {result.page > 1 ? <Link className="rounded-lg border border-earth-200 bg-white px-4 py-2 text-sm" href={pageHref(result.page - 1)}>上一頁</Link> : null}
        {result.page < totalPages ? <Link className="rounded-lg border border-earth-200 bg-white px-4 py-2 text-sm" href={pageHref(result.page + 1)}>下一頁</Link> : null}
      </nav>
    </PageShell>
  );
}
