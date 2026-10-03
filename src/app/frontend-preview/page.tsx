import { getNativeHealthSummary } from "@/lib/native-health-service";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getIndustryModule } from "@/lib/industry-modules";
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
    const healthEnabled = getIndustryModule(access.moduleId).features.healthAssessment && await hasStoreFeature(access.storeId, FEATURES.AI_HEALTH_SUMMARY);
    const healthSummary = healthEnabled ? await getNativeHealthSummary(access.personId, access.storeId) : null;
    const context = { storeId: access.storeId, customerId: access.personId };
    const customer = await prisma.customer.findFirstOrThrow({ where: { id: access.personId, storeId: access.storeId }, select: { id: true, name: true, phone: true, email: true, lineLinkStatus: true, lineName: true, lineUserId: true } });
    const lineStatus = customer.lineLinkStatus === "LINKED" && customer.lineUserId ? "linked" as const : customer.lineLinkStatus === "UNLINKED" && !customer.lineUserId ? "unlinked" as const : "needs_help" as const;
    const profile = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, lineStatus, lineName: customer.lineName, lineUserIdMasked: lineStatus === "linked" && customer.lineUserId && customer.lineUserId.length >= 7 ? `U******${customer.lineUserId.slice(-4)}` : null, storeName: store.name, storeSlug: store.slug };
    const [bookings, wallets] = await Promise.all(access.moduleId === "spa" ? [readFetchSpaLiffBookings(context), readFetchSpaLiffEntitlements(context)] : [readFetchLiffBookings(context), readFetchLiffWallets(context)]);
    content = <PreviewMemberScreen bookings={bookings} wallets={wallets} moduleId={access.moduleId} name={access.name} storeName={store.name} storeSlug={store.slug} href={href} view={p.view ?? "home"} profile={profile} healthSummary={healthSummary} />;
  }
  return <ReadOnlyPreviewBoundary><header className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50 px-3 text-sm text-amber-900">
    <div className="flex min-h-11 items-center justify-between gap-2">
      <strong className="whitespace-nowrap">預覽・不會儲存</strong>
      <div className="flex shrink-0 items-center gap-3">
        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center underline">資訊</summary>
          <div className="absolute right-0 top-full w-64 max-w-[calc(100vw-24px)] rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-md">
            <p className="break-words">{store.name}・{access.name}・{p.role === "work" ? "工作前台" : "會員前台"}</p>
            <p className="mt-1">更新於 {formatTWDateTime()}</p>
            {!access.personUserId && <p className="mt-1">未綁定登入帳號，本次僅驗證畫面與資料</p>}
          </div>
        </details>
        <a href={`${href}${p.view ? `&view=${encodeURIComponent(p.view)}` : ""}${p.date ? `&date=${encodeURIComponent(p.date)}` : ""}${p.month ? `&month=${encodeURIComponent(p.month)}` : ""}`} className="inline-flex min-h-11 items-center whitespace-nowrap underline">重新整理</a>
      </div>
    </div>
  </header>{content}</ReadOnlyPreviewBoundary>;
}
