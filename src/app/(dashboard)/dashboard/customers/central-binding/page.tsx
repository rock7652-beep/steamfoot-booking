import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { prisma } from "@/lib/db";
import { listCentralBindingStatuses } from "@/server/queries/central-binding-status";
import type { CentralBindingStatus } from "@/server/services/central-binding-status";
import { InviteButton } from "./invite-button";

const statusCopy: Record<CentralBindingStatus, { label: string; hint: string; className: string }> = {
  COMPLETE: {
    label: "已完成",
    hint: "中央會員與中央 LINE 均已完成",
    className: "bg-emerald-100 text-emerald-800",
  },
  NEEDS_LINE: {
    label: "待綁中央 LINE",
    hint: "已有中央會員連結，尚缺中央 LINE",
    className: "bg-amber-100 text-amber-800",
  },
  NEEDS_MEMBER_LINK: {
    label: "待連結門市會員",
    hint: "已有登入帳號，尚未連結這間門市",
    className: "bg-amber-100 text-amber-800",
  },
  NEEDS_LOGIN: {
    label: "待建立中央登入",
    hint: "尚未建立可驗證的中央會員身分",
    className: "bg-earth-100 text-earth-700",
  },
};

export default async function CentralBindingPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const viewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(activeStoreId, viewContext);
  if (!storeId) redirect("/dashboard/customers");

  const [store, rows] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { slug: true, name: true },
    }),
    listCentralBindingStatuses(storeId),
  ]);
  const incomplete = rows.filter((row) => row.status !== "COMPLETE");
  const completeCount = rows.length - incomplete.length;
  const inviteUrl = `https://www.steamfoot.com/s/${store.slug}/member-link`;

  return (
    <PageShell>
      <PageHeader
        title="中央會員綁定狀態"
        subtitle={`查看 ${store.name} 顧客尚缺少哪一步；店長只能邀請，不能代替顧客綁定。`}
        actions={
          <Link href="/dashboard/customers" className="text-sm text-primary-700">
            ← 回顧客管理
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Summary label="顧客總數" value={rows.length} />
        <Summary label="已完成" value={completeCount} tone="green" />
        <Summary label="待補綁" value={incomplete.length} tone="amber" />
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
        複製後請由店家既有客服管道傳給顧客。顧客必須自行登入並完成驗證；此頁不會自動發送 LINE，也不會修改任何會員資料。
      </div>

      <section className="overflow-hidden rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-200 px-4 py-3">
          <h2 className="font-semibold text-earth-900">尚未完成的顧客</h2>
          <p className="mt-1 text-xs text-earth-500">僅顯示目前缺少的步驟，不顯示 LINE ID 或登入憑證。</p>
        </div>
        {incomplete.length === 0 ? (
          <p className="p-6 text-center text-sm text-earth-500">目前所有顧客皆已完成中央綁定。</p>
        ) : (
          <div className="divide-y divide-earth-100">
            {incomplete.map((row) => {
              const copy = statusCopy[row.status];
              return (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/customers/${row.id}`} className="font-medium text-earth-900 hover:text-primary-700">
                      {row.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-earth-500">{row.phone}</p>
                    <p className="mt-1 text-xs text-earth-600">{copy.hint}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${copy.className}`}>{copy.label}</span>
                    <InviteButton customerName={row.name} inviteUrl={inviteUrl} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Summary({ label, value, tone = "earth" }: { label: string; value: number; tone?: "earth" | "green" | "amber" }) {
  const className = {
    earth: "border-earth-200 bg-white text-earth-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return <div className={`rounded-lg border p-3 ${className}`}><p className="text-xs opacity-70">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

