import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import { resolveStorePresentation } from "@/lib/store-resolver";
import { ZhubeiTrialBookingForm } from "../../zhubei/book/zhubei-trial-booking-form";

const ENABLED_STORES = ["hsinchu", "taichung"] as const;
type EnabledStoreSlug = (typeof ENABLED_STORES)[number];

function isEnabledStore(slug: string): slug is EnabledStoreSlug {
  return ENABLED_STORES.includes(slug as EnabledStoreSlug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  if (!isEnabledStore(storeSlug)) return {};
  const storeName = getCustomerFacingStoreName({ slug: storeSlug });
  return {
    title: `首次蒸足體驗 NT$499｜${storeName}線上預約`,
    description: `${storeName}公開預約。直接選日期、時段與人數，不用註冊，到店再付款。`,
  };
}

export default async function StoreTrialBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ entry?: string | string[] }>;
}) {
  const [{ storeSlug }, query] = await Promise.all([params, searchParams]);
  if (!isEnabledStore(storeSlug)) notFound();
  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) notFound();

  const entry = typeof query.entry === "string" ? query.entry : undefined;
  const storeName = getCustomerFacingStoreName(presentation);

  return (
    <main className="min-h-dvh bg-[#f7f2ea] px-4 py-8 text-earth-900 sm:py-12">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <header className="bg-gradient-to-br from-earth-900 to-primary-800 px-6 py-10 text-white sm:px-10">
          <p className="text-sm font-semibold tracking-[0.16em] text-white/80">{storeName}</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight">第一次蒸足，從這裡開始</h1>
          <p className="mt-4 text-lg font-semibold">首次體驗每人 NT$499</p>
          <p className="mt-2 text-sm text-white/80">約 45 分鐘・不用註冊・到店再付款</p>
        </header>

        <div className="px-4 py-7 sm:px-10 sm:py-10">
          <section className="rounded-3xl bg-primary-50/70 p-5">
            <h2 className="text-xl font-bold">線上完成預約，門市立即收到</h2>
            <p className="mt-2 text-sm leading-6 text-earth-600">
              選擇日期、時段與人數後，系統會直接在{storeName}後台建立顧客及首次體驗預約。
            </p>
          </section>

          <section id="booking-form" className="scroll-mt-5 pt-8">
            <ZhubeiTrialBookingForm
              entry={entry}
              storeSlug={storeSlug}
              contactUrl={presentation.contactUrl}
            />
          </section>

          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href={presentation.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center rounded-xl bg-primary-600 px-4 font-semibold text-white"
            >
              開啟地圖導航
            </a>
            <a
              href={presentation.contactUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center rounded-xl border border-primary-200 px-4 font-semibold text-primary-700"
            >
              聯繫官方 LINE
            </a>
          </section>
        </div>
      </section>
    </main>
  );
}
