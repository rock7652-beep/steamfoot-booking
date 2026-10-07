import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { auditRoleLabel } from "@/lib/audit-presentation";
import { AuditListState } from "./audit-list-state";
import { auditTimeLabel, auditReturnQuery } from "./audit-list-format";
import type { Prisma } from "@prisma/client";

const format = (value: Date | null) => value ? value.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "尚無使用紀錄";

export async function LoginAuditView(input: {
  storeId: string | null; dateFrom: string; dateTo: string; from: Date; to: Date;
  actor?: string; outcome?: string; login?: string; page: number; viewerKey?: string; returnTo?: string;
}) {
  // Caller enforced staff + audit.read; non-HQ scope is always its own store.
  const where: Prisma.StaffLoginRecordWhereInput = {
    ...(input.storeId ? { storeId: input.storeId } : {}),
    ...(input.actor ? { actorUserId: input.actor } : {}),
    ...(["SUCCESS", "FAILED"].includes(input.outcome ?? "") ? { outcome: input.outcome } : {}),
    ...(input.login ? { id: input.login } : { createdAt: { gte: input.from, lte: input.to } }),
  };
  // HQ staff logins have no home store. Permit a scoped detail only when that
  // login has a recorded operation in this store, without exposing other operations.
  if (input.login && input.storeId) {
    const linked = await prisma.auditLog.findFirst({ where: { storeId: input.storeId, loginRecordId: input.login }, select: { id: true } });
    if (linked) {
      delete where.storeId;
      where.OR = [{ storeId: input.storeId }, { storeId: null, actorRoleSnapshot: "ADMIN" }];
    }
  }
  const [actors, total, rows] = await Promise.all([
    prisma.staffLoginRecord.findMany({
      where: { ...(input.storeId ? { storeId: input.storeId } : {}), createdAt: { gte: input.from, lte: input.to }, actorUserId: { not: null } },
      distinct: ["actorUserId"], select: { actorUserId: true, actorNameSnapshot: true }, take: 500,
    }),
    prisma.staffLoginRecord.count({ where }),
    prisma.staffLoginRecord.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * 50, take: 50 }),
  ]);
  const stores = await prisma.store.findMany({ where: { id: { in: [...new Set(rows.flatMap(row => row.storeId ? [row.storeId] : []))] } }, select: { id: true, name: true } });
  const names = new Map(stores.map(store => [store.id, store.name]));
  const pages = Math.max(1, Math.ceil(total / 50));
  const href = (page: number) => {
    const q = new URLSearchParams({ tab: "login", dateFrom: input.dateFrom, dateTo: input.dateTo, page: String(page) });
    if (input.actor) q.set("actor", input.actor);
    if (input.outcome) q.set("outcome", input.outcome);
    if (input.login) q.set("login", input.login);
    if (input.returnTo) q.set("returnTo", input.returnTo);
    return `/dashboard/operation-audits?${q}`;
  };
  const backHref = auditReturnQuery(input.returnTo);
  const returnParams = new URLSearchParams(href(input.page).split("?")[1]);
  returnParams.delete("returnTo");
  const returnQuery = returnParams.toString();
  const columns = input.storeId ? "@[720px]:grid-cols-[96px_160px_70px_minmax(0,1fr)_20px]" : "@[900px]:grid-cols-[96px_160px_70px_minmax(0,1fr)_150px_20px]";
  return <PageShell>
    <PageHeader title="操作與登入紀錄" compact />
    <nav className="flex gap-2 text-sm" aria-label="稽核分類">
      <Link className="rounded-lg border border-earth-200 p-3" href={`/dashboard/operation-audits?dateFrom=${input.dateFrom}&dateTo=${input.dateTo}`}>操作紀錄</Link>
      <Link className="rounded-lg bg-primary-50 p-3" href={`/dashboard/operation-audits?tab=login&dateFrom=${input.dateFrom}&dateTo=${input.dateTo}`}>登入紀錄</Link>
    </nav>
    {backHref ? <Link className="w-fit min-h-11 py-3 text-sm text-primary-800 underline" href={backHref}>← 返回紀錄列表</Link> : null}
    <form className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm" method="get">
      <input type="hidden" name="tab" value="login" />
      {input.login ? <input type="hidden" name="login" value={input.login} /> : null}
      {input.returnTo ? <input type="hidden" name="returnTo" value={input.returnTo} /> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-earth-600">日期</span>
        <input aria-label="開始日期" className="h-11 min-w-0 w-[145px] rounded-lg border border-earth-200 bg-white px-2" type="date" name="dateFrom" defaultValue={input.dateFrom} />
        <span className="text-earth-400">至</span>
        <input aria-label="結束日期" className="h-11 min-w-0 w-[145px] rounded-lg border border-earth-200 bg-white px-2" type="date" name="dateTo" defaultValue={input.dateTo} />
      </div>
      <select aria-label="人員" className="h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-2 sm:w-32" name="actor" defaultValue={input.actor ?? ""}><option value="">全部人員</option>{actors.map(actor => <option key={actor.actorUserId!} value={actor.actorUserId!}>{actor.actorNameSnapshot ?? "未識別"}</option>)}</select>
      <select aria-label="結果" className="h-11 rounded-lg border border-earth-200 bg-white px-2" name="outcome" defaultValue={input.outcome ?? ""}><option value="">全部結果</option><option value="SUCCESS">成功</option><option value="FAILED">失敗</option></select>
      <button className="min-h-11 rounded-lg border border-earth-200 bg-white px-2" type="submit">查詢</button><Link className="min-h-11 px-2 py-3 text-earth-600" href="/dashboard/operation-audits?tab=login">清除</Link>
    </form>
    <AuditListState viewKey={`${input.viewerKey ?? ""}:${input.storeId ?? "all"}:${returnQuery}`}>
    <div className="min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white">
      <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2 text-sm text-earth-500"><span>共 {total} 筆</span><span>第 {input.page}／{pages} 頁</span></div>
      <div aria-hidden="true" className={`hidden gap-3 border-b border-earth-100 bg-earth-50/50 px-3 py-2 text-sm text-earth-500 ${input.storeId ? "@[720px]:grid" : "@[900px]:grid"} ${columns}`}><span>時間</span><span>人員</span><span>結果</span><span>裝置</span>{!input.storeId ? <span>店家</span> : null}<span /></div>
      <div className="divide-y divide-earth-100">
      {!rows.length ? <p className="p-6 text-earth-500">沒有符合條件的資料</p> : rows.map((row, index) => <details data-record={row.id} className="group min-w-0 px-3 py-1 open:bg-earth-50/60" key={row.id}>
        <summary className={`grid min-h-11 cursor-pointer list-none grid-cols-[96px_minmax(0,1fr)_20px] items-center gap-x-3 gap-y-1 py-2 text-sm [&::-webkit-details-marker]:hidden ${columns}`}>
          <time dateTime={row.createdAt.toISOString()} className="col-start-1 row-start-1 tabular-nums text-earth-500">{auditTimeLabel(row.createdAt, rows[index - 1]?.createdAt)}</time>
          <span className="col-start-2 row-start-1 min-w-0 break-words font-medium text-earth-900">{row.actorNameSnapshot ?? "未識別帳號"}</span>
          <span className={`col-start-1 row-start-2 w-fit rounded-full px-2 py-0.5 ${row.outcome === "SUCCESS" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"} ${input.storeId ? "@[720px]:col-start-3 @[720px]:row-start-1" : "@[900px]:col-start-3 @[900px]:row-start-1"}`}>{row.outcome === "SUCCESS" ? "成功" : "失敗"}</span>
          <span className={`col-start-2 row-start-2 min-w-0 break-words text-earth-600 ${input.storeId ? "@[720px]:col-start-4 @[720px]:row-start-1" : "@[900px]:col-start-4 @[900px]:row-start-1"}`}>{row.device}</span>
          {!input.storeId ? <span className="col-span-2 min-w-0 break-words text-earth-500 @[900px]:col-span-1 @[900px]:col-start-5 @[900px]:row-start-1">{row.storeId ? names.get(row.storeId) ?? "已封存門市" : row.actorRoleSnapshot === "ADMIN" ? "總部" : "未識別門市"}</span> : null}
          <span aria-hidden="true" className={`col-start-3 row-start-1 text-center text-earth-400 transition-transform group-open:rotate-90 ${input.storeId ? "@[720px]:col-start-5" : "@[900px]:col-start-6"}`}>›</span>
        </summary>
        <div className="mb-2 mt-1 grid gap-x-6 gap-y-2 border-t border-earth-100 pt-3 text-sm md:grid-cols-2">
          <p>登入時間：{format(row.createdAt)}</p><p>最近使用：{format(row.lastUsedAt)}</p>
          <p>當時身分：{auditRoleLabel(row.actorRoleSnapshot)}{input.storeId && !row.storeId && row.actorRoleSnapshot === "ADMIN" ? " · 總部" : ""}</p>
          {row.reason ? <p>原因：{row.reason}</p> : null}
          {row.outcome === "SUCCESS" ? <Link className="w-fit min-h-11 py-3 text-primary-800 underline" href={`/dashboard/operation-audits?login=${encodeURIComponent(row.id)}&dateFrom=${input.dateFrom}&dateTo=${input.dateTo}&returnTo=${encodeURIComponent(returnQuery)}`}>查看這次操作</Link> : null}
        </div>
      </details>)}
      </div>
    </div>
    </AuditListState>
    <details className="text-sm text-earth-500"><summary className="w-fit min-h-11 cursor-pointer py-3">紀錄說明</summary><p>裝置資訊僅供參考；舊登入不回補，最近使用時間約每 5 分鐘更新。</p></details>
    <nav className="flex justify-end gap-2" aria-label="登入紀錄分頁">
      {input.page > 1 ? <Link className="p-3" href={href(input.page - 1)}>上一頁</Link> : null}
      {input.page < pages ? <Link className="p-3" href={href(input.page + 1)}>下一頁</Link> : null}
    </nav>
  </PageShell>;
}
