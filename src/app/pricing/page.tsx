import { ALLIANCE_BRANCH_PRICING_COPY } from "@/lib/alliance-subscription";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { AddonOffer, PricingOffer, PricingOfferTerms } from "./pricing-offer";
import { PUBLIC_PRICING_PLANS as plans } from "@/lib/public-pricing-offer";

export const dynamic = "force-dynamic";
import { PLAN_LIMITS } from "@/lib/feature-flags";

export const metadata = {
  title: "方案與價格 — 蒸管家",
  description: "蒸管家｜店務管理系統，適用於預約制門市、工作室與服務品牌。新客 30 天免費體驗，單店功能完整開放，轉正式沿用原帳號與資料。比較方案價格、年繳省額與限時加購優惠。",
};
const TRIAL_URL = "/apply";
const featureLinks: Record<string, string> = {
  "LINE 自動提醒": "reminders", "資料匯出": "export", "現金抽屜": "cash",
  "顧客經營": "care", "健康追蹤": "health", "月結管理": "settlement", "分析": "analysis", "課程候補": "waitlist", "顧客標籤": "labels",
};
const limits = [
  { label: "可啟用人員", field: "maxStaff", unit: "位" },
  { label: "顧客資料", field: "maxCustomers", unit: "筆" },
  { label: "每月預約", field: "maxMonthlyBookings", unit: "筆" },
] as const;
const groups = [
  { title: "工具功能", note: "基本版：以下 3 選 1。專業版：現金抽屜已含，提醒／匯出再選 1 項。展店版：全部內含。", rows: [
    { label: "LINE 自動提醒", values: ["可選", "可選", "內含"] },
    { label: "資料匯出", values: ["可選", "可選", "內含"] },
    { label: "現金抽屜", values: ["可選", "內含", "內含"] },
  ] },
  { title: "經營功能", note: "基本版：依需求加購。專業版：顧客經營與分析已含，標籤／健康／月結／候補再選 1 項。展店版：全部內含。", rows: [
    { label: "顧客經營", values: ["加購", "內含", "內含"] },
    { label: "顧客標籤", values: ["加購", "可選", "內含"] },
    { label: "健康追蹤", values: ["加購", "可選", "內含"] },
    { label: "月結管理", values: ["加購", "可選", "內含"] },
    { label: "分析", values: ["加購", "內含", "內含"] },
    { label: "課程候補", values: ["加購", "可選", "內含"] },
  ] },
] as const;

function OnlinePayment() {
  const methods = [
    { title: "一般付款", description: "信用卡一次付清／ATM 轉帳／Apple Pay", href: "https://p.ecpay.com.tw/034265F", button: "一般付款", installment: false },
    { title: "信用卡 3 期", description: "年繳分 3 期，適用年繳優惠與贈送活動。", href: "https://p.ecpay.com.tw/025288F", button: "信用卡 3 期付款", installment: true },
  ];
  return <section id="payment" aria-labelledby="payment-title" className="mt-8 scroll-mt-24 rounded-2xl border border-[#153B31]/20 bg-white p-5 sm:p-6">
    <p className="text-sm font-semibold tracking-widest text-[#74603C]">綠界 ECPay 金流</p>
    <h2 id="payment-title" className="mt-1 text-2xl font-semibold">線上付款</h2>
    <p className="mt-2 text-base leading-7 text-[#4C6259]">已確認方案的店家，請依雙方確認的方案及加購總額付款。</p>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {methods.map(method => <article key={method.href} className="flex min-w-0 flex-col rounded-xl border border-[#153B31]/15 bg-[#F8F5EE] p-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 shrink-0"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></svg>
          {method.title}
        </h3>
        <p className="mt-2 text-base leading-7 text-[#4C6259]">{method.description}</p>
        {method.installment && <p className="mt-1 text-sm leading-6 text-[#4C6259]">請輸入完整總額，非每期金額；可用銀行依綠界付款頁顯示為準。</p>}
        <a href={method.href} target="_blank" rel="noopener noreferrer" aria-label={method.button + "（開啟綠界付款頁，新分頁）"} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#123E32] px-4 py-3 text-base font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#123E32]">
          {method.button}<span aria-hidden="true">↗</span>
        </a>
      </article>)}
    </div>
    <div className="mt-4 flex flex-col gap-1 border-t border-[#153B31]/15 pt-3 text-base leading-7 sm:flex-row sm:items-center sm:justify-between">
      <p><span className="font-semibold">月繳訂閱</span><span className="ml-2 text-[#4C6259]">無年繳贈送，確認月費後提供專屬連結。</span></p>
      <a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">請洽專人 ↗</a>
    </div>
    <div className="mt-2 space-y-1 text-sm leading-6 text-[#4C6259]">
      <p>付款後由專人核對並開通；綠界付款頁顯示的收款商店名稱為「陸比音樂」。</p>
      <p>綠界 ATM 付款金額限 NT$16～49,999；超過上限請使用信用卡或洽專人確認轉帳方式。</p>
    </div>
  </section>;
}

