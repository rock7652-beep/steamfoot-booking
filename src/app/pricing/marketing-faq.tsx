"use client";

import { PUBLIC_TRIAL_COPY } from "@/lib/public-marketing-copy";
import { useId, useState } from "react";

type Question = { question: string; answers: string[]; pricingLink?: boolean };
const categories: { label: string; questions: Question[] }[] = [
  { label: "顧客怎麼用", questions: [
    { question: "顧客需要另外下載 App 嗎？", answers: ["不用另外下載蒸管家 App。顧客可從店家 LINE 的顧客入口選擇服務與時間；首次使用仍須完成必要授權與資料填寫。"] },
    { question: "顧客不熟手機操作，怎麼辦？", answers: ["從顧客熟悉的 LINE 開始，減少學習新工具的負擔。若顧客仍需要協助，店家也可以幫忙登記預約。"] },
    { question: "一定要讓所有顧客改成線上預約嗎？", answers: ["不用一次改變所有人的習慣。電話、LINE 私訊或現場預約，店家仍可協助登記，再逐步引導願意自行預約的顧客使用線上入口。"] },
  ] },
  { label: "店家怎麼開始", questions: [
    { question: "一人店、兩人店適合用嗎？", answers: ["可以先從預約、顧客資料與堂數管理開始，依門市人數和實際需求選配功能。"] },
    { question: "我不熟系統，開始使用會有人協助嗎？", answers: ["可以由專人安排視訊操作介紹，先一起完成第一筆預約，再逐步熟悉查看預約、查詢顧客與完成服務等日常操作。之後也可查閱操作指南，或透過官方 LINE 聯繫。"] },
    { question: "已經有官方 LINE，可以接著使用嗎？", answers: ["先確認現有官方 LINE 的設定與管理權限，再安排顧客入口串接。三個付費方案皆內含 LINE 提醒、顧客標籤及 LIFF 顧客入口，數位管家則需另行開通。"] },
  ] },
  { label: "資料與功能", questions: [
    { question: "原有顧客與剩餘堂數，要怎麼帶進來？", answers: ["先確認資料格式、方案期限與剩餘堂數，再安排建檔或評估匯入方式；核對完成後再開始使用。"] },
    { question: "顧客預約後，我還要手動抄名單嗎？", answers: ["顧客完成預約後，名單與時段會進入後台，減少重複抄寫。單純在 LINE 私訊詢問，仍須完成預約流程。"] },
    { question: "到店提醒、方案到期提醒都有嗎？", answers: ["可依門市功能與設定安排提醒；到店卡片可提供確認、改期或取消，方案到期卡片引導預約或諮詢店長。通知須完成 LINE 串接並啟用相關設定。"] },
  ] },
  { label: "試用與費用", questions: [
    { question: "可以先試用，再決定是否付費嗎？", answers: ["可以，先免費體驗 30 天。點選「申請 30 天免費體驗」填寫門市需求，由專人聯繫確認設定與體驗內容；帳號可正常使用當天才起算，送出需求不扣款。"] },
    { question: "免費體驗開放哪些功能？", answers: [PUBLIC_TRIAL_COPY.scope, PUBLIC_TRIAL_COPY.limits, PUBLIC_TRIAL_COPY.exclusions], pricingLink: true },
    { question: "體驗到期後，資料還能沿用嗎？", answers: [PUBLIC_TRIAL_COPY.retention] },
    { question: "月費之外，還有哪些費用？", answers: ["額外模組與分店串接管理費依選擇另計。優惠範圍、期限與內含項目統一查看方案頁；LINE 訊息等第三方費用需另外確認。"], pricingLink: true },
  ] },
];

export function MarketingFaq() {
  const [active, setActive] = useState(0);
  const id = useId();
  const category = categories[active];
  return <section id="faq" aria-labelledby={`${id}-title`} className="mt-8 scroll-mt-24 border-t border-[#153B31]/15 pt-8">
    <h2 id={`${id}-title`} className="text-2xl font-semibold">常見問題，先看你最在意的</h2>
    <p className="mt-2 text-base leading-7 text-[#4C6259]">選一個分類，快速找到答案。</p>
    <div role="group" aria-label="常見問題分類" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {categories.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} aria-controls={`${id}-questions`} onClick={() => setActive(index)} className={`min-h-12 rounded-xl border px-3 py-3 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#967039] ${active === index ? "border-[#123E32] bg-[#123E32] text-white" : "border-[#153B31]/20 bg-white text-[#153B31] hover:bg-[#EDF1EA]"}`}>{item.label}</button>)}
    </div>
    <div id={`${id}-questions`} key={active} role="region" aria-label={category.label} className="mt-4 divide-y divide-[#153B31]/15 rounded-xl border border-[#153B31]/15 bg-white px-4 sm:px-5">
      {category.questions.map(item => <details key={item.question} name={`${id}-accordion`} className="group py-1">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#967039] [&::-webkit-details-marker]:hidden">
          {item.question}<span aria-hidden="true" className="shrink-0 text-xl text-[#967039] group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 pb-4 text-base leading-7 text-[#4C6259]">
          {item.answers.map(answer => <p key={answer}>{answer}</p>)}
          {item.pricingLink && <a href="/pricing" className="inline-flex min-h-11 items-center font-medium text-[#153B31] underline underline-offset-4">查看完整體驗說明與正式價格 →</a>}
        </div>
      </details>)}
    </div>
    <p className="mt-4 text-sm leading-6 text-[#4C6259]">還有其他問題？<a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-[#153B31] underline underline-offset-4">加官方 LINE 問我們 ↗</a></p>
  </section>;
}
