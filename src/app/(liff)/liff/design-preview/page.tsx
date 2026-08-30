import { notFound } from "next/navigation";
import { liffMessages } from "@/lib/liff/messages";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SPA_DEMO_LIVE_FLOW_BOOKING_ID, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  getIndustryService,
  SPA_INDUSTRY_MODULE,
} from "@/lib/industry-modules";
import { WelcomeBack } from "../liff-shell";
import { SpaServiceComposerPreview } from "../_components/spa-service-composer-preview";

const featuredSpaService = getIndustryService(SPA_INDUSTRY_MODULE, "package_10");
/**
 * Draft PR visual review only. No customer session or production data is read.
 * Production must never expose this demonstration route.
 */
export default async function LiffDesignPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const { presentation, bookings } = await getSpaDemoPreviewData();
  const liveBooking = bookings.find((booking) => booking.id === SPA_DEMO_LIVE_FLOW_BOOKING_ID) ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-10 pt-7">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.12em] text-primary-700">
            {presentation.name}
          </p>
          <p className="mt-0.5 text-sm text-earth-500">
            {SPA_INDUSTRY_MODULE.customer.memberCenterLabel}
          </p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-sm"
          aria-hidden
        >
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.8 3.2C12.5 3.4 6.5 6.5 5.2 12.1c-.8 3.5 1.3 6.8 4.8 6.8 6.2 0 9.8-7 10.8-15.7Z" />
            <path d="M4 21c2.4-5.3 6.6-9.2 12.5-11.7" />
          </svg>
        </div>
      </header>

      <SpaServiceComposerPreview previewDate={toLocalDateStr()} liveBooking={liveBooking} />

      <WelcomeBack
        storeSlug={presentation.slug}
        displayName={liffMessages.shell.designPreviewName}
        memberSummary={{
          walletsStatus: "ok",
          upcomingBookings: [{
            id: "preview-booking",
            bookingDate: "2026-08-29",
            slotTime: "14:00",
            bookingStatus: "CONFIRMED",
            bookingType: "PACKAGE",
            isMakeup: false,
            people: 1,
          }],
          activeWallets: [{
            id: "preview-wallet",
            planName: featuredSpaService.name,
            planCategory: "PACKAGE",
            totalSessions: 12,
            remainingSessions: 8,
            availableToBook: 6,
            pendingCount: 2,
            usedCount: 4,
            voidedCount: 0,
            startDate: "2026-07-01",
            expiryDate: "2026-12-31",
            status: "ACTIVE",
          }],
          makeupCredits: [{ id: "preview-makeup", expiredAt: "2026-09-30" }],
          nextBooking: {
            id: "preview-booking",
            bookingDate: "2026-08-29",
            slotTime: "14:00",
            bookingStatus: "CONFIRMED",
            bookingType: "PACKAGE",
            isMakeup: false,
            people: 1,
          },
          healthSummary: null,
          referralShare: {
            storeName: presentation.name,
            referralUrl: `/s/${presentation.slug}/line-entry?ref=PREVIEW&destination=public-trial&source=liff-store-share`,
            shareTemplate: null,
            address: presentation.address,
            mapUrl: presentation.mapUrl,
          },
        }}
        healthAssessmentEnabled={SPA_INDUSTRY_MODULE.features.healthAssessment}
        terminology={SPA_INDUSTRY_MODULE.customer}
      />
    </div>
  );
}