function FeatureComparison() {
  return <section aria-labelledby="comparison" className="mt-8">
    <h2 id="comparison" className="scroll-mt-24 text-2xl font-semibold">每個方案，包含什麼？</h2>
    <p id="comparison-help" className="mt-2 text-base leading-7 text-[#4C6259]">內含：直接使用。可選：使用內含名額，不另收費。加購：另付月費。展店版欄位指總部本身，旗下分店須各自購買基本版或專業版，功能不隨總部方案自動升級。</p>
    <div className="mt-4 rounded-xl border border-[#153B31]/15 bg-white px-4 py-3 text-base leading-7">
      <p className="font-semibold">三個方案都內含日常店務</p>
      <p className="text-[#4C6259]">預約管理、顧客資料、方案堂數、基本收款與 LINE 顧客入口。</p>
    </div>
    <table aria-describedby="comparison-help" className="mt-4 w-full table-fixed border-separate border-spacing-0 text-sm sm:text-base">
      <caption className="sr-only">蒸管家三方案功能與使用規模比較</caption>
      <colgroup><col className="w-[37%] sm:w-[43%]" /><col /><col /><col /></colgroup>
      <thead className="sticky top-20 z-10">
        <tr><th scope="col" className="rounded-tl-xl bg-[#123E32] px-2 py-3 text-left font-medium text-white sm:px-4">功能</th>{plans.map((plan, i) => <th key={plan.id} scope="col" className={"bg-[#123E32] px-1 py-3 font-medium text-white " + (i === 2 ? "rounded-tr-xl" : "")}>{plan.name}</th>)}</tr>
      </thead>
      {groups.map(group => <tbody key={group.title}>
        <tr><th colSpan={4} scope="rowgroup" className="bg-[#E9F1EB] px-3 py-3 text-left sm:px-4"><span className="block text-base font-semibold">{group.title}</span><span className="mt-1 block text-sm font-normal leading-6 text-[#4C6259]">{group.note}</span></th></tr>
        {group.rows.map(row => <tr key={row.label}>
          <th scope="row" className="border-b border-[#153B31]/10 bg-white px-2 py-3 text-left font-normal leading-6 sm:px-4">{featureLinks[row.label] ? <a href={"/pricing/features#" + featureLinks[row.label]} className="inline-flex min-h-11 items-center underline decoration-[#153B31]/30 underline-offset-4 hover:decoration-current">{row.label}</a> : row.label}</th>
          {row.values.map((value, i) => <td key={i} className={"border-b border-[#153B31]/10 px-1 py-3 text-center " + (i === 1 ? "bg-[#F0F5F1] " : "bg-white ") + (value === "加購" ? "text-[#64756D]" : "font-medium")}>{value}</td>)}
        </tr>)}
      </tbody>)}
      <tbody>
        <tr><th colSpan={4} scope="rowgroup" className="bg-[#E9F1EB] px-3 py-3 text-left text-base font-semibold sm:px-4">使用規模</th></tr>
        {limits.map(item => <tr key={item.field}><th scope="row" className="border-b border-[#153B31]/10 bg-white px-2 py-3 text-left font-normal sm:px-4">{item.label}</th>{plans.map(plan => {
          const value = PLAN_LIMITS[plan.id][item.field];
          return <td key={plan.id} className={"border-b border-[#153B31]/10 px-1 py-3 text-center " + (plan.id === "GROWTH" ? "bg-[#F0F5F1]" : "bg-white")}>{value === null ? "不限" : value.toLocaleString("zh-TW")}</td>;
        })}</tr>)}
        <tr><th scope="row" className="rounded-bl-xl bg-white px-2 py-3 text-left font-normal sm:px-4"><a href="/pricing/features#multi-store" className="inline-flex min-h-11 items-center underline decoration-[#153B31]/30 underline-offset-4 hover:decoration-current">多店管理</a></th><td className="bg-white px-1 py-3 text-center">單店</td><td className="bg-[#F0F5F1] px-1 py-3 text-center">單店</td><td className="rounded-br-xl bg-white px-1 py-3 text-center leading-6">總部管理<br />分店另計</td></tr>
      </tbody>
    </table>
  </section>;
}
export default async function PricingPage() {
  // Request-time timestamp for SSR; passed unchanged to the first client render.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <MarketingNavigation active="pricing" />
    <main id="plans" className="mx-auto max-w-6xl px-5 py-5 sm:px-8 sm:py-6">
      <section aria-labelledby="trial-title" className="mb-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold text-[#74603C]">新客 30 天免費體驗</p>
            <h1 id="trial-title" className="mt-1 text-3xl font-semibold leading-snug sm:text-4xl">先免費用 30 天，再決定。</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-[#4C6259]">單店功能完整開放。體驗期間的顧客、預約與方案資料，轉正式直接沿用，不用重新建檔。</p>
            <ul aria-label="免費體驗優勢" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-base font-semibold">
              {["30 天完全免費", "單店功能完整開放", "轉正式資料沿用"].map(text => <li key={text} className="flex items-center gap-2"><span aria-hidden="true" className="text-[#805C1B]">✓</span>{text}</li>)}
            </ul>
          </div>
          <a href={TRIAL_URL} className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-full bg-[#123E32] px-6 py-3 text-base font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4 lg:self-center">申請 30 天免費體驗<span aria-hidden="true" className="ml-2">→</span></a>
        </div>
        <details className="mt-3 border-t border-[#153B31]/15 text-base leading-7">
          <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-4">查看體驗額度與使用說明</summary>
          <div className="space-y-2 pb-2 text-[#4C6259]">
            <p>所選模組的完整單店功能開放體驗，人員仍依店長／員工角色權限操作。含店長共 3 位可啟用人員、100 筆顧客資料及每月 100 筆預約。</p>
            <p>從帳號可正常使用當天開通起算 30 天；網頁前台可先使用，LINE／LIFF 完成設定後接上。</p>
            <p>到期後後台改為唯讀，資料保留 30 天；保留期間轉正式，可沿用原帳號與資料，功能及額度依購買方案。</p>
            <p>30 天系統體驗免費，不含跨店總部管理或代辦金流申請與串接；自動提醒每月最多 50 次，LINE 訊息、金流等外部服務費用於開通前確認。</p>
          </div>
        </details>
      </section>
      <h2 className="mb-3 text-2xl font-semibold">方案價格與優惠</h2>
      <PricingOffer initialNow={initialNow} trialUrl={TRIAL_URL} />
      <FeatureComparison />
      <p className="mt-4 text-base leading-7 text-[#4C6259]">可啟用人員包含店長、後台員工及技師／芳療師等服務人員，共用人數額度；僅供排班、未開通登入的人員也計入，停用人員不計入。</p>
      <p className="mt-4 text-base leading-7 text-[#4C6259]">付費方案不設每月預約筆數上限，依功能模組與人員額度分級；不因預約筆數增加而自動加收費用。訊息與金流等外部費用於開通前確認。</p>
      <section aria-labelledby="addons" className="mt-8 border-t border-[#153B31]/15 pt-6">
        <h2 id="addons" className="text-2xl font-semibold">需要更多功能，再加就好。</h2>
        <p className="mt-3 text-base leading-7"><a href="/pricing/features" className="inline-flex min-h-11 items-center underline underline-offset-4">看看每項功能，能幫店裡少做哪些事 →</a></p>
        <AddonOffer initialNow={initialNow} />
        <p className="mt-3 text-base leading-7 text-[#4C6259]">已內含或使用任選名額的功能不另收費，超出名額才加購。選定後由總部協助開通。</p>
        <details className="mt-4 border-t border-[#153B31]/15 py-3"><summary className="cursor-pointer font-medium">方案與費用說明</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-[#4C6259]">
            <li><PricingOfferTerms initialNow={initialNow} /></li>
            <li>展店版年繳 NT$59,880，包含總部管理。{ALLIANCE_BRANCH_PRICING_COPY} 各分店另購基本版或專業版。首間分店免串接費；例如 6 間分店的串接費共 $2,300／月。</li>
            <li>年繳總額僅計主方案，額外模組與分店串接管理費另計；使用期間自正式啟用日起算。</li>
            <li>LINE 顧客入口（LIFF）可預約、取消與查詢堂數；各門市保留獨立開關。數位管家不列入全含範圍，需另行確認開通。</li>
          </ul>
        </details>
        <details className="mt-4 border-t border-[#153B31]/15 py-3"><summary className="cursor-pointer font-medium">申請前須知</summary>
          <dl className="mt-3 grid gap-4 text-base leading-7 sm:grid-cols-3">
            <div><dt className="font-medium">體驗怎麼開始？</dt><dd className="mt-1 text-[#4C6259]">填寫門市需求後，由專人聯繫，確認體驗內容與期限，再提供登入方式。</dd></div>
            <div><dt className="font-medium">開通前確認哪些費用？</dt><dd className="mt-1 text-[#4C6259]">確認選用項目、額外費用與優惠期間後再開通；數位管家另行確認開通，LINE 訊息等第三方費用另外確認。</dd></div>
            <div><dt className="font-medium">健康追蹤提供什麼？</dt><dd className="mt-1 text-[#4C6259]">量測紀錄、歷史數據與變化趨勢，協助體態追蹤；不作醫療診斷或效果保證。</dd></div>
          </dl></details>
      </section>
      <OnlinePayment />
    </main>
    <section className="bg-[#123E32] px-5 py-8 text-center text-white">
      <h2 className="text-2xl font-semibold"><span className="block sm:inline">每一家店，</span><span>都值得擁有一位<span className="whitespace-nowrap">數位管家。</span></span></h2>
      <p className="mx-auto mt-3 max-w-4xl text-base leading-7 text-[#D4E0D8]">預約、堂數、收款一次整理，專心照顧顧客。</p>
      <a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-white/50 px-5 py-3 font-medium">還不確定？加 LINE 聊聊</a>
    </section>
    <MarketingFooter />
  </div>;
}
