import { notFound } from "next/navigation";
import { authorizeFrontendPreview } from "@/server/services/frontend-preview";
import { prisma } from "@/lib/db";
import { toLocalDateStr, formatTWDateTime } from "@/lib/date-utils";
import { readFetchLiffBookings } from "@/server/queries/liff-my-bookings";
import { readFetchLiffWallets } from "@/server/queries/liff-my-wallets";
import { readFetchSpaLiffBookings, readFetchSpaLiffEntitlements } from "@/server/queries/spa-liff-member";
import { readLiffStaffWork } from "@/server/queries/spa-liff-staff-work";
import { loadCoursePortal } from "@/app/(customer)/book/course-portal";
import { CoursePortalClient } from "@/app/(customer)/book/course-portal-client";
import { StaffWorkScreen } from "@/app/(liff)/liff/spa-work/staff-work-screen";
import { PreviewMemberScreen } from "@/components/frontend-preview/member-screen";
import { ReadOnlyPreviewBoundary } from "@/components/frontend-preview/read-only-boundary";

export const dynamic = "force-dynamic";
export default async function FrontendPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  if (!p.storeId || !p.personId || (p.role !== "member" && p.role !== "work")) notFound();
  const selection = { storeId: p.storeId, personId: p.personId, role: p.role } as const;
  let access;
  try { access = await authorizeFrontendPreview(selection); } catch { notFound(); }
  const store = await prisma.store.findUniqueOrThrow({ where: { id: access.storeId }, select: { name: true, slug: true } });
  const href = `/frontend-preview?${new URLSearchParams(selection)}`;
  // Metadata only; never log balances, notes or phone numbers.
  console.info("[frontend-preview:view]", { viewerId: access.user.id, ...selection, moduleId: access.moduleId });
  let content;
  if (access.moduleId === "course") {
    const data = await loadCoursePortal(p.month ?? p.date?.slice(0, 7), selection);
    content = <CoursePortalClient key={`${access.storeId}:${access.personId}:${p.role}`} {...data} readOnly initialDate={p.date} initialCoach={p.role === "work"} initialView={p.role === "work" ? "schedule" : p.view === "bookings" ? "bookings" : p.view === "wallets" ? "plans" : "home"} />;
  } else if (p.role === "work") {
    const data = await readLiffStaffWork({ storeId: access.storeId, staffId: access.personId, staffName: access.name }, { date: p.date });
    content = data.status === "ok" ? <StaffWorkScreen storeName={store.name} storeSlug={store.slug} liffId="" today={toLocalDateStr()} preview={{ data, href }} /> : <p role="alert">目前無法讀取工作資料，請重新整理。</p>;
  } else {
    const context = { storeId: access.storeId, customerId: access.personId };
    const [bookings, wallets] = await Promise.all(access.moduleId === "spa" ? [readFetchSpaLiffBookings(context), readFetchSpaLiffEntitlements(context)] : [readFetchLiffBookings(context), readFetchLiffWallets(context)]);
    content = <PreviewMemberScreen bookings={bookings} wallets={wallets} moduleId={access.moduleId} name={access.name} storeName={store.name} storeSlug={store.slug} href={href} view={p.view ?? "home"} />;
  }
  return <ReadOnlyPreviewBoundary><header className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>預覽中・不會儲存</strong><p>{store.name}・{access.name}・{p.role === "work" ? "工作前台" : "會員前台"}</p><p>更新於 {formatTWDateTime()} {access.personUserId ? "" : "・未綁定登入帳號，本次僅驗證畫面與資料"}</p><a href={`${href}${p.view ? `&view=${encodeURIComponent(p.view)}` : ""}${p.date ? `&date=${encodeURIComponent(p.date)}` : ""}${p.month ? `&month=${encodeURIComponent(p.month)}` : ""}`} className="inline-flex min-h-11 items-center underline">重新整理</a></header>{content}</ReadOnlyPreviewBoundary>;
}
