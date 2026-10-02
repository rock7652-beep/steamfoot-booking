import { ALLIANCE_BRANCH_PRICING_COPY } from "@/lib/alliance-subscription";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { PricingOffer, PricingOfferTerms } from "./pricing-offer";
import { PUBLIC_PRICING_PLANS as plans } from "@/lib/public-pricing-offer";

export const dynamic = "force-dynamic";
import { PLAN_LIMITS } from "@/lib/feature-flags";

export const metadata = {
  title: "方案與價格 — 蒸管家",
  description: "蒸管家｜店務管理系統，適用於預約制門市、工作室與服務品牌。比較適合店家、價格與功能差異。",
};
const TRIAL_URL = "/apply?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=pricing";
const featureLinks: Record<string, string> = {
  "LINE 自動提醒": "reminders", "資料匯出": "export", "現金抽屜": "cash",
  "顧客經營": "care", "健康追蹤": "health", "月結管理": "settlement", "分析": "analysis",
};
const limits = [
  { label: "可啟用人員", field: "maxStaff", unit: "位" },
  { label: "顧客資料", field: "maxCustomers", unit: "筆" },
  { label: "每月預約", field: "maxMonthlyBookings", unit: "筆" },
] as const;
const groups = [
  { title: "日常店務", note: "三個方案都包含，開店就能用。", rows: [
    { label: "預約管理", values: ["內含", "內含", "內含"] },
    { label: "顧客資料", values: ["內含", "內含", "內含"] },
    { label: "方案堂數", values: ["內含", "內含", "內含"] },
    { label: "基本收款", values: ["內含", "內含", "內含"] },
    { label: "LINE 顧客入口", values: ["內含", "內含", "內含"] },
  ] },
  { title: "工具功能", note: "基本版：以下 3 選 1。專業版：現金抽屜已含，提醒／匯出再選 1 項。展店版：全部內含。", rows: [
    { label: "LINE 自動提醒", values: ["可選", "可選", "內含"] },
    { label: "資料匯出", values: ["可選", "可選", "內含"] },
    { label: "現金抽屜", values: ["可選", "內含", "內含"] },
  ] },
  { title: "經營功能", note: "基本版：依需求加購。專業版：顧客經營已含，健康／月結／分析再選 1 項。展店版：全部內含。", rows: [
    { label: "顧客經營", values: ["加購", "內含", "內含"] },
    { label: "健康追蹤", values: ["加購", "可選", "內含"] },
    { label: "月結管理", values: ["加購", "可選", "內含"] },
    { label: "分析", values: ["加購", "可選", "內含"] },
  ] },
] as const;

