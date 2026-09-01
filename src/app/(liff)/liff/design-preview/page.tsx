import Link from "next/link";
import { notFound } from "next/navigation";
import { liffMessages } from "@/lib/liff/messages";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SPA_DEMO_LIVE_FLOW_BOOKING_IDS, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import {
  getIndustryService,
  SPA_INDUSTRY_MODULE,
} from "@/lib/industry-modules";
import { WelcomeBack } from "../liff-shell";
import { toLocalDateStr } from "@/lib/date-utils";

const featuredSpaService = getIndustryService(SPA_INDUSTRY_MODULE, "package_10");

export default async function LiffDesignPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const { presentation, bookings } = await getSpaDemoPreviewData();
  const { section } = await searchParams;
  const displayStoreName = presentation.name.replace(/\s*示範店$/, "");
  const today = toLocalDateStr();
  const upcomingBookings = bookings
    .filter((booking) =>
      booking.date >= today
      && !booking.refundedAt
      && ["新客體驗", "已確認", "待到店"].includes(booking.status),
    )
    .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`))
    .map((booking) => ({
      id: booking.id,
      bookingDate: booking.date,
      slotTime: booking.time,
      bookingStatus: "CONFIRMED",
      bookingType: "PACKAGE",
      isMakeup: false,
      people: 1,
    }));
  const liveBookings = bookings
    .filter((booking) => SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(
      booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number],
    ))
    .toSorted((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
  const remainingSessions = liveBookings[0]?.packageRemainingSessions ?? 0;
  const bookedSessions = upcomingBookings.reduce((total, booking) => total + booking.people, 0);
  const availableToBook = Math.max(remainingSessions - bookedSessions, 0);
  const previewBasePath = `/s/${presentation.slug}/liff/design-preview`;

  if (section === "bookings" || section === "wallets" || section === "profile") {
    return (
      <SpaCustomerPreviewSection
        section={section}
        storeName={displayStoreName}
        backHref={previewBasePath}
        bookings={liveBookings}
        remainingSessions={remainingSessions}
        today={today}
      />
    );
  }

  return (
    <div className="spa-preview-page mx-auto flex max-w-md flex-col gap-5 px-5 pb-10 pt-7">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.12em] text-primary-700">
            {displayStoreName}
          </p>
          <p className="mt-0.5 text-sm text-earth-500">線上預約</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-sm" aria-hidden>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 3.2C12.5 3.4 6.5 6.5 5.2 12.1c-.8 3.5 1.3 6.8 4.8 6.8 6.2 0 9.8-7 10.8-15.7Z" />
            <path d="M4 21c2.4-5.3 6.6-9.2 12.5-11.7" />
          </svg>
        </div>
      </header>

      <WelcomeBack
        storeSlug={presentation.slug}
        displayName={liffMessages.shell.designPreviewName}
        memberSummary={{
          walletsStatus: "ok",
          upcomingBookings,
          activeWallets: [{
            id: "preview-wallet",
            planName: featuredSpaService.name,
            planCategory: "PACKAGE",
            totalSessions: 12,
            remainingSessions,
            availableToBook,
            pendingCount: bookedSessions,
            usedCount: Math.max(12 - remainingSessions, 0),
            voidedCount: 0,
            startDate: "2026-07-01",
            expiryDate: "2026-12-31",
            status: "ACTIVE",
          }],
          makeupCredits: [{ id: "preview-makeup", expiredAt: "2026-09-30" }],
          nextBooking: upcomingBookings[0] ?? null,
          healthSummary: null,
          referralShare: {
            storeName: displayStoreName,
            referralUrl: `/s/${presentation.slug}/line-entry?ref=PREVIEW&destination=public-trial&source=liff-store-share`,
            shareTemplate: null,
            address: presentation.address,
            mapUrl: presentation.mapUrl,
          },
        }}
        healthAssessmentEnabled={SPA_INDUSTRY_MODULE.features.healthAssessment}
        terminology={SPA_INDUSTRY_MODULE.customer}
        bookingHref={`/s/${presentation.slug}/liff/design-preview/booking`}
        memberLinks={{
          bookings: `${previewBasePath}?section=bookings`,
          wallets: `${previewBasePath}?section=wallets`,
          profile: `${previewBasePath}?section=profile`,
        }}
      />
    </div>
  );
}

function SpaCustomerPreviewSection({
  section,
  storeName,
  backHref,
  bookings,
  remainingSessions,
  today,
}: {
  section: "bookings" | "wallets" | "profile";
  storeName: string;
  backHref: string;
  bookings: Awaited<ReturnType<typeof getSpaDemoPreviewData>>["bookings"];
  remainingSessions: number;
  today: string;
}) {
  const firstBooking = bookings[0];
  const activeBookings = bookings.filter((booking) => booking.date >= today && booking.status !== "已完成" && !booking.refundedAt);
  const nextBooking = activeBookings[0];
  const title = section === "bookings" ? "我的預約" : section === "wallets" ? "我的療程" : "我的資料";
  return (
    <div className="spa-preview-page mx-auto flex max-w-md flex-col gap-5 px-5 pb-10 pt-7">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <header>
        <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-medium text-earth-600">‹ 會員中心</Link>
        <p className="mt-1 text-sm font-semibold tracking-[0.12em] text-primary-700">{storeName}</p>
        <h1 className="mt-1 text-2xl font-semibold text-earth-900">{title}</h1>
      </header>
      {section === "bookings" ? (
        <section className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
          {nextBooking ? <><p className="text-sm font-semibold text-earth-900">下一次預約</p><p className="mt-2 text-lg font-semibold text-earth-900">{nextBooking.date}・{nextBooking.time}</p><p className="mt-1 text-xs text-earth-500">共 {activeBookings.length} 位・{nextBooking.status}</p></> : <><p className="text-sm font-semibold text-earth-900">目前沒有未來預約</p><p className="mt-1 text-xs text-earth-500">已完成、取消或退款的預約不會列為下一次預約。</p></>}
          {!nextBooking && bookings.length ? <div className="mt-5 border-t border-earth-100 pt-4"><p className="text-sm font-semibold text-earth-800">最近一次紀錄</p><p className="mt-2 text-sm text-earth-600">{firstBooking.date}・{firstBooking.time}・{bookings.length} 位</p><p className="mt-1 text-xs text-earth-500">{firstBooking.status}{bookings.every((booking) => booking.refundedAt) ? "・整組已退款" : ""}</p></div> : null}
        </section>
      ) : section === "wallets" ? (
        <section className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
          <p className="text-sm text-earth-500">目前有效療程</p>
          <p className="mt-2 text-3xl font-semibold text-earth-900">{remainingSessions} 次</p>
          <p className="mt-2 text-sm text-earth-600">有效至 2026/12/31</p>
          <p className="mt-4 rounded-2xl bg-earth-50 px-4 py-3 text-xs text-earth-500">此處與店長顧客資料使用同一筆 Demo 療程餘額。</p>
        </section>
      ) : (
        <section className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
          <dl className="space-y-4 text-sm"><div><dt className="text-earth-500">姓名</dt><dd className="mt-1 font-semibold text-earth-900">{firstBooking?.customer ?? "彥陸"}</dd></div><div><dt className="text-earth-500">手機號碼</dt><dd className="mt-1 font-semibold text-earth-900">{firstBooking?.contactPhone ?? "0911999999"}</dd></div></dl>
        </section>
      )}
    </div>
  );
}
