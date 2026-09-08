import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "真實店家案例｜蒸管家",
  description: "看看暖沐蒸足如何安排預約提醒、暖暖蒸足如何讓體驗預約直接進入後台。",
};

const cases = [
  {
    id: "nuanmu", label: "A", name: "暖沐蒸足", topic: "預約提醒",
    title: "把預約前的提醒，交給系統安排。",
    intro: "暖沐蒸足已啟用提醒規則，店長可集中查看通知設定與發送紀錄。",
    situation: "預約前，門市需要安排顧客提醒，也需要知道通知是否送出。",
    steps: [
      ["安排提醒", "門市設定提醒規則與通知內容。"],
      ["依規則發送", "符合已啟用規則的預約，由系統安排通知。"],
      ["集中查看", "店長在提醒管理查看設定與發送紀錄。"],
    ],
    benefit: "符合規則的預約，不必再逐筆手動傳送提醒。",
    fit: "適合已有固定預約，需要安排顧客提醒的門市。",
  },
  {
    id: "nuannuan", label: "B", name: "暖暖蒸足", topic: "體驗預約",
    title: "顧客選好時間，預約直接進後台。",
    intro: "暖暖蒸足讓體驗顧客自行選擇日期與時段，店長在後台查看當日安排。",
    situation: "新顧客想預約首次體驗，需要知道哪些日期與時段可以選。",
    steps: [
      ["選擇時間", "顧客在體驗預約頁選擇可約日期與時段。"],
      ["填寫並送出", "顧客完成必要資料，確認後送出預約。"],
      ["後台直接查看", "送出成功後，系統在門市後台建立體驗預約。"],
    ],
    benefit: "已完成的線上預約，不必再手抄到另一份預約表。",
    fit: "適合常接到首次體驗詢問，希望減少來回確認時間的門市。",
  },
];

export default async function StoreCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string | string[] }>;
}) {
  const selected = (await searchParams).store;
  const current = cases.find((item) => item.id === selected) ?? cases[0];
  const trialUrl = "/pricing/apply.html?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=case-" + current.id;

  return (
    <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
      <header className="border-b border-[#153B31]/15">
        <nav aria-label="網站導覽" className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/pricing/business#main" className="text-xl font-bold tracking-widest">蒸管家</Link>
          <Link href="/pricing" className="py-2 text-base underline underline-offset-4">方案價格</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <p className="text-sm text-[#74603C]">真實店家案例</p>
        <h1 className="mt-2 text-3xl font-semibold leading-snug sm:text-4xl">看看門市怎麼用。</h1>
        <p className="mt-3 text-base leading-7 text-[#4C6259]">從預約到日常管理，選一家門市，看看實際做法。</p>
        <nav aria-label="選擇店家案例" className="mt-5 grid grid-cols-2 gap-3">
          {cases.map((item) => (
            <Link key={item.id} href={"/pricing/cases?store=" + item.id} scroll={false}
              aria-current={current.id === item.id ? "page" : undefined}
              className={"rounded-xl border p-4 focus-visible:outline-2 focus-visible:outline-offset-4 " + (current.id === item.id ? "border-[#123E32] bg-[#123E32] text-white" : "border-[#153B31]/20 bg-white hover:bg-[#EEE9DD]")}>
              <span className="block text-base font-semibold">{item.label}・{item.name}</span>
              <span className={"mt-1 block text-sm " + (current.id === item.id ? "text-[#D4E0D8]" : "text-[#4C6259]")}>{item.topic}</span>
            </Link>
          ))}
        </nav>

        <article aria-labelledby="case-title" className="mt-5 rounded-2xl border border-[#153B31]/15 bg-white p-5 sm:p-7">
          <p className="text-sm text-[#74603C]">{current.name}｜{current.topic}</p>
          <h2 id="case-title" className="mt-2 text-2xl font-semibold leading-snug">{current.title}</h2>
          <p className="mt-3 text-base leading-7 text-[#4C6259]">{current.intro}</p>

          {current.id === "nuannuan" ? (
            <figure className="mt-5">
              <a href="/pricing/business-assets/booking-time-original.png" target="_blank" rel="noopener noreferrer" aria-label="另開暖暖蒸足真實預約原圖"
                className="block overflow-hidden rounded-xl border border-[#153B31]/15 bg-[#F8F5EE] focus-visible:outline-2 focus-visible:outline-offset-4">
                <Image src="/pricing/business-assets/booking-time-original.png" width={1532} height={1364} unoptimized
                  alt="暖暖蒸足體驗預約頁，顧客可查看可約日期與時段"
                  className="mx-auto h-auto max-h-[440px] w-full object-contain" />
              </a>
              <figcaption className="mt-2 text-sm leading-6 text-[#4C6259]">門市真實預約畫面・點圖放大查看</figcaption>
            </figure>
          ) : null}

          <div className="mt-5 border-t border-[#153B31]/15 pt-5">
            <h3 className="text-lg font-semibold">門市要處理什麼？</h3>
            <p className="mt-2 text-base leading-7 text-[#4C6259]">{current.situation}</p>
          </div>
          <h3 className="mt-5 text-lg font-semibold">實際怎麼做？</h3>
          <ol className="mt-3 grid gap-3 md:grid-cols-3">
            {current.steps.map(([title, description], index) => (
              <li key={title} className="rounded-xl bg-[#F8F5EE] p-4">
                <p className="text-base font-semibold"><span className="mr-2 text-[#967039]">{index + 1}.</span>{title}</p>
                <p className="mt-2 text-base leading-7 text-[#4C6259]">{description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-xl border-l-4 border-[#967039] bg-[#EEF4F0] p-4">
            <h3 className="text-lg font-semibold">少掉哪一步？</h3>
            <p className="mt-2 text-base leading-7">{current.benefit}</p>
          </div>
          <p className="mt-4 text-base leading-7 text-[#4C6259]">{current.fit}</p>
          {current.id === "nuanmu" ? (
            <p className="mt-4 text-sm leading-6 text-[#4C6259]">
              想先了解介面？<Link href="/pricing/business#how-it-works" className="underline underline-offset-4">查看功能示意</Link>，切換「提醒與回訪」。
            </p>
          ) : null}
        </article>

        <section aria-labelledby="case-cta" className="mt-6">
          <h2 id="case-cta" className="text-xl font-semibold">也想用在你的門市？</h2>
          <p className="mt-2 text-base leading-7 text-[#4C6259]">填寫需求，由專人聯繫安排適合的體驗。</p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <a href={trialUrl} className="inline-flex min-h-12 items-center rounded-full bg-[#123E32] px-6 py-3 text-base font-semibold text-white hover:bg-[#245A49]">申請體驗帳號</a>
            <Link href="/pricing" className="py-3 text-base underline underline-offset-4">查看方案價格</Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#153B31]/15 px-5 py-5 text-center text-sm leading-6 text-[#4C6259]">蒸管家｜每一家店，都值得擁有一位數位管家。</footer>
    </div>
  );
}
