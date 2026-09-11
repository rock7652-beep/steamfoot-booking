import { MarketingIcon } from "../marketing-icon";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "真實店家案例｜蒸管家",
  description: "來回確認時段、重複建檔與逐筆提醒，都是店長的時間成本。看看蒸管家如何接手預約、建檔與 LINE 通知。",
};

const cases = [
  {
    id: "nuanmu", label: "A", name: "暖沐蒸足", topic: "預約提醒",
    title: "每一則手動提醒，都占用店長的時間。",
    intro: "暖沐蒸足已啟用提醒規則，把例行通知交給系統安排，店長集中查看發送紀錄。",
    costs: [
      ["逐筆找出需要提醒的預約，再傳送訊息。", "依已啟用的提醒規則安排發送，減少逐筆操作。"],
      ["詢問顧客是否會到，再整理回覆。", "顧客可在提醒中確認會到，後台同步顯示確認狀態。"],
      ["顧客改期或取消後，再追蹤異動資訊。", "顧客透過預約流程完成改期或取消，系統通知店家。"],
    ],
    benefit: "少一些逐筆提醒與回覆整理，把注意力留給需要你服務的顧客。",
    fit: "適合已有固定預約，需要安排顧客提醒的門市。",
  },
  {
    id: "nuannuan", label: "B", name: "暖暖蒸足", topic: "體驗預約",
    title: "一筆體驗預約，不必忙兩次。",
    intro: "從確認時間、收集資料到建立預約，每次回覆與輸入都是成本。暖暖蒸足透過線上體驗預約，讓蒸管家接手這些重複工作。",
    costs: [
      ["顧客問體驗，店長來回提供時段、等待回覆，再確認時間。", "顧客線上查看可體驗時間，自己選好日期與時段。"],
      ["收集姓名、電話後，再進系統建檔，排入當天的預約。", "顧客填寫必要資料並送出成功後，自動建檔、排入對應日期與時間，並以 LINE 通知店長體驗客資訊。"],
      ["前一天逐筆提醒，再追蹤是否到店、改期或取消。", "體驗前一天依設定發送提醒；完成改期或取消會通知店家，確認會到則顯示在後台。"],
    ],
    benefit: "少一些來回確認，少一次重複輸入，少一份逐筆提醒的工作。",
    fit: "適合常接到首次體驗詢問，希望減少溝通與建檔時間的門市。",
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
        <h1 className="mt-2 text-3xl font-semibold leading-snug sm:text-4xl">每一次來回確認，都是店長的時間。</h1>
        <p className="mt-3 text-base leading-7 text-[#4C6259]">確認時段、重複建檔、到店提醒，讓蒸管家接手例行工作。</p>
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
          ) : (
            <figure className="mt-5 grid items-center gap-4 sm:grid-cols-[minmax(0,360px)_1fr]">
              <a href="/pricing/business-assets/brand-reminder-example.jpeg" target="_blank" rel="noopener noreferrer" aria-label="放大暖沐預約提醒示意圖（另開視窗）"
                className="block overflow-hidden rounded-xl border border-[#153B31]/15 bg-[#FAF8F2] focus-visible:outline-2 focus-visible:outline-offset-4">
                <Image src="/pricing/business-assets/brand-reminder-example.jpeg" width={1058} height={1487} unoptimized
                  alt="暖沐蒸足預約提醒示意：林小姐的預約時間、服務資訊，以及改時段與取消前往選項"
                  className="mx-auto h-auto max-h-[480px] w-full object-contain" />
              </a>
              <figcaption>
                <h3 className="text-lg font-semibold">少一則手動提醒，少一輪來回確認。</h3>
                <p className="mt-2 text-base leading-7 text-[#4C6259]">預約資訊隨卡片送達，顧客可自行改期或取消，讓店長省下逐筆提醒與確認的時間。</p>
                <p className="mt-2 text-sm leading-6 text-[#4C6259]">新版提醒示意・姓名與預約資料為範例・點圖放大</p>
              </figcaption>
            </figure>
          )}

          <p className="mt-3 text-base leading-7 text-[#4C6259]">{current.intro}</p>



          
          <section aria-label="店長工作前後對照" className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#153B31]/15 bg-[#F8F5EE] p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold"><MarketingIcon kind="chat" />原本，店長一件件處理</h3>
              <ul className="mt-3 space-y-2 text-base leading-7 text-[#4C6259]">
                {(current.id === "nuannuan" ? ["來回問時段", "抄資料、建立預約", "逐筆傳訊息提醒"] : ["找出明天的預約", "逐筆傳訊息提醒", "整理顧客回覆"]).map(text => <li key={text}>{text}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-[#153B31]/15 bg-[#EEF4F0] p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold"><MarketingIcon kind="calendar" />現在，交給蒸管家</h3>
              <ul className="mt-3 space-y-2 text-base leading-7">
                {(current.id === "nuannuan" ? ["顧客自己選時間", "資料、預約自動建好", "依設定發送 LINE 提醒"] : ["依規則安排提醒", "顧客點選確認會到", "店長在後台看確認狀態"]).map(text => <li key={text}>{text}</li>)}
              </ul>
            </div>
          </section>

          <details className="mt-5 rounded-xl border border-[#153B31]/15 p-4">
            <summary className="cursor-pointer text-lg font-semibold">看看少了哪些來回與手動工作</summary>
            <div className="mt-3 space-y-3">
              {current.costs.map(([manual, automated], index) => (
                <div key={manual} className="overflow-hidden rounded-xl border border-[#153B31]/15 md:grid md:grid-cols-2">
                  <div className="bg-[#F8F5EE] p-4">
                    <p className="text-sm font-medium text-[#74603C]">{index + 1}・店長手動處理時</p>
                    <p className="mt-2 text-base leading-7 text-[#4C6259]">{manual}</p>
                  </div>
                  <div className="bg-[#EEF4F0] p-4">
                    <p className="text-sm font-semibold">交給蒸管家</p>
                    <p className="mt-2 text-base leading-7">{automated}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-[#4C6259]">通知依門市已完成的 LINE 串接與啟用設定運作；改期、取消須完成預約操作。</p>
          </details>
          <div className="mt-5 rounded-xl border-l-4 border-[#967039] bg-[#EEF4F0] p-4">
            <h3 className="text-lg font-semibold">把這些時間，留給顧客。</h3>
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
          <h2 id="case-cta" className="text-xl font-semibold">把時間留給服務，把日常交給管家。</h2>
          <p className="mt-2 text-base leading-7 text-[#4C6259]">填寫需求，由專人聯繫安排適合的體驗。</p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <a href={trialUrl} className="inline-flex min-h-12 items-center rounded-full bg-[#123E32] px-6 py-3 text-base font-semibold text-white hover:bg-[#245A49]">申請體驗帳號</a>
            <Link href="/pricing" className="py-3 text-base underline underline-offset-4">查看方案價格</Link>
            <Link href="/pricing/guides" className="py-3 text-base underline underline-offset-4">閱讀店長經營指南</Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#153B31]/15 px-5 py-5 text-center text-sm leading-6 text-[#4C6259]">蒸管家｜每一家店，都值得擁有一位數位管家。<div className="mt-3 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm leading-6"><a href="mailto:steambutler500@gmail.com" className="break-all underline underline-offset-4">客服信箱：steambutler500@gmail.com</a><a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">官方 LINE：@329rmywc（加入官方 LINE）</a><a href="/privacy" className="underline underline-offset-4">隱私權政策</a><a href="/pricing/terms.html" className="underline underline-offset-4">服務條款</a><a href="/pricing/refunds.html" className="underline underline-offset-4">取消與退費政策</a><p className="w-full text-center">陸比音樂工作室｜統一編號：31789116<br />聯絡地址：新竹縣竹北市科大一路116號</p></div></footer>
    </div>
  );
}
