import { MarketingIcon } from "../marketing-icon";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "店長經營指南｜蒸管家",
  description: "一人店預約安排、每日開店檢查，以及體驗預約與提醒做法。從店長能直接照做的小步驟開始，把時間留給顧客。",
};

const guides = [
  {
    id: "solo-store", icon: "clock" as const, category: "一人店實用做法", title: "一個人顧店，怎麼安排時間？",
    summary: "先留好服務、整理和休息時間，有空時再一起回訊息。",
    cost: "一個人顧店，常常服務到一半，又要停下來查時間、回訊息。預約排得太滿，連收款、整理和休息的時間都沒有。",
    action: "先算好一次服務要多久，加上結帳和整理的時間，再開放顧客預約。顧客可以在線上自己選時間，你有空時再查看新預約、回覆訊息。",
    steps: ["先確認今天哪些時間可以接客，休息或有事的時間不要開放預約。設定好後，打開顧客的預約頁確認一次。", "請顧客從 LINE 裡的預約入口自己選時間。需要幫忙時，你再利用服務空檔回覆。", "服務結束後，看看下一位幾點來、有沒有人改期或取消，再回覆還沒處理的訊息。"],
    takeaway: "預約之間留一點空檔，才有時間整理，也讓自己喘口氣。",
    note: "顧客能選哪些時間，會依店內設定顯示。記得把整理、休息和不能接客的時間一起安排好。",
    checklist: [["先安排", "服務、結帳、整理、休息"], ["再開放", "確認顧客能選哪些時間"], ["空檔處理", "新預約、改期、取消和未回覆訊息"]],
    checklistTitle: "一人店的安排順序", example: "您好，我正在服務其他顧客。您可以先點 LINE 裡的預約入口，選好時間並送出。有其他問題也可以先留言，我忙完就回覆您。",
    image: "", width: 0, height: 0, alt: "", caption: "", caseUrl: "", caseLabel: "",
  },
  {
    id: "opening-checklist", icon: "checklist" as const, category: "每日開店檢查", title: "開店前，先看這三件事。",
    summary: "今天誰會來？有沒有人改時間？這次要收款還是扣堂？",
    cost: "顧客到了，才發現時間改了、體驗用品還沒準備，或不知道這次要扣哪個方案，就得邊接待邊找資料。開店前先看一遍，接客時會從容一些。",
    action: "打開蒸管家後台，先看今天的預約，再看看誰改期、取消或已確認會到。最後查看今天顧客的方案，先知道這次要收款還是扣堂。",
    steps: ["看今天誰會來：確認幾點、幾位、做什麼服務。留意第一次來的顧客，以及兩筆預約靠得太近的時間。", "看有沒有人改時間：查看改期、取消和確認會到的回覆。沒回覆不代表取消，原本的預約要保留。", "看這次用哪個方案：確認預約選的方案、還剩幾堂、有沒有到期。服務結束後，再確認這次收多少錢或扣幾堂。"],
    takeaway: "開店前先看一遍，顧客來了就能專心接待。",
    note: "依這個順序查看後台即可。「確認會到」需有對應的提醒功能。結帳時，仍要再確認金額與扣堂。",
    checklist: [["今日預約", "時間、人數、項目、首次體驗"], ["改期與取消", "改期、取消、確認狀態"], ["服務準備", "這次用的方案、剩幾堂、何時到期"]],
    checklistTitle: "開店前，照這個順序看", example: "",
    image: "", width: 0, height: 0, alt: "", caption: "", caseUrl: "", caseLabel: "",
  },
  {
    id: "trial-booking", icon: "calendar" as const, category: "體驗預約", title: "體驗預約，讓顧客自己選時間。",
    summary: "讓顧客自己選時間，省下來回確認與重複建檔。",
    cost: "顧客問「什麼時候可以體驗？」你查時間、回訊息，再等對方確認。約好後，還要把姓名和電話輸入系統，排到當天的預約裡。同一筆預約，又得忙一次。",
    action: "顧客在線上選好體驗時間、填完資料並送出成功，蒸管家就會自動建立顧客資料，排到選好的日期和時間。設定好 LINE 通知後，店長也會收到體驗客資訊。",
    steps: ["先設定哪幾天、哪些時間可以體驗，每個時段能接幾位。", "把體驗預約連結放在店家的官方 LINE，讓顧客自己選時間。", "收到通知後，查看當天的預約名單，準備接待顧客。"],
    takeaway: "顧客填一次，你就少抄一次，也少一輪來回確認。",
    note: "顧客要完成預約並送出才算約好。只在 LINE 留言詢問，還不會排進預約。店長要收到通知，也需要先完成 LINE 連接與通知設定。",
    image: "/pricing/business-assets/booking-time-original.png", width: 1532, height: 1364,
    alt: "暖暖蒸足體驗預約頁的可約日期與時段", caption: "暖暖蒸足預約畫面・點圖放大",
    caseUrl: "/pricing/cases?store=nuannuan", caseLabel: "看看暖暖蒸足怎麼用",
  },
  {
    id: "arrival-reminder", icon: "bell" as const, category: "到店提醒", title: "到店提醒，交給蒸管家。",
    summary: "讓蒸管家發提醒，你再看誰回覆、誰改時間。",
    cost: "每天找出明天的預約，一個一個傳提醒，再看看誰回了、誰要改時間。訊息散在不同對話裡，忙著服務時還要來回找。",
    action: "開啟到店提醒後，蒸管家會照你設定的時間發送。顧客可以點卡片上的按鈕改期或取消；如果卡片有「確認會到」，顧客按下後，你也能在後台看到。",
    steps: ["選好什麼時候提醒、要說什麼，例如體驗前一天提醒顧客準時到店。", "確認店家的 LINE 已連接蒸管家，提醒已開啟，通知也有設定好要傳給誰。", "每天看看提醒有沒有發出、誰改期或取消，再幫需要協助的顧客處理。"],
    takeaway: "提醒交給蒸管家，需要多聊幾句的顧客，留給你親自關心。",
    note: "不同預約和店內設定，卡片按鈕可能不同。下圖是改期和取消的示意，顧客要完成操作才算更改成功。提醒發出了，也不代表顧客一定會到。",
    image: "/pricing/business-assets/brand-reminder-example.jpeg", width: 1058, height: 1487,
    alt: "林小姐的蒸管家預約提醒示意卡片，包含日期時間、店名與改時段及取消前往選項", caption: "新版提醒示意・姓名與預約資料為範例・點圖放大",
    caseUrl: "/pricing/cases?store=nuanmu", caseLabel: "看看暖沐蒸足怎麼用",
  },
  {
    id: "plan-expiry", icon: "calendar-clock" as const, category: "方案到期", title: "方案快到期，提早提醒顧客。",
    summary: "不用一個一個查到期日，提早提醒顧客約時間。",
    cost: "你得一個一個查方案哪天到期、還剩幾堂，再問顧客什麼時候有空。忙起來忘了提醒，等顧客想預約，才發現已經過期。",
    action: "開啟方案到期提醒後，蒸管家會依到期日和店內設定發通知。顧客看到還剩幾堂、哪天到期，就能接著預約，有問題也能聯繫店長。",
    steps: ["先確認顧客的方案哪天到期、還剩幾堂。", "確認店內有方案到期提醒功能，設定提醒時間，並開啟 LINE 通知。", "讓顧客自己選時間預約。時間不好安排或有其他問題，再請他聯繫你。"],
    takeaway: "讓系統幫你記得到期日，把時間留給真正需要你關心的顧客。",
    note: "收到提醒不代表已經預約，也不會延長方案期限。顧客仍要在期限內，選擇店內開放的時間預約。",
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
        <div className="max-w-2xl">
          <div>
            <p className="flex items-center gap-2 text-sm text-[#74603C]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0">
                <path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" />
              </svg>
              店長經營指南
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-snug sm:text-4xl">一個人顧店，<br />也能少忙一點。</h1>
            <p className="mt-3 text-base leading-7 text-[#4C6259]">排時間、看預約、做提醒。選一篇，把方法帶回店裡。</p>
          </div>

        </div>
        <div className="mt-5 space-y-3">
          {guides.map((guide, index) => (
            <details key={guide.id} id={guide.id} name="store-guide" className="group scroll-mt-6 rounded-2xl border border-[#153B31]/20 bg-white open:border-[#153B31]/50">
              <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3 text-sm font-medium text-[#74603C]"><MarketingIcon kind={guide.icon} />0{index + 1} · {guide.category}</span>
                <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{guide.title}</h2>

                <span className="mt-2 block text-base font-medium group-open:hidden">閱讀做法 ＋</span>
                <span className="mt-2 hidden text-base font-medium group-open:block">收起文章 −</span>
              </summary>
              <article aria-label={guide.title} className="border-t border-[#153B31]/15 p-5 sm:p-6">
                <p className="mb-5 text-base leading-7 text-[#4C6259]">{guide.summary}</p>
                <div className="grid gap-5 md:grid-cols-2">
                  <section>
                    <h3 className="text-lg font-semibold">時間花在哪裡？</h3>
                    <p className="mt-2 text-base leading-7 text-[#4C6259]">{guide.cost}</p>
                  </section>
                  <section className="rounded-xl bg-[#EEF4F0] p-4">
                    <h3 className="text-lg font-semibold">怎麼做比較省事？</h3>
                    <p className="mt-2 text-base leading-7">{guide.action}</p>
                  </section>
                </div>
                <div className="mt-5 grid items-start gap-5 md:grid-cols-2">
                  {guide.checklist ? (
                    <section className="rounded-xl border border-[#153B31]/15 bg-[#FAF8F2] p-4">
                      <h3 className="text-lg font-semibold">{guide.checklistTitle}</h3>
                      <dl className="mt-3 divide-y divide-[#153B31]/15">
                        {guide.checklist.map(([label, value]) => <div key={label} className="py-3">
                          <dt className="text-base font-semibold">{label}</dt>
                          <dd className="mt-1 text-base leading-7 text-[#4C6259]">{value}</dd>
                        </div>)}
                      </dl>
                      {guide.example ? <div className="mt-3 border-t border-[#153B31]/15 pt-3">
                        <h4 className="text-base font-semibold">可以這樣回顧客</h4>
                        <blockquote className="mt-2 text-base leading-7 text-[#4C6259]">{guide.example}</blockquote>
                      </div> : null}
                    </section>
                  ) : guide.image ? (
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
                        <p className="mt-2 text-base leading-7 text-[#4C6259]">記得在方案到期前預約。時間不好安排，也可以找店長幫忙。</p>
                      </div>
                      <figcaption className="bg-[#FAF8F2] p-3 text-sm leading-6 text-[#4C6259]">通知內容示意・姓名、堂數與日期皆為範例</figcaption>
                    </figure>
                  )}
                  <section>
                    <h3 className="text-lg font-semibold">你可以這樣做</h3>
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
          <h2 id="guide-contact" className="text-xl font-semibold">你最想先少忙哪件事？</h2>
          <p className="mt-2 text-base leading-7 text-[#D4E0D8]">告訴我們店裡最忙的是什麼，我們會聯繫你，安排適合的體驗。</p>
          <a href="/pricing/apply.html?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=guides" className="mt-4 inline-flex min-h-12 items-center rounded-full bg-[#F8F5EE] px-6 py-3 text-base font-semibold text-[#153B31]">申請體驗帳號</a>
        </section>
      </main>
      <footer className="border-t border-[#153B31]/15 px-5 py-5 text-center text-sm leading-6 text-[#4C6259]">蒸管家｜每一家店，都值得擁有一位數位管家。<div className="mt-3 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm leading-6"><a href="mailto:steambutler500@gmail.com" className="break-all underline underline-offset-4">客服信箱：steambutler500@gmail.com</a><a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">官方 LINE：@329rmywc（加入官方 LINE）</a><a href="/privacy" className="underline underline-offset-4">隱私權政策</a><a href="/pricing/terms.html" className="underline underline-offset-4">服務條款</a><a href="/pricing/refunds.html" className="underline underline-offset-4">取消與退費政策</a><p className="w-full text-center">陸比音樂工作室｜統一編號：31789116<br />聯絡地址：新竹縣竹北市科大一路116號</p></div></footer>
    </div>
  );
}
