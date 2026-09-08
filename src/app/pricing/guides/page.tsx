import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "店長經營指南｜蒸管家",
  description: "從體驗預約、到店提醒到方案到期，減少來回溝通與重複輸入，把店長的時間留給顧客。",
};

const guides = [
  {
    id: "trial-booking", category: "體驗預約", title: "一筆體驗預約，為什麼要忙兩次？",
    summary: "讓顧客自己選時間，省下來回確認與重複建檔。",
    cost: "顧客問體驗，店長查時段、回訊息、等回覆；時間確認後，還要收集姓名與電話，進系統建檔，再排入當天預約。每一次被打斷、每一次重複輸入，都是服務之外的時間成本。",
    action: "把可體驗日期與時段提供在線上。顧客選好時間、填寫必要資料並送出成功後，蒸管家自動建立體驗客資料與對應預約，並依設定以 LINE 通知店長。",
    steps: ["先整理可接待的體驗日期、時段與名額。", "把體驗預約入口放在官方 LINE，讓顧客直接選時間。", "店長收到通知後查看當日名單，把心力放在服務準備。"],
    takeaway: "一次填寫，完成建檔與排程。店長少抄一份資料，也少追問一輪時間。",
    note: "顧客須完成預約送出；單純在 LINE 私訊詢問不會自動建立預約。店長通知須完成 LINE 串接與相關設定。",
    image: "/pricing/business-assets/booking-time-original.png", width: 1532, height: 1364,
    alt: "暖暖蒸足體驗預約頁的可約日期與時段", caption: "暖暖蒸足預約畫面・點圖放大",
    caseUrl: "/pricing/cases?store=nuannuan", caseLabel: "看看暖暖蒸足怎麼用",
  },
  {
    id: "arrival-reminder", category: "到店提醒", title: "明天誰會來，不必逐位傳訊息確認。",
    summary: "交給系統安排提醒，讓店長集中查看回覆與異動。",
    cost: "每天翻找隔日預約、逐筆傳送提醒，再整理誰已回覆、誰想改期。訊息散在不同對話裡，店長服務顧客時，還得抽空切換畫面確認。",
    action: "啟用到店提醒後，蒸管家依門市規則安排通知。顧客可透過卡片提供的選項完成改期或取消；提供「確認會到」的提醒卡片，也能把確認狀態顯示在後台，讓店長集中掌握。",
    steps: ["設定提醒時間與文字，例如體驗前一天提醒準時到店。", "核對門市 LINE 串接、提醒規則與通知接收設定。", "每天集中查看發送紀錄與預約異動，再處理需要協助的顧客。"],
    takeaway: "例行提醒交給蒸管家，特別需要關心的顧客，留給店長親自照顧。",
    note: "卡片選項依預約類型與門市設定提供；下圖示範改期與取消。顧客需完成操作，異動才會生效；發出提醒不代表顧客一定會到店。",
    image: "/pricing/business-assets/brand-reminder-example.jpeg", width: 1058, height: 1487,
    alt: "林小姐的蒸管家預約提醒示意卡片，包含日期時間、店名與改時段及取消前往選項", caption: "新版提醒示意・姓名與預約資料為範例・點圖放大",
    caseUrl: "/pricing/cases?store=nuanmu", caseLabel: "看看暖沐蒸足怎麼用",
  },
  {
    id: "plan-expiry", category: "方案到期", title: "方案快到期，提早提醒顧客安排剩餘堂數。",
    summary: "省下逐筆查期限的工作，讓顧客有時間安排回店。",
    cost: "店長逐筆查看方案期限、確認剩餘堂數，再傳訊息詢問顧客何時方便。忙碌時漏了追蹤，往往等到顧客要預約，才發現方案已經到期。",
    action: "啟用方案到期提醒後，蒸管家依方案期限與門市設定發送通知，讓顧客查看剩餘堂數與到期日，接著預約或諮詢店長。",
    steps: ["先核對顧客方案的有效期限與剩餘堂數。", "依門市可提供的功能設定到期提醒，確認 LINE 通知已啟用。", "讓顧客先自行安排預約；有特殊需求時，再由店長協助。"],
    takeaway: "把查期限與例行提醒交給系統，把有溫度的關懷留給店長。",
    note: "提醒不會延長方案期限，也不保留預約名額；可預約日期與時段仍依方案效期及門市規則。",
    image: "", width: 0, height: 0, alt: "", caption: "", caseUrl: "", caseLabel: "",
  },
];

