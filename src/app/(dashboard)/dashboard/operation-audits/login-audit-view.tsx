import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { auditRoleLabel } from "@/lib/audit-presentation";
import type { Prisma } from "@prisma/client";

const format = (value: Date | null) => value ? value.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "尚無使用紀錄";

export async function LoginAuditView(input: {
  storeId: string | null; dateFrom: string; dateTo: string; from: Date; to: Date;
  actor?: string; outcome?: string; login?: string; page: number;
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
    return `/dashboard/operation-audits?${q}`;
  };
  return <PageShell>
    <PageHeader title="操作與登入紀錄" subtitle="裝置資訊僅供參考；登入時間與最近使用時間分開記錄" />
    <nav className="flex gap-2 text-sm" aria-label="稽核分類">
      <Link className="rounded-lg border border-earth-200 p-3" href={`/dashboard/operation-audits?dateFrom=${input.dateFrom}&dateTo=${input.dateTo}`}>操作紀錄</Link>
      <Link className="rounded-lg bg-primary-50 p-3" href={`/dashboard/operation-audits?tab=login&dateFrom=${input.dateFrom}&dateTo=${input.dateTo}`}>登入紀錄</Link>
    </nav>
    <form className="grid gap-2 rounded-xl border border-earth-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-5" method="get">
      <input type="hidden" name="tab" value="login" />
      <label className="text-sm">開始日期<input className="mt-1 h-11 w-full min-w-0 rounded-lg border px-2" type="date" name="dateFrom" defaultValue={input.dateFrom} /></label>
      <label className="text-sm">結束日期<input className="mt-1 h-11 w-full min-w-0 rounded-lg border px-2" type="date" name="dateTo" defaultValue={input.dateTo} /></label>
      <label className="text-sm">人員<select className="mt-1 h-11 w-full min-w-0 rounded-lg border px-2" name="actor" defaultValue={input.actor ?? ""}><option value="">全部人員</option>{actors.map(actor => <option key={actor.actorUserId!} value={actor.actorUserId!}>{actor.actorNameSnapshot ?? "未識別"}</option>)}</select></label>
      <label className="text-sm">結果<select className="mt-1 h-11 w-full min-w-0 rounded-lg border px-2" name="outcome" defaultValue={input.outcome ?? ""}><option value="">全部結果</option><option value="SUCCESS">成功</option><option value="FAILED">失敗</option></select></label>
      <div className="flex items-end gap-2"><button className="min-h-11 rounded-lg border px-4" type="submit">查詢</button><Link className="p-3" href="/dashboard/operation-audits?tab=login">清除</Link></div>
    </form>
    <p className="text-sm text-earth-600">共 {total} 筆 · 第 {input.page}／{pages} 頁 · 舊登入不回補；最近使用時間約每 5 分鐘更新</p>
    <div className="min-w-0 divide-y divide-earth-100 rounded-xl border border-earth-200 bg-white">
      {!rows.length ? <p className="p-6 text-earth-600">沒有符合條件的資料</p> : rows.map(row => <details className="min-w-0 p-3" key={row.id}>
        <summary className="grid cursor-pointer gap-2 text-sm lg:grid-cols-[160px_1fr_1fr_80px]">
          <time>{format(row.createdAt)}</time><span className="break-words">{row.actorNameSnapshot ?? "未識別帳號"}</span><span className="break-words">{row.storeId ? names.get(row.storeId) ?? "已封存門市" : row.actorRoleSnapshot === "ADMIN" ? "總部" : "未識別門市"}</span><span>{row.outcome === "SUCCESS" ? "成功" : "失敗"}</span>
        </summary>
        <div className="mt-3 grid gap-2 border-t pt-3 text-sm md:grid-cols-2">
          <p>當時身分：{auditRoleLabel(row.actorRoleSnapshot)}</p>
          <p>裝置：{row.device}</p><p>最近使用：{format(row.lastUsedAt)}</p>
          {row.reason ? <p>原因：{row.reason}</p> : null}
          {row.outcome === "SUCCESS" ? <Link className="w-fit p-3 underline" href={`/dashboard/operation-audits?login=${encodeURIComponent(row.id)}&dateFrom=${input.dateFrom}&dateTo=${input.dateTo}`}>查看這次操作（所選期間）</Link> : null}
        </div>
      </details>)}
    </div>
    <nav className="flex justify-end gap-2" aria-label="登入紀錄分頁">
      {input.page > 1 ? <Link className="p-3" href={href(input.page - 1)}>上一頁</Link> : null}
      {input.page < pages ? <Link className="p-3" href={href(input.page + 1)}>下一頁</Link> : null}
    </nav>
  </PageShell>;
}
