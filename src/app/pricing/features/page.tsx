import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingIcon } from "../marketing-icon";

export const metadata: Metadata = {
  title: "功能介紹｜少一點手動，多一點照顧 — 蒸管家",
  description: "先了解預約、顧客資料、方案堂數與基本收款，再用店家日常情境認識提醒、健康追蹤、月結與分析等進階功能。原本怎麼做，使用蒸管家後有什麼不同？",
};

const features = [
  {
    id: "reminders", name: "LINE 自動提醒", icon: "bell", fee: 500,
    title: "明天的顧客，你還在一個個傳訊息嗎？",
    before: "服務做到晚上，還要翻明天的預約，逐筆提醒，再整理誰回覆會到。",
    after: "依設定發送預約提醒。顧客點選確認會到，店長直接在後台看狀態。",
    manual: ["翻明天的預約名單", "逐筆傳：明天 14:00 記得來喔", "回頭找：這位回覆了嗎？"],
    takeaway: "把逐筆提醒的時間，留給正在店裡的顧客。",
    detail: "需完成 LINE 串接並啟用提醒規則。顧客可依門市規則改期、取消或導航；確認會到不代表保證到店。",
  },
  {
    id: "export", name: "資料匯出", icon: "checklist", fee: 500,
    title: "想整理這個月的資料，又得重新抄一次？",
    before: "資料在後台，整理報表卻得另外開表格，一筆一筆複製、貼上、核對。",
    after: "選擇可匯出的資料與條件，下載 Excel，接著做需要的整理與核對。",
    manual: ["打開顧客或交易明細", "複製到另一份試算表", "核對有沒有漏掉哪一筆"],
    takeaway: "資料帶得走，少做一次重複輸入。",
    detail: "匯出內容依帳號權限與資料類型提供；不包含健康紀錄、內部備註或 LINE 身分資料。",
  },
  {
    id: "cash", name: "現金抽屜", icon: "store", fee: 500,
    title: "準備打烊，抽屜怎麼又差了 200 元？",
    before: "收款、找零、臨時支出混在一起，現金不對時，只能問今天值班的人。",
    after: "整理開帳、現金異動與關帳清點。對照應有金額與實際現金，留下差額及原因。",
    manual: ["早上放了多少零用金？", "下午是不是付了耗材費？", "少的 200 元，要從哪裡查？"],
    takeaway: "差額有紀錄，交班時不用只靠記憶。",
    detail: "現金仍需現場清點，異動需正確登記；系統協助對帳，不會自動辨識未登記的支出。",
  },
  {
    id: "care", name: "顧客經營", icon: "return", fee: 800,
    title: "那位常來的顧客，好像很久沒看到了。",
    before: "忙起來只顧眼前的預約，直到想起顧客，才發現已經很久沒回來。",
    after: "從好久不見、堂數偏低、方案快到期等名單，找出需要關心的人，並記下追蹤情況。",
    manual: ["憑印象想起一位顧客", "翻聊天、查剩餘堂數", "上次誰聯繫過？說了什麼？"],
    takeaway: "回訪有方向，關心不必等到突然想起。",
    detail: "名單依店內資料與條件整理；店長仍需主動聯繫，這項功能不等於自動代發關懷訊息。",
  },
  {
    id: "health", name: "健康追蹤", icon: "checklist", fee: 800,
    title: "顧客問：跟上次比，有什麼變化？",
    before: "量測數字散在照片、紙本或聊天裡，要回答顧客，就得先找上次的紀錄。",
    after: "把量測紀錄、歷史數據與趨勢放在一起，陪顧客回顧不同時間的變化。",
    manual: ["找上次量測的照片", "確認是哪一天的數字", "把前後紀錄放在一起比較"],
    takeaway: "讓每一次量測，接得上前一次的對話。",
    detail: "依實際記錄呈現，提供日常追蹤參考，不作醫療診斷或效果保證。",
  },
  {
    id: "settlement", name: "月結管理", icon: "calendar", fee: 800,
    title: "月底對帳，總是重算同一套公式？",
    before: "服務金額、分潤、固定月費與加扣項分開整理。改一個數字，又得重算一次。",
    after: "依服務金額與設定核對月結明細，整理固定月費、分潤及加扣項，保留月結紀錄。",
    manual: ["整理本月服務金額", "找分潤、月費與加扣項", "重新計算，再找上月紀錄"],
    takeaway: "每一筆怎麼算，月底有明細可對照。",
    detail: "適合有月費、分潤或合作結算需求的店家；依門市設定計算，不會自動轉帳付款。",
  },
  {
    id: "analysis", name: "分析", icon: "bar-chart", fee: 800,
    title: "客人變多了嗎？體驗成交了嗎？舊客回來了嗎？",
    before: "店裡很忙，經營狀況卻要翻好幾份紀錄才知道。",
    after: "來客、成交、回流與方案購買收入，集中看清楚。",
    manual: ["看預約量，感覺最近很忙", "另外加總每月收入", "新客有回來嗎？再翻紀錄"],
    takeaway: "看客源、看成交、看回流，找到下一步該關心的事。",
    detail: "數據依實際完成服務與交易等紀錄計算；趨勢協助判斷，不代表原因或未來營收保證。",
  },
] as const;

