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
    <main className="mx-auto max-w-3xl space-y-4 p-4 text-base">
      <h1 className="text-xl font-semibold">{data.store.name}｜體驗預約</h1>
      <p>每人每項服務限體驗一次。請逐位填寫服務者資料。</p>
      <BeautyBookingForm
        catalog={data}
        mode="public"
        slug={slug}
        entry={q.entry}
      />
    </main>
  );
}
