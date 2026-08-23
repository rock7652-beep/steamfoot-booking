import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import { resolveStorePresentation } from "@/lib/store-resolver";
import { ZhubeiTrialBookingForm } from "../../zhubei/book/zhubei-trial-booking-form";

const ENABLED_STORES = ["hsinchu", "taichung"] as const;
type EnabledStoreSlug = (typeof ENABLED_STORES)[number];

const STORE_MAP_OVERRIDES: Partial<Record<EnabledStoreSlug, string>> = {
  taichung: "https://maps.app.goo.gl/YLgzPuG5BmBZqWuR8?g_st=ic",
};

const firstVisitItems = [
  {
    title: "可依預約時間提早 10 分鐘抵達門市",
    detail: "提早抵達即可，由店長協助報到。",
  },
  {
    title: "由門市店長說明流程",
    detail: "第一次體驗不用擔心，店長會一步一步協助。",
  },
  {
    title: "完成約 45 分鐘的蒸足體驗",
    detail: "請替自己保留充裕時間，放慢步調感受整個過程。",
  },
  {
    title: "體驗結束後再完成付款",
    detail: "首次體驗每人 NT$499，不需要先購買正式方案。",
  },
];

const faqItems = [
  {
    question: "第一次來，需要先加入會員嗎？",
    answer: "不需要。直接選擇日期、時段、人數，留下姓名與手機即可完成預約。",
  },
  {
    question: "一次可以預約幾個人？",
    answer: "一次可預約 1–2 人；系統會依照該時段剩餘名額提供可選人數。",
  },
  {
    question: "體驗大約需要多久？",
    answer: "首次蒸足體驗約 45 分鐘，建議另外保留抵達、說明與付款的時間。",
  },
  {
    question: "預約後需要先付款嗎？",
    answer: "不用。預約成功後依約到店完成體驗，再由門市店長協助付款。",
  },
  {
    question: "有特殊健康狀況，也可以預約嗎？",
    answer: "如有懷孕、慢性病、近期手術或其他需要留意的狀況，建議預約前先透過官方 LINE 詢問，必要時先諮詢專業醫療人員。",
  },
];

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
  const mapUrl = STORE_MAP_OVERRIDES[storeSlug] ?? presentation.mapUrl;

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

          <section className="mt-10 rounded-3xl bg-[#fcfaf7] p-5 sm:p-7">
            <p className="text-sm font-semibold text-primary-700">第一次來會發生什麼？</p>
            <h2 className="mt-2 text-2xl font-bold">從進門到離開，都有店長陪你完成</h2>
            <div className="mt-6 space-y-5">
              {firstVisitItems.map((item, index) => (
                <div key={item.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-earth-900 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-earth-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-earth-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="text-center">
              <p className="text-sm font-semibold text-primary-700">預約前提醒與常見問題</p>
              <h2 className="mt-2 text-2xl font-bold">把第一次來的疑問先回答清楚</h2>
            </div>
            <div className="mt-5 space-y-3">
              {faqItems.map((item) => (
                <details key={item.question} className="group rounded-2xl border border-earth-100 bg-white px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-earth-900">
                    <span>{item.question}</span>
                    <span className="text-xl font-normal text-primary-700 transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-6 text-earth-500">{item.answer}</p>
                </details>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-earth-500">
              還有其他問題？
              <a href={presentation.contactUrl} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-primary-700 underline underline-offset-4">
                先用官方 LINE 詢問
              </a>
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-earth-100 bg-white p-5 sm:p-6">
            <p className="text-sm font-semibold text-primary-700">門市資訊</p>
            <h2 className="mt-2 text-xl font-bold">{storeName}</h2>
            <p className="mt-2 text-sm leading-6 text-earth-600">{presentation.address}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href={mapUrl}
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
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
