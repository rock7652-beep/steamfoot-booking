import Link from "next/link";
import { notFound } from "next/navigation";
import { toLocalDateStr } from "@/lib/date-utils";
import { SPA_DEMO_LIVE_FLOW_BOOKING_IDS, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import {
  getSpaDemoBookableProviders,
  getSpaDemoFixtureBookableProviders,
} from "@/server/queries/spa-demo-booking-availability";
import { SpaServiceComposerPreview, type SpaCompletedBookingPreview } from "../../_components/spa-service-composer-preview";

export default async function SpaBookingPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const preview = await getSpaDemoPreviewData();
  const { presentation } = preview;
  const displayStoreName = presentation.name.replace(/\s*示範店$/, "");
  const previewDate = toLocalDateStr();
  const latest = new Date(`${previewDate}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 14);
  const latestDate = latest.toISOString().slice(0, 10);
  const liveBookings = preview.bookings
    .filter((booking) => SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number]))
    .sort((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
  const allCompleted = liveBookings.length > 0 && liveBookings.every((booking) => booking.status === "已完成");
  const settlementLabels = new Set(liveBookings.map((booking) => booking.settlementLabel).filter(Boolean));
  const initialCompletedBooking: SpaCompletedBookingPreview | null = liveBookings.length ? {
    date: liveBookings[0].date,
    time: liveBookings[0].time,
    totalPrice: liveBookings.reduce((total, booking) => total + (booking.price ?? 0), 0),
    status: allCompleted ? "已完成" : "已確認",
    settlementLabel: allCompleted && settlementLabels.size === 1 ? liveBookings[0].settlementLabel : allCompleted ? "分開結帳" : null,
    settlementAmount: allCompleted && settlementLabels.size === 1 ? liveBookings[0].settlementAmount : null,
    storedValueBalance: liveBookings[0].storedValueBalance,
    packageRemainingSessions: liveBookings[0].packageRemainingSessions,
    guests: liveBookings.map((booking, index) => {
      const provider = preview.providers.find((item) => item.id === booking.providerId);
      return {
        label: index === 0 ? "第 1 位" : `同行者 ${index + 1}`,
        service: booking.service,
        durationMinutes: booking.durationMinutes,
        provider: provider ? `${provider.badge}號 ${provider.name}` : "系統安排",
      };
    }),
  } : null;
  const databasePreviewEnabled =
    process.env.VERCEL_ENV === "preview"
    || process.env.SPA_DEMO_DATABASE_PREVIEW_ENABLED === "true";
  const providers = databasePreviewEnabled
    ? await getSpaDemoBookableProviders({ startDate: previewDate, endDate: latestDate })
    : getSpaDemoFixtureBookableProviders();

  return (
    <div className="spa-preview-page mx-auto flex max-w-md flex-col gap-5 px-5 pb-10 pt-7">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <header>
        <Link
          href={`/s/${presentation.slug}/liff/design-preview`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-earth-600"
        >
          ‹ 會員中心
        </Link>
        <p className="mt-1 text-sm font-semibold tracking-[0.12em] text-primary-700">
          {displayStoreName}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-earth-900">
          預約服務
        </h1>
      </header>

      <SpaServiceComposerPreview
        previewDate={previewDate}
        latestDate={latestDate}
        providers={providers}
        initialCompletedBooking={initialCompletedBooking}
      />
    </div>
  );
}
