import { MarketingBrand } from "@/components/marketing-brand";
import { MarketingIcon } from "./marketing-icon";
import { PLAN_LIMITS } from "@/lib/feature-flags";

export const metadata = {
  title: "方案與價格 — 蒸管家",
  description: "蒸管家｜店務管理系統，適用於預約制門市、工作室與服務品牌。比較適合店家、價格與功能差異。",
};
const TRIAL_URL = "/apply?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=pricing";
const plans = [
  { id: "BASIC", name: "基本版", icon: "store", purpose: "管好日常", audience: "個人工作室、小型單店", price: "1,490", original: "2,100", annual: "17,880", difference: "預約、顧客、堂數、收款集中管理", highlights: ["預約與顧客管理", "方案堂數與基本收款"], tools: "工具功能任選 1 項，月費已含", management: "經營功能可另外加購", stores: "單店使用" },
  { id: "GROWTH", name: "專業版", icon: "return", purpose: "做好回訪", audience: "重視回訪、續購與帳務的單店", price: "2,490", original: "3,600", annual: "29,880", difference: "基本版功能＋顧客經營、現金抽屜", highlights: ["包含基本版功能", "顧客經營與現金抽屜"], tools: "工具功能任選 1 項，月費已含", management: "經營功能任選 1 項（分析另購）", stores: "單店使用" },
  { id: "ALLIANCE", name: "展店版", icon: "stores", purpose: "管理多店", audience: "多店品牌、準備展店的店家", price: "4,990", original: "7,100", annual: "59,880", difference: "專業版功能＋多店管理、月結管理", highlights: ["包含專業版功能", "多店管理與月結管理"], tools: "下列工具功能全部內含", management: "下列經營功能全部內含", stores: "總部管理 + 1 家分店" },
] as const;
const limits = [
  { label: "員工帳號", field: "maxStaff", unit: "位" },
  { label: "顧客資料", field: "maxCustomers", unit: "筆" },
  { label: "每月預約", field: "maxMonthlyBookings", unit: "筆" },
] as const;
function TrialLink() {
  return <a href={TRIAL_URL} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#123E32] px-5 py-3 text-sm font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4">申請體驗帳號<span aria-hidden="true" className="ml-2">→</span></a>;
}
function PlanDetails({ plan }: { plan: (typeof plans)[number] }) {
  return <>
          <div className="mx-5 border-t border-[#153B31]/15 py-3">
            <p className="text-sm text-[#64756D] line-through">原價 NT${plan.original}／月{plan.id === "ALLIANCE" ? "起" : ""}</p>
            <p className="mt-1"><span className="text-3xl font-semibold tracking-tight">NT${plan.price}</span><span className="ml-1 text-sm">／月{plan.id === "ALLIANCE" ? "起" : ""}</span></p>
            <p className="mt-2 text-sm font-medium">年繳 NT${plan.annual}{plan.id === "ALLIANCE" ? "起" : ""}，使用 14 個月</p>
          </div>
          <div className="mx-5 border-t border-[#153B31]/15 py-3"><h3 className="text-sm text-[#4C6259]">功能差異</h3><ul className="mt-1 space-y-1 text-base font-medium">{plan.highlights.map(item => <li key={item} className="flex gap-2"><span aria-hidden="true">✓</span>{item}</li>)}</ul></div>
          <div className="mx-5 border-t border-[#153B31]/15 py-3"><h3 className="text-sm text-[#4C6259]">可選哪些功能</h3><p className="mt-1 leading-6">{plan.tools}</p><p className="leading-6">{plan.management}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#153B31]/5 px-3 py-2 text-sm"><span className="font-semibold">分析</span><span className="font-medium">{plan.id === "ALLIANCE" ? "✓ 已包含" : "另購 NT$800／月"}</span></div></div>
          <div className="mx-5 border-t border-[#153B31]/15 py-3"><h3 className="mb-2 text-sm text-[#4C6259]">使用規模</h3><dl className="space-y-2">{limits.map(item => {
            const value = PLAN_LIMITS[plan.id][item.field];
            return <div key={item.field} className="flex justify-between gap-2 text-base"><dt className="text-[#4C6259]">{item.label}</dt><dd className="font-medium">{value === null ? "無限制" : `${value.toLocaleString()} ${item.unit}`}</dd></div>;
          })}</dl><p className="mt-3 border-t border-[#153B31]/10 pt-3 text-sm">{plan.stores}</p>{plan.id === "ALLIANCE" && <p className="mt-2 text-sm leading-6 text-[#4C6259]">第二家分店起，每家 +$1,000/月分店營運費。實際門市數量與開通範圍於申請時確認。</p>}</div>
          <div className="px-5 pb-5"><TrialLink /></div>
  </>;
}
export default function PricingPage() {
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <header className="border-b border-[#153B31]/15 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <MarketingBrand /><TrialLink />
      </div>
    </header>
    <main id="plans" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-6">
        <p className="text-sm text-[#74603C]">方案與價格</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">選擇適合你門市的管家。</h1>
        <p className="mt-3 text-base leading-7 text-[#4C6259]">從日常店務、顧客回訪到多店管理，依你的經營需要選擇。</p>
      </div>
      <section aria-label="手機版方案比較" className="mb-5 space-y-3 lg:hidden">
        <p className="text-sm text-[#4C6259]">先比較差異，點選方案查看完整內容。</p>
        {plans.map(plan => <details key={plan.id} name="mobile-plan" className={"group rounded-xl border border-[#153B31]/20 " + (plan.id === "GROWTH" ? "bg-[#E9F1EB]" : "bg-white")}>
          <summary className="cursor-pointer list-none p-4 focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="inline-flex items-center gap-2 text-xl font-semibold"><MarketingIcon kind={plan.icon} />{plan.name}</span><span className="whitespace-nowrap"><span className="text-2xl font-semibold">NT${plan.price}</span><span className="text-sm">／月{plan.id === "ALLIANCE" ? "起" : ""}</span></span></span>
            <span className="mt-3 block text-lg font-semibold">{plan.purpose}</span><span className="mt-1 block text-base leading-7 text-[#4C6259]">適合{plan.audience}</span>
            <span className="mt-1 block text-base font-medium leading-7">{plan.difference}</span>
            <span className="mt-2 block text-sm font-medium"><span className="group-open:hidden">查看方案細節 ＋</span><span className="hidden group-open:inline">收合方案細節 −</span></span>
          </summary>
          <PlanDetails plan={plan} />
        </details>)}
      </section>
      <section aria-label="三個方案共同內含" className="mb-5 rounded-xl border border-[#153B31]/15 bg-white p-4">
        <h2 className="font-semibold">三個方案都包含</h2>
        <p className="mt-2 text-base leading-7 text-[#4C6259]">預約管理・顧客資料・方案堂數・基本收款</p>
        <p className="mt-1 text-sm leading-6 text-[#4C6259]">LINE 顧客入口（LIFF）皆內含，可預約、取消與查詢堂數；保留各門市獨立開關。</p>
      </section>
      <section aria-label="方案比較" className="hidden gap-4 lg:grid lg:grid-cols-3 lg:gap-x-4 lg:gap-y-0">
        {plans.map(plan => <article key={plan.id} aria-labelledby={plan.id} className={"grid gap-0 overflow-hidden rounded-2xl border border-[#153B31]/20 lg:row-span-6 lg:grid-rows-subgrid " + (plan.id === "GROWTH" ? "bg-[#E9F1EB]" : "bg-white")}>
          <div className="px-5 py-3">
            <h2 id={plan.id} className="flex items-center gap-3 text-xl font-semibold"><MarketingIcon kind={plan.icon} />{plan.name}</h2>
            <p className="mt-1 text-lg font-medium">{plan.purpose}</p>
            <p className="mt-1 text-base leading-6 text-[#4C6259]">適合{plan.audience}</p>
          </div>
          <PlanDetails plan={plan} />
        </article>)}
      </section>
      <p className="mt-4 text-sm leading-6 text-[#4C6259]">限時優惠｜主方案繳 12 個月，使用 14 個月。額外模組與分店營運費另計；優惠結束後依正式原價調整。</p>
      <section aria-labelledby="addons" className="mt-8 border-t border-[#153B31]/15 pt-6">
        <h2 id="addons" className="text-2xl font-semibold">需要更多功能，再加就好。</h2>
        <p className="mt-2 text-base leading-7 text-[#4C6259]">先用方案內含的功能；需要更多時，再按項目加購。</p>
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
          <details open className="rounded-xl border border-[#153B31]/15 bg-white p-4">
            <summary className="cursor-pointer text-base font-semibold">工具型模組 <span className="ml-2 font-normal">每個 $500／月</span></summary>
            <ul className="mt-3 space-y-3 text-base leading-7">{([{ name: "LINE 自動提醒", icon: "bell" }, { name: "資料匯出", icon: "checklist" }, { name: "現金抽屜", icon: "store" }] as const).map(item => <li key={item.name} className="flex items-center gap-3"><MarketingIcon kind={item.icon} /><span>{item.name}</span></li>)}</ul>
          </details>
          <details open className="rounded-xl border border-[#153B31]/15 bg-white p-4">
            <summary className="cursor-pointer text-base font-semibold">經營型模組 <span className="ml-2 font-normal">每個 $800／月</span></summary>
            <ul className="mt-3 space-y-3 text-base leading-7">{([{ name: "顧客經營", icon: "return" }, { name: "健康評估與體態追蹤", icon: "checklist" }, { name: "月結管理", icon: "calendar" }, { name: "分析", icon: "bar-chart" }] as const).map(item => <li key={item.name} className="flex items-start gap-3"><MarketingIcon kind={item.icon} /><div><span>{item.name}</span>{item.name === "分析" && <p className="text-sm leading-6 text-[#4C6259]"><span className="inline-block rounded-full bg-[#E9F1EB] px-2 py-0.5">獨立加購・展店版內含</span></p>}</div></li>)}</ul>
          </details>
        </div>
        <details className="mt-4 border-t border-[#153B31]/15 py-3"><summary className="cursor-pointer font-medium">申請前須知</summary>
          <dl className="mt-3 grid gap-4 text-base leading-7 sm:grid-cols-3">
            <div><dt className="font-medium">體驗怎麼開始？</dt><dd className="mt-1 text-[#4C6259]">填寫門市需求後，由專人聯繫，確認體驗內容與期限，再提供登入方式。</dd></div>
            <div><dt className="font-medium">開通前確認哪些費用？</dt><dd className="mt-1 text-[#4C6259]">確認選用項目、額外費用與優惠期間後再開通；數位管家另行確認開通，LINE 訊息等第三方費用另外確認。</dd></div>
            <div><dt className="font-medium">健康評估提供什麼？</dt><dd className="mt-1 text-[#4C6259]">量測紀錄、歷史數據與變化趨勢，協助體態追蹤；不作醫療診斷或效果保證。</dd></div>
          </dl></details>
      </section>
    </main>
    <section className="bg-[#123E32] px-5 py-8 text-center text-white">
      <h2 className="text-2xl font-semibold"><span className="block sm:inline">每一家店，</span><span>都值得擁有一位<span className="whitespace-nowrap">數位管家。</span></span></h2>
      <p className="mx-auto mt-3 max-w-4xl text-base leading-7 text-[#D4E0D8]">預約、堂數、收款一次整理，專心照顧顧客。</p>
      <a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-white/50 px-5 py-3 font-medium">還不確定？加 LINE 聊聊</a>
    </section>
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-[#4C6259] sm:px-8"><p>蒸管家｜店務管理系統</p><a href={TRIAL_URL} className="py-2 underline underline-offset-4">申請體驗帳號</a><div className="mt-3 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm leading-6"><a href="mailto:steambutler500@gmail.com" className="break-all underline underline-offset-4">客服信箱：steambutler500@gmail.com</a><a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">官方 LINE：@329rmywc</a><a href="/privacy" className="underline underline-offset-4">隱私權政策</a><a href="/terms" className="underline underline-offset-4">服務條款</a><a href="/refunds" className="underline underline-offset-4">取消與退費政策</a><p className="w-full text-center">陸比音樂工作室｜統一編號：31789116<br />聯絡地址：新竹縣竹北市科大一路116號</p></div></footer>
  </div>;
}