function FeatureComparison() {
  return <section aria-labelledby="comparison" className="mt-8">
    <h2 id="comparison" className="scroll-mt-24 text-2xl font-semibold">每個方案，包含什麼？</h2>
    <p id="comparison-help" className="mt-2 text-base leading-7 text-[#4C6259]">內含：直接使用。可選：使用內含名額，不另收費。加購：另付月費。展店版欄位指總部本身，旗下分店須各自購買基本版或專業版，功能不隨總部方案自動升級。</p>
    <table aria-describedby="comparison-help" className="mt-4 w-full table-fixed border-separate border-spacing-0 text-sm sm:text-base">
      <caption className="sr-only">蒸管家三方案功能與使用規模比較</caption>
      <colgroup><col className="w-[37%] sm:w-[43%]" /><col /><col /><col /></colgroup>
      <thead className="sticky top-20 z-10">
        <tr><th scope="col" className="rounded-tl-xl bg-[#123E32] px-2 py-4 text-left font-medium text-white sm:px-4">功能</th>{plans.map((plan, i) => <th key={plan.id} scope="col" className={"bg-[#123E32] px-1 py-4 font-medium text-white " + (i === 2 ? "rounded-tr-xl" : "")}>{plan.name}</th>)}</tr>
      </thead>
      {groups.map(group => <tbody key={group.title}>
        <tr><th colSpan={4} scope="rowgroup" className="bg-[#E9F1EB] px-3 py-4 text-left sm:px-4"><span className="block text-base font-semibold">{group.title}</span><span className="mt-1 block text-sm font-normal leading-6 text-[#4C6259]">{group.note.split("。").filter(Boolean).map(note => <span key={note} className="block">{note}。</span>)}</span></th></tr>
        {group.rows.map(row => <tr key={row.label}>
          <th scope="row" className="border-b border-[#153B31]/10 bg-white px-2 py-4 text-left font-normal leading-6 sm:px-4">{featureLinks[row.label] ? <a href={"/pricing/features#" + featureLinks[row.label]} className="underline decoration-[#153B31]/30 underline-offset-4 hover:decoration-current">{row.label}</a> : row.label}</th>
          {row.values.map((value, i) => <td key={i} className={"border-b border-[#153B31]/10 px-1 py-4 text-center " + (i === 1 ? "bg-[#F0F5F1] " : "bg-white ") + (value === "加購" ? "text-[#64756D]" : "font-medium")}>{value}</td>)}
        </tr>)}
      </tbody>)}
      <tbody>
        <tr><th colSpan={4} scope="rowgroup" className="bg-[#E9F1EB] px-3 py-4 text-left text-base font-semibold sm:px-4">使用規模</th></tr>
        {limits.map(item => <tr key={item.field}><th scope="row" className="border-b border-[#153B31]/10 bg-white px-2 py-4 text-left font-normal sm:px-4">{item.label}</th>{plans.map(plan => {
          const value = PLAN_LIMITS[plan.id][item.field];
          return <td key={plan.id} className={"border-b border-[#153B31]/10 px-1 py-4 text-center " + (plan.id === "GROWTH" ? "bg-[#F0F5F1]" : "bg-white")}>{value === null ? "不限" : value.toLocaleString("zh-TW")}</td>;
        })}</tr>)}
        <tr><th scope="row" className="rounded-bl-xl bg-white px-2 py-4 text-left font-normal sm:px-4">多店管理</th><td className="bg-white px-1 py-4 text-center">單店</td><td className="bg-[#F0F5F1] px-1 py-4 text-center">單店</td><td className="rounded-br-xl bg-white px-1 py-4 text-center leading-6">總部管理<br />分店另計</td></tr>
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
    <main id="plans" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-6">
        <p className="text-sm text-[#74603C]">方案與價格</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">選擇適合你門市的管家。</h1>
        <p className="mt-3 text-base leading-7 text-[#4C6259]">從日常店務、顧客回訪到多店管理，依你的經營需要選擇。</p>
      </div>
      <PricingOffer initialNow={initialNow} trialUrl={TRIAL_URL} />
      <section aria-label="試用說明" className="mt-6 rounded-xl bg-white p-5 text-base leading-7"><h2 className="text-xl font-semibold">30 天完整單店體驗</h2><p className="mt-2">30 天完整單店試用，含店長共 3 位可啟用人員、100 筆顧客資料及每月 100 筆預約。從帳號可正常使用當天開通起算；網頁前台可先使用，LINE／LIFF 完成設定後接上。到期後保留資料、後台改為唯讀；轉正式沿用原帳號與資料，功能及額度依購買方案。</p><p className="mt-2">試用不含跨店總部管理或代辦金流申請與串接；自動提醒每月最多 50 次，外部訊息費用於開通前確認。</p></section>
      <FeatureComparison />
      <p className="mt-4 text-base leading-7 text-[#4C6259]">可啟用人員包含店長、後台員工及技師／芳療師等服務人員，共用人數額度；僅供排班、未開通登入的人員也計入，停用人員不計入。</p>
      <p className="mt-4 text-base leading-7 text-[#4C6259]">付費方案不設每月預約筆數上限，依功能模組與人員額度分級；不因預約筆數增加而自動加收費用。訊息與金流等外部費用於開通前確認。</p>
      <section aria-labelledby="addons" className="mt-8 border-t border-[#153B31]/15 pt-6">
        <h2 id="addons" className="text-2xl font-semibold">需要更多功能，再加就好。</h2>
        <p className="mt-3 text-base leading-7"><a href="/pricing/features" className="underline underline-offset-4">看看每項功能，能幫店裡少做哪些事 →</a></p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="rounded-xl border border-[#153B31]/15 bg-white p-4 text-base"><span className="font-semibold">工具功能</span><span className="ml-3">每項 NT$500／月</span></p>
          <p className="rounded-xl border border-[#153B31]/15 bg-white p-4 text-base"><span className="font-semibold">經營功能</span><span className="ml-3">每項 NT$800／月</span></p>
        </div>
        <p className="mt-3 text-base leading-7 text-[#4C6259]">已內含或使用任選名額的功能不另收費，超出名額才加購。選定後由總部協助開通。</p>
        <details className="mt-4 border-t border-[#153B31]/15 py-3"><summary className="cursor-pointer font-medium">方案與費用說明</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-[#4C6259]">
            <li><PricingOfferTerms initialNow={initialNow} /></li>
            <li>展店版年繳 NT$59,880，包含總部管理。{ALLIANCE_BRANCH_PRICING_COPY} 各分店另購基本版或專業版。串接幾間，就付幾間的串接費；例如 6 間分店的串接費共 $2,800／月。</li>
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
    </main>
    <section className="bg-[#123E32] px-5 py-8 text-center text-white">
      <h2 className="text-2xl font-semibold"><span className="block sm:inline">每一家店，</span><span>都值得擁有一位<span className="whitespace-nowrap">數位管家。</span></span></h2>
      <p className="mx-auto mt-3 max-w-4xl text-base leading-7 text-[#D4E0D8]">預約、堂數、收款一次整理，專心照顧顧客。</p>
      <a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-white/50 px-5 py-3 font-medium">還不確定？加 LINE 聊聊</a>
    </section>
    <MarketingFooter />
  </div>;
}
