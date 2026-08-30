import { notFound } from "next/navigation";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { SPA_DEMO_PROVIDERS, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getSpaDemoPreviewData } from "@/server/queries/spa-demo-preview";

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Draft Preview only. Production keeps the authenticated staff workspace. */
export default async function SpaStaffPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== SPA_DEMO_STORE.slug) notFound();

  const preview = await getSpaDemoPreviewData();
  const provider = preview.providers.find((item) => item.id === SPA_DEMO_PROVIDERS[0].id);
  if (!provider) notFound();

  const bookings = preview.bookings
    .filter((booking) => booking.providerId === provider.id)
    .sort((left, right) => left.time.localeCompare(right.time));

  return (
    <main className="min-h-screen bg-earth-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.12em] text-primary-700">SPA 芳療師行程・Demo Preview</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-earth-900">{provider.badge}號 {provider.name}</h1>
              <p className="mt-1 text-sm text-earth-500">{provider.specialties}</p>
            </div>
            <span className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700">今日 {bookings.length} 筆</span>
          </div>
        </header>

        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary-700">今日工作</p>
              <h2 className="mt-1 text-xl font-bold text-earth-900">2026 年 8 月 30 日</h2>
            </div>
            <span className="text-xs text-earth-500">與顧客、店長同步</span>
          </div>

          <div className="mt-4 space-y-3">
            {bookings.length ? bookings.map((booking) => (
              <article key={booking.id} className="rounded-xl border border-primary-200 bg-primary-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-earth-900">
                      {booking.time}–{addMinutes(booking.time, booking.durationMinutes)}
                    </p>
                    <p className="mt-1 font-medium text-earth-800">{booking.customer}</p>
                    <p className="mt-1 text-sm text-earth-600">{booking.service}・{booking.durationMinutes} 分鐘</p>
                    <p className="mt-2 text-xs text-earth-500">服務後保留 {booking.bufferMinutes} 分鐘整理</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs text-primary-700">{booking.status}</span>
                </div>
              </article>
            )) : (
              <p className="rounded-xl bg-earth-50 px-4 py-5 text-center text-sm text-earth-500">今天尚未安排顧客</p>
            )}
          </div>
        </section>

        <p className="px-1 text-xs leading-5 text-earth-500">此頁僅供 Draft PR 驗收；正式站的芳療師行程仍須登入。</p>
      </div>
    </main>
  );
}
