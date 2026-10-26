import {CoursePortalBrand} from "@/components/course-portal-navigation";
import "@/app/(customer)/book/course-portal.css";
import { BeautyBookingForm } from "@/components/beauty/booking-form";
import { publicBeautyCatalog } from "@/server/beauty/queries";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
import { resolveStorePresentation } from "@/lib/store-resolver";
import styles from "@/components/beauty/public-booking-form.module.css";
import { resolveBookingLineEntry } from "@/server/services/booking-line-entry";
import { resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  if (process.env.BEAUTY_MODULE_ENABLED !== "1") return <BeautyClosedNotice />;
  const { slug } = await params,
    q = await searchParams,
    [data, presentation] = await Promise.all([publicBeautyCatalog(slug), resolveStorePresentation(slug)]);
  const lineEntry = resolveBookingLineEntry(slug);
  const identity = typeof q.entry === "string" && q.entry.length <= 512 ? await resolveTrialBookingChatLink(q.entry) : null;
  const verified = identity?.storeId === data.store.id && identity.channel === "LINE";
  return (
    <div className={`course-portal ${styles.page}`}><header className="cp-top"><CoursePortalBrand storeFirst storeName={data.store.name}/></header><main className="cp-main"><div className="cp-title">
      <h1>體驗預約</h1>
      </div><BeautyBookingForm
        catalog={data}
        mode="public"
        slug={slug}
        entry={q.entry}
        publicInfo={{ ...(presentation ? {address:presentation.address,mapUrl:presentation.mapUrl,contactUrl:presentation.contactUrl} : {}), massageReminder: slug === "soulife", lineEntryHref: lineEntry?.url, lineIdentityVerified: verified }}
      />
    </main></div>
  );
}