type FeatureId = (typeof features)[number]["id"];
const panel = "rounded-xl border border-[#153B31]/15 bg-white p-4";
function Rows({ items }: { items: readonly (readonly [string, string])[] }) {
  return <dl className="divide-y divide-[#153B31]/10">{items.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm sm:text-base"><dt className="text-[#4C6259]">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>;
}
function Example({ id }: { id: FeatureId }) {
  if (id === "reminders") return <div className="space-y-3">
    <div className={panel}><p className="border-b border-[#153B31]/10 pb-3 font-semibold">LINE｜明天見！</p><Rows items={[["服務", "首次體驗"], ["時間", "明天 14:00"]]} /><p className="mt-2 rounded-lg bg-[#123E32] p-3 text-center text-sm font-medium text-white">確認會到</p><p className="mt-3 text-center text-sm">改期　・　取消　・　導航店家</p></div>
    <p className="rounded-lg bg-[#DCEBE1] p-3 text-sm">店長後台｜範例顧客 <strong className="block pt-1">已確認會到</strong></p>
  </div>;
  if (id === "export") return <div className={panel}>
    <p className="font-semibold">資料匯出</p><Rows items={[["資料類型", "顧客資料"], ["輸出格式", "Excel"]]} />
    <div className="mt-3 overflow-hidden rounded-lg border border-[#153B31]/15 text-sm"><div className="grid grid-cols-2 bg-[#E9F1EB] p-3 font-medium"><span>顧客</span><span>資料整理</span></div><div className="grid grid-cols-2 p-3"><span>範例顧客 A</span><span>匯出資料列</span></div><div className="grid grid-cols-2 border-t border-[#153B31]/10 p-3"><span>範例顧客 B</span><span>匯出資料列</span></div></div><p className="mt-3 rounded-lg bg-[#123E32] p-3 text-center text-sm text-white">下載 Excel，接續整理</p>
  </div>;
  if (id === "cash") return <div className={panel}>
    <p className="font-semibold">今日關帳</p><Rows items={[["系統應有現金", "NT$8,200"], ["實際清點現金", "NT$8,000"]]} /><div className="mt-3 rounded-lg border border-[#B48A42]/40 bg-[#FBF4E5] p-3"><p className="font-semibold">差額 −NT$200</p><p className="mt-2 text-sm leading-6">核對現金異動，補充差額原因。</p></div>
  </div>;
  if (id === "care") return <div className={panel}>
    <p className="font-semibold">今天，先關心誰？</p><Rows items={[["範例顧客 A", "好久不見"], ["範例顧客 B", "剩餘 2 堂"], ["範例顧客 C", "方案快到期"]]} /><div className="mt-3 rounded-lg bg-[#E9F1EB] p-3 text-sm leading-6"><p className="font-semibold">追蹤紀錄｜範例顧客 A</p><p className="mt-1">已聯繫，顧客表示下週再安排時間。</p></div>
  </div>;
  if (id === "health") return <div className={panel}>
    <p className="font-semibold">範例顧客｜歷史量測</p><p className="mt-2 text-sm text-[#4C6259]">體重紀錄 · kg</p><Rows items={[["8 月 1 日", "68.0"], ["8 月 15 日", "67.6"], ["9 月 1 日", "67.8"]]} /><p className="mt-3 rounded-lg bg-[#E9F1EB] p-3 text-sm leading-6">前後紀錄一起看，也保留每次的變化。</p>
  </div>;
  if (id === "settlement") return <div className={panel}>
    <p className="font-semibold">本月月結明細</p><Rows items={[["有效營收", "NT$30,000"], ["分潤金額", "− NT$6,000"], ["固定月費", "+ NT$2,000"], ["其他扣項", "− NT$500"]]} /><p className="mt-3 flex flex-wrap justify-between gap-2 rounded-lg bg-[#E9F1EB] p-3 font-semibold"><span>本月應收</span><span>NT$25,500</span></p>
  </div>;
  return <div className={panel}>
    <p className="flex flex-wrap items-center justify-between gap-2 font-semibold"><span>店長經營儀表板</span><span className="text-sm font-normal text-[#4C6259]">9 月 · 範例資料</span></p>
    <div className="mt-4 grid grid-cols-2 gap-2">
      {[["來客數", "120 位"], ["新客數", "30 位"], ["體驗", "20 人次"], ["本月體驗開卡", "8 位"], ["本月回流", "60 位"], ["方案購買收入", "NT$96,000"]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#E9F1EB] p-3"><p className="text-sm leading-6 text-[#4C6259]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}
    </div>
    <div className="mt-4 rounded-lg border border-[#967039]/30 bg-[#FBF6EB] p-3"><p className="text-sm font-medium">體驗 → 開卡</p><p className="mt-1 text-2xl font-semibold">40% <span className="text-sm font-normal">本月體驗開卡率</span></p><div className="mt-2 h-3 rounded-full bg-[#E8E1D3]"><div className="h-3 w-2/5 rounded-full bg-[#967039]" /></div><p className="mt-2 text-sm leading-6">20 人次體驗，8 位本月體驗開卡。</p></div>
    <p className="mt-4 border-t border-[#153B31]/10 pt-3 text-sm leading-6">客流、成交與回流可比較上月及去年同月；另有六個月經營趨勢。</p>
  </div>;
}

function BeforeExample({ id }: { id: FeatureId }) {
  if (id === "analysis") return <ul className="divide-y divide-[#B48A42]/20 rounded-xl border border-[#B48A42]/20 bg-white px-4">
    {["翻預約，才知道新客有沒有增加", "對體驗與交易，才知道誰開卡了", "找上月名單，才知道誰還沒回來"].map(item => <li key={item} className="py-3 text-base leading-6">{item}</li>)}
  </ul>;
  if (id === "reminders" || id === "care") return <div className="space-y-3 rounded-xl border border-[#153B31]/15 bg-[#E6E4DF] p-4">
    <p className="text-sm text-[#64756D]">分散在不同對話裡</p>
    {(id === "reminders" ? [["顧客 A", "明天 14:00 記得來喔！"], ["顧客 B", "可以改時間嗎？"], ["店長", "還有誰沒回覆？"]] : [["店長", "她上次來是什麼時候？"], ["同事", "我找一下聊天紀錄。"], ["店長", "有人聯繫過她嗎？"]]).map(([name, message], i) => <div key={name} className={"max-w-[90%] rounded-xl bg-white p-3 " + (i === 1 ? "ml-auto" : "")}><p className="text-sm text-[#74603C]">{name}</p><p className="mt-1 text-base leading-6">{message}</p></div>)}
  </div>;
  const sheets = {
    export: [["後台明細", "顧客 A　｜　顧客 B"], ["整理中的表格", "複製　→　貼上　→　再核對"], ["待確認", "這一筆是不是漏了？"]],
    cash: [["開店紀錄", "零用金　NT$2,000"], ["臨時支出便條", "耗材　NT$200　待登記"], ["關帳清點", "實際 NT$8,000　／　差額？"]],
    health: [["8 月的照片", "體重 68.0 kg"], ["另一本量測紀錄", "67.6 kg　／　日期？"], ["聊天裡的紀錄", "上次是傳在哪個對話？"]],
    settlement: [["服務金額表", "本月 NT$30,000"], ["合作條件", "分潤 20%　＋　固定月費"], ["加扣項便條", "另扣 NT$500，記得重算"]],
  } as const;
  return <div className="space-y-3">{sheets[id].map(([title, content], i) => <div key={title} className={"rounded-lg border border-[#B48A42]/25 bg-white p-4 shadow-sm " + (i % 2 ? "ml-4" : "mr-4")}><p className="border-b border-[#153B31]/10 pb-2 text-sm font-medium text-[#74603C]">{title}</p><p className="mt-2 text-base leading-6">{content}</p></div>)}</div>;
}

export default function FeaturesPage() {
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <MarketingNavigation active="features" />
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <p className="text-sm text-[#74603C]">功能介紹｜從店裡的一天開始</p>
      <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-snug sm:text-4xl lg:text-5xl">從預約到回訪，店裡的日常有人幫你整理。</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[#4C6259]">先把預約、顧客、堂數與收款管好，再依店裡需要，加上提醒、追蹤與分析。</p>
      <nav aria-label="功能介紹閱讀導覽" className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a href="#daily" className="inline-flex min-h-11 items-center underline underline-offset-4">日常基本功能 ↓</a>
        <a href="#more" className="inline-flex min-h-11 items-center underline underline-offset-4">看看進階功能 ↓</a>
        <Link href="/pricing#comparison" className="inline-flex min-h-11 items-center underline underline-offset-4">比較方案 →</Link>
      </nav>
      <section id="daily" aria-labelledby="daily-title" className="mt-7 scroll-mt-24">
        <div className="flex flex-wrap items-center gap-3"><h2 id="daily-title" className="text-2xl font-semibold">先把每天的店務，放在一起。</h2><span className="rounded-full bg-[#E9F1EB] px-3 py-1 text-sm font-medium">三個方案皆包含</span></div>
        <p className="mt-2 text-base leading-7 text-[#4C6259]">從顧客預約，到店長查資料、確認堂數與收款，接起每天會做的事。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "calendar", name: "預約管理", context: "今天誰要來？幾點有空？", benefit: "集中查看預約，安排店裡的服務時間。" },
            { icon: "return", name: "顧客資料", context: "這位顧客，上次聊了什麼？", benefit: "查詢聯絡資料、備註與服務紀錄，接續照顧。" },
            { icon: "checklist", name: "方案堂數", context: "還剩幾次？什麼時候到期？", benefit: "查看方案剩餘堂數與期限，服務完成後核對扣堂。" },
            { icon: "store", name: "基本收款", context: "這次服務，收了多少錢？", benefit: "記錄服務收款，留下可查詢的交易紀錄。" },
            { icon: "chat", name: "LINE 顧客入口", context: "顧客想預約，不用等你回訊息。", benefit: "從店家 LINE 預約、依規則取消與查詢堂數。" },
          ].map(item => <article key={item.name} className="flex items-start gap-3 rounded-xl border border-[#153B31]/15 bg-white p-4 sm:p-5"><MarketingIcon kind={item.icon as "calendar" | "return" | "checklist" | "store" | "chat"} /><div><h3 className="text-lg font-semibold">{item.name}</h3><p className="mt-1 text-sm font-medium leading-6">{item.context}</p><p className="mt-1 text-sm leading-6 text-[#4C6259]">{item.benefit}</p></div></article>)}
          <div className="flex flex-col justify-center rounded-xl bg-[#E9F1EB] p-5"><p className="text-lg font-semibold">先用基本功能，把日常整理好。</p><p className="mt-2 text-sm leading-6 text-[#4C6259]">各方案的使用規模與進階功能名額不同。</p><Link href="/pricing#comparison" className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4">查看方案差異 →</Link></div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#4C6259]">LINE 顧客入口需完成串接並開通；自動提醒是下方的進階功能。</p>
      </section>
      <section id="more" aria-labelledby="more-title" className="mt-10 scroll-mt-24 border-t border-[#153B31]/20 pt-7 sm:mt-12">
        <h2 id="more-title" className="text-2xl font-semibold">哪件事，最想有人幫你分擔？</h2>
        <p className="mt-2 text-base leading-7 text-[#4C6259]">選一項看看：原本怎麼做，使用蒸管家後有什麼不同。</p>
        <nav aria-label="選擇功能情境" className="mt-4 grid gap-3 md:grid-cols-2">
          {[500, 800].map(fee => <div key={fee} className="rounded-xl border border-[#153B31]/15 bg-white p-4 sm:p-5"><h3 className="text-lg font-semibold">{fee === 500 ? "省下日常作業" : "掌握顧客與經營"}</h3><div className="mt-3 grid grid-cols-2 gap-2">{features.filter(item => item.fee === fee).map(item => <a key={item.id} href={"#" + item.id} className="flex min-h-11 items-center justify-between gap-1 rounded-lg bg-[#F8F5EE] px-3 py-2 text-sm hover:bg-[#E9F1EB] focus-visible:outline-2 focus-visible:outline-offset-2">{item.name}<span aria-hidden="true">↓</span></a>)}</div><p className="mt-3 text-sm leading-6 text-[#4C6259]">{fee === 500 ? "工具型模組" : "經營型模組"}・額外加購每項 NT${fee}／月</p></div>)}
        </nav>
        <p className="mt-3 text-sm leading-6 text-[#4C6259]">方案已內含或使用任選名額的功能，不另收費。<Link href="/pricing#comparison" className="inline-flex min-h-11 items-center underline underline-offset-4">查看哪些功能已包含 →</Link></p>
      </section>
      <div className="mt-10 space-y-10">
        {features.map((feature, index) => <article key={feature.id} id={feature.id} aria-labelledby={feature.id + "-title"} className="scroll-mt-24 border-t border-[#153B31]/20 pt-6">
          <p className="flex items-center gap-3 text-base font-semibold"><MarketingIcon kind={feature.icon} /><span className="text-[#74603C]">0{index + 1}</span>{feature.name}</p>
          <h2 id={feature.id + "-title"} className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">{feature.title}</h2>
          <div className={"mt-5 grid gap-3 " + (feature.id === "analysis" ? "items-start md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "md:grid-cols-2")}>
            <section aria-label={feature.name + "原本的做法"} className="rounded-2xl border border-[#B48A42]/20 bg-[#F0EBE1] p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-[#74603C]">原本｜店長一件件處理</h3>
              <p className="mt-2 text-base leading-7">{feature.before}</p>
              <figure className="mt-5"><BeforeExample id={feature.id} /><figcaption className="mt-2 text-sm text-[#64756D]">原本的工作情境示意</figcaption></figure>
            </section>
            <section aria-label={feature.name + "使用蒸管家後"} className="rounded-2xl border border-[#153B31]/20 bg-[#E9F1EB] p-4 sm:p-6">
              <h3 className="text-sm font-semibold">使用蒸管家後</h3><p className="mt-2 text-base leading-7">{feature.after}</p>
              <figure className="mt-5"><Example id={feature.id} /><figcaption className="mt-2 text-sm leading-6 text-[#64756D]">功能示意・範例資料，非真實店家成果</figcaption></figure>
            </section>
          </div>
          <p className="mt-4 border-l-4 border-[#967039] pl-4 text-lg font-medium leading-7">{feature.takeaway}</p>
          <details className="mt-3 text-sm leading-6 text-[#4C6259]"><summary className="cursor-pointer">功能使用說明</summary><p className="mt-2">{feature.detail}</p></details>
        </article>)}
      </div>
      <section aria-labelledby="next-step" className="mt-12 rounded-2xl bg-[#123E32] p-6 text-white sm:p-8"><h2 id="next-step" className="text-2xl font-semibold">找到需要的功能，再選適合的方案。</h2><p className="mt-3 text-base leading-7 text-[#D4E0D8]">依需求選功能，已包含的不用重複買。選定後由總部協助確認與開通。</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/pricing#comparison" className="rounded-full bg-white px-5 py-3 text-base font-semibold text-[#123E32]">比較方案與價格</Link><a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/50 px-5 py-3 text-base">聊聊店裡的需求</a></div></section>
    </main>
    <MarketingFooter />
  </div>;
}
