import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { requireSteamfootStore } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { toLocalMonthStr } from "@/lib/date-utils";
import { readRentTerms } from "@/server/services/steamfoot-rent";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { RentForm } from "./rent-form";
export default async function StaffRentPage({ params }: { params: Promise<{id: string}> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN") || !await checkPermission(user.role, user.staffId, "staff.manage")) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireSteamfootStore(storeId);
  const { id } = await params;
  const staff = await prisma.staff.findFirst({ where: { id, storeId }, include: { user: { select: { role: true } } } });
  if (!staff || (user.role !== "ADMIN" && (staff.isOwner || staff.user.role === "ADMIN"))) notFound();
  const terms = await readRentTerms(storeId, id);
  const view = await resolveStoreViewContextFromCookie(user);
  return <PageShell className="mx-auto max-w-3xl space-y-3 px-4 py-3">
    <Link href="/dashboard/staff" className="text-sm text-primary-700">返回人員管理</Link>
    <PageHeader title={`${staff.displayName} · 空間租金`} />
    {!view?.isViewMode && <section className="rounded-lg border bg-white p-3"><RentForm key={terms[0]?.id ?? "new"} staffId={id} latest={terms[0]} defaultAmount={Number(staff.monthlySpaceFee)} currentMonth={toLocalMonthStr()}/></section>}
    {!!terms.length && <section className="rounded-lg border bg-white p-3"><h2 className="mb-2 text-sm font-semibold">租金約定紀錄</h2>{terms.map(t => <div key={t.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{t.startMonth} ～ {t.endMonth ?? "持續"}</span><span>{t.enabled ? `每 ${t.cycleMonths} 個月 · 每月 NT$ ${t.monthlyAmount.toLocaleString()}` : "不收租金"}</span></div>)}</section>}
  </PageShell>;
}
