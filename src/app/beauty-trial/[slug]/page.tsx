import {CoursePortalBrand} from "@/components/course-portal-navigation";
import "@/app/(customer)/book/course-portal.css";
import { BeautyBookingForm } from "@/components/beauty/booking-form";
import { publicBeautyCatalog } from "@/server/beauty/queries";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
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
    data = await publicBeautyCatalog(slug);
  return (
    <div className="course-portal"><header className="cp-top"><CoursePortalBrand storeName={data.store.name}/><span>體驗預約</span></header><main className="cp-main"><div className="cp-title">
      <h1>{data.store.name}｜體驗預約</h1>
      <p>每人每項服務限體驗一次。請逐位填寫服務者資料。</p>
      </div><BeautyBookingForm
        catalog={data}
        mode="public"
        slug={slug}
        entry={q.entry}
      />
    </main></div>
  );
}