export default function StoreGuidesPage() {
  return (
    <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
      <header className="border-b border-[#153B31]/15">
        <nav aria-label="網站導覽" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/pricing/business" className="text-xl font-bold tracking-widest">蒸管家</Link>
          <Link href="/pricing" className="py-2 text-base underline underline-offset-4">方案價格</Link>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <p className="text-sm text-[#74603C]">店長經營指南</p>
        <h1 className="mt-2 text-3xl font-semibold leading-snug sm:text-4xl">哪一件店務，最占用你的時間？</h1>
        <p className="mt-3 text-base leading-7 text-[#4C6259]">從一件重複工作開始，看看蒸管家怎麼接手。</p>
        <div className="mt-5 space-y-3">
          {guides.map((guide, index) => (
            <details key={guide.id} id={guide.id} name="store-guide" className="group scroll-mt-6 rounded-2xl border border-[#153B31]/20 bg-white open:border-[#153B31]/50">
              <summary className="cursor-pointer rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-6">
                <span className="text-sm font-medium text-[#74603C]">0{index + 1} · {guide.category}</span>
                <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{guide.title}</h2>
                <p className="mt-2 text-base leading-7 text-[#4C6259]">{guide.summary}</p>
                <span className="mt-3 block text-base font-medium group-open:hidden">閱讀做法 ＋</span>
                <span className="mt-3 hidden text-base font-medium group-open:block">收起文章 −</span>
              </summary>
              <article aria-label={guide.title} className="border-t border-[#153B31]/15 p-5 sm:p-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <section>
                    <h3 className="text-lg font-semibold">時間花在哪裡？</h3>
                    <p className="mt-2 text-base leading-7 text-[#4C6259]">{guide.cost}</p>
                  </section>
                  <section className="rounded-xl bg-[#EEF4F0] p-4">
                    <h3 className="text-lg font-semibold">蒸管家怎麼接手？</h3>
                    <p className="mt-2 text-base leading-7">{guide.action}</p>
                  </section>
                </div>
                <div className="mt-5 grid items-start gap-5 md:grid-cols-2">
                  {guide.image ? (
                    <figure>
                      <a href={guide.image} target="_blank" rel="noopener noreferrer" aria-label={guide.caption + "（另開視窗）"} className="block rounded-xl border border-[#153B31]/15 bg-[#FAF8F2] p-2 focus-visible:outline-2 focus-visible:outline-offset-4">
                        <Image src={guide.image} width={guide.width} height={guide.height} alt={guide.alt} unoptimized className="mx-auto h-auto max-h-[300px] w-full object-contain" />
                      </a>
                      <figcaption className="mt-2 text-sm leading-6 text-[#4C6259]">{guide.caption}</figcaption>
                    </figure>
                  ) : (
                    <figure className="overflow-hidden rounded-xl border border-[#C4A45C]/50">
                      <div className="border-b-2 border-[#C4A45C] bg-[#153F33] p-4 text-base font-semibold text-white">蒸管家｜方案到期提醒</div>
                      <div className="p-4">
                        <p className="text-lg font-semibold">林小姐，別忘了你的剩餘堂數。</p>
                        <dl className="mt-3 divide-y divide-[#153B31]/15 text-base">
                          <div className="flex justify-between gap-3 py-3"><dt>剩餘堂數</dt><dd className="font-semibold">2 堂</dd></div>
                          <div className="flex justify-between gap-3 py-3"><dt>方案到期日</dt><dd className="font-semibold">9 月 30 日</dd></div>
                        </dl>
                        <p className="mt-2 text-base leading-7 text-[#4C6259]">請在有效期限內安排服務。有時間安排上的問題，也可以聯繫店長。</p>
                      </div>
                      <figcaption className="bg-[#FAF8F2] p-3 text-sm leading-6 text-[#4C6259]">通知內容示意・姓名、堂數與日期皆為範例</figcaption>
                    </figure>
                  )}
                  <section>
                    <h3 className="text-lg font-semibold">店長可以這樣開始</h3>
                    <ol className="mt-3 list-decimal space-y-3 pl-5 text-base leading-7 text-[#4C6259]">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
                    {guide.caseUrl ? <Link href={guide.caseUrl} className="mt-3 inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4">{guide.caseLabel} →</Link> : null}
                  </section>
                </div>
                <p className="mt-5 border-l-4 border-[#C4A45C] bg-[#EEF4F0] p-4 text-base font-medium leading-7">{guide.takeaway}</p>
                <p className="mt-3 text-sm leading-6 text-[#4C6259]">{guide.note}</p>
              </article>
            </details>
          ))}
        </div>
        <section aria-labelledby="guide-contact" className="mt-6 rounded-2xl bg-[#123E32] p-5 text-white sm:p-6">
          <h2 id="guide-contact" className="text-xl font-semibold">你最想先省下哪一段時間？</h2>
          <p className="mt-2 text-base leading-7 text-[#D4E0D8]">填寫門市需求，由專人聯繫，安排適合的體驗內容。</p>
          <a href="/pricing/apply.html?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=guides" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-[#F8F5EE] px-6 py-3 text-base font-semibold text-[#153B31]">申請體驗帳號</a>
        </section>
      </main>
      <footer className="border-t border-[#153B31]/15 px-5 py-5 text-center text-sm leading-6 text-[#4C6259]">蒸管家｜每一家店，都值得擁有一位數位管家。</footer>
    </div>
  );
}
