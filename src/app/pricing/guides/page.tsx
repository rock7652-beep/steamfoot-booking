import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "店長經營指南｜蒸管家",
  description: "九篇店務做法：安排預約、顧客追蹤、收款對帳、商品盤點與維修保養接件。每篇一個問題、三個步驟，把方法帶回店裡。",
};
const categories = [
  { id: "booking", name: "開店與預約" },
  { id: "customers", name: "顧客與續購" },
  { id: "operations", name: "收款與店務" },
] as const;
const guides = [
  { id: "solo-store", category: "booking", title: "一個人顧店，怎麼安排時間？", summary: "先留好服務、整理和休息時間，再開放預約。",
    steps: ["先列出一次服務或上課需要多久，預留結帳、整理與休息的空檔。", "只開放能接待的時間；不方便接客的時段先保留。", "利用空檔集中查看預約與回覆訊息，電話或現場預約也要登記。"],
    example: [["SPA", "療程後預留床位整理時間"], ["音樂／運動", "課程之間預留換場與點名時間"], ["蒸足", "每個時段依現場可接待人數安排"]],
    note: "顧客看到的空位依店內設定顯示，調整營業安排時也要核對既有預約。", feature: "daily", featureName: "預約與日常店務" },
  { id: "opening-checklist", category: "booking", title: "開店前，先看這三件事。", summary: "今天誰會來？有沒有異動？要準備什麼？",
    steps: ["確認今天的時間、人數、項目、老師或服務人員，先標記首次來店的顧客。", "查看改期、取消與確認狀態；沒有回覆不代表取消。", "核對方案期限、剩餘堂數與備註，準備教室、位置或服務用品。"],
    example: [["預約", "14:00・範例顧客 A・首次體驗"], ["異動", "範例顧客 B 已改期，核對新時間"], ["準備", "確認方案、服務人員與使用空間"]],
    note: "收款與扣堂仍需在實際服務或出席時核對，不能以看過名單代替完成操作。", feature: "daily", featureName: "預約與日常店務" },
  { id: "trial-booking", category: "booking", title: "體驗預約，怎麼少一輪來回確認？", summary: "讓顧客選好時間並送出，再準備接待。",
    steps: ["先確認可以提供體驗的日期、時段、人員及名額。", "把正確門市的預約入口提供給顧客，讓顧客填完資料並完成送出。", "查看預約是否成功進入名單，再依資料準備接待；需要通知時先完成 LINE 串接。"],
    example: [["顧客", "選日期、時間並送出資料"], ["店家", "查看成功建立的預約與顧客資料"], ["現場", "核對姓名、電話與體驗內容"]],
    note: "LINE 私訊詢問不等於預約成功。不同模組的時段、人員與課程規則依門市設定。", feature: "daily", featureName: "預約與顧客入口" },
  { id: "arrival-reminder", category: "customers", title: "到店提醒，怎麼少一筆手動訊息？", summary: "例行提醒交給系統，需要協助的顧客再親自處理。",
    steps: ["訂好提醒時間與內容，確認店名、地址及聯絡方式正確。", "完成 LINE 串接與提醒設定，確認要通知的對象。", "查看發送與預約異動紀錄，針對需要改期或協助的顧客聯繫。"],
    example: [["提醒", "明天 14:00・範例顧客 A"], ["顧客", "依卡片提供的按鈕完成操作"], ["店家", "核對異動或確認結果"]],
    note: "提醒送出不代表一定到店；按鈕依模組與店內規則提供，改期或取消需完成操作才生效。", feature: "reminders", featureName: "LINE 自動提醒" },
  { id: "plan-expiry", category: "customers", title: "方案快到期，怎麼提早安排？", summary: "先核對期限與剩餘堂數，再提醒顧客安排。",
    steps: ["先確認顧客的有效期限、剩餘堂數與已預約安排。", "在到期前提醒可使用的時間；遇到安排困難，再由店家聯繫。", "顧客完成新預約後核對結果，有續購需求再確認新方案與付款。"],
    example: [["剩餘", "範例顧客 A・2 堂"], ["期限", "依目前有效方案核對"], ["下一步", "安排預約或詢問續購需求"]],
    note: "提醒不會延長期限，也不代表已完成預約或續購。音樂個別課、團體課與運動課程的請假、補課及扣堂依各課型處理。", feature: "care", featureName: "顧客經營" },
  { id: "trial-follow-up", category: "customers", title: "體驗結束後，怎麼接著關心顧客？", summary: "記下需求、約定聯繫時間，避免重複詢問。",
    steps: ["體驗結束時記下顧客在意的事，以及希望改善或學習的方向。", "確認顧客願意接受的聯繫方式與時間，再安排追蹤。", "聯繫後記錄結果與下一步，讓接手的人知道已經談到哪裡。"],
    example: [["音樂", "想學鋼琴，先確認合適的上課時間"], ["運動", "關心課程難度與可出席時段"], ["SPA／蒸足", "詢問服務感受與下次安排需求"]],
    note: "顧客經營協助整理名單與追蹤紀錄，不代表自動代發所有關懷訊息；通知依已開通功能及設定。", feature: "care", featureName: "顧客經營" },
  { id: "closing-cash", category: "operations", title: "打烊時，現金對不起來怎麼查？", summary: "先清點，再核對現金異動，留下差額原因。",
    steps: ["清點抽屜的實際現金，分清楚開帳零用金、今日收入與提領。", "對照現金收款、退款與支出紀錄；轉帳、信用卡等非現金付款分開核對。", "有差額先查找原因，記錄清點結果；不要新增一筆收入只為把差額補平。"],
    example: [["應有現金", "範例 NT$8,200"], ["實際清點", "範例 NT$8,000"], ["差額", "−NT$200，先查耗材支出是否漏登"]],
    note: "現金抽屜需要實際清點；收款紀錄、營收與抽屜現金不是同一個數字。功能內含與加購請查方案頁。", feature: "cash", featureName: "現金抽屜" },
  { id: "stock-check", category: "operations", title: "商品帳面數量和現場不同，怎麼查？", summary: "核對單據與實物，再處理差異。",
    steps: ["選定盤點範圍與時間，清點商品；盤點期間的進出貨另外記清楚。", "核對進貨、銷貨、退貨及工單材料紀錄，找出漏登或重複登記。", "確認差異原因後依店內流程處理，保留單據與調整紀錄供下次追查。"],
    example: [["進貨", "範例商品 A・20 件"], ["出庫", "已完成單據・3 件"], ["盤點", "應有 17 件，與現場清點核對"]],
    note: "收款不代表再次出庫。工單與商品單據應核對原始關聯；不要另外新增銷貨單重複記同一份材料。", feature: "inventory", featureName: "進銷存管理" },
  { id: "work-order-handoff", category: "operations", title: "維修保養接件，到取件怎麼不漏事？", summary: "需求、處理進度與付款分開記，交件時一起核對。",
    steps: ["接件時確認姓名、電話、種類／型號、問題與需求，記清楚顧客備註。", "處理過程更新內容與進度，確認材料、工費及是否繼續處理；不維修或取消也留下紀錄。", "取件前確認應收、已收、尚欠與付款結果，核對交件；讓顧客知道營業時間、地址及聯絡方式。"],
    example: [["樂器", "鋼琴調音、管樂保養、提琴或吉他維修"], ["進度", "範例：已完成・待取件"], ["付款", "範例：應收 NT$900・已收 NT$0・尚欠 NT$900"]],
    note: "工單可獨立使用；商品材料及扣庫存需另開通進銷存。已完成處理不等於已付款，退款與取消依實際交易及權限操作。", feature: "work-orders", featureName: "工單管理" },
] as const;

export default async function StoreGuidesPage({ searchParams }: { searchParams: Promise<{ guide?: string | string[] }> }) {
  const requested = (await searchParams).guide;
  const selectedId = typeof requested === "string" && guides.some(guide => guide.id === requested) ? requested : undefined;
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <MarketingNavigation active="guides" />
    <main id="main" className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <p className="text-sm font-medium text-[#74603C]">店長經營指南</p>
      <h1 className="mt-2 text-3xl font-semibold leading-snug sm:text-4xl">選一件事，把做法帶回店裡。</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[#4C6259]">這裡分享店務做法；系統能做什麼請看<Link href="/pricing/features" className="inline-flex min-h-11 items-center underline underline-offset-4">功能介紹</Link>，按哪裡、怎麼設定，請在登入後台後查看「操作指南」。</p>
      <nav id="guide-list" aria-label="經營指南分類" className="mt-4 flex flex-wrap gap-3 scroll-mt-24">{categories.map(category => <a key={category.id} href={"#guides-" + category.id} className="inline-flex min-h-11 items-center rounded-full border border-[#153B31]/20 bg-white px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2">{category.name} ↓</a>)}</nav>
      {categories.map(category => <section key={category.id} id={"guides-" + category.id} aria-labelledby={"title-" + category.id} className="mt-7 scroll-mt-24">
        <h2 id={"title-" + category.id} className="mb-3 text-xl font-semibold">{category.name}</h2>
        <div className="space-y-3">{guides.filter(guide => guide.category === category.id).map(guide => <details key={guide.id} id={guide.id} name="store-guide" open={guide.id === selectedId} className="group scroll-mt-24 rounded-xl border border-[#153B31]/20 bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-4 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-5 [&::-webkit-details-marker]:hidden"><span><span className="block text-lg font-semibold leading-7">{guide.title}</span><span className="mt-1 block text-base leading-7 text-[#4C6259]">{guide.summary}</span></span><span aria-hidden="true" className="shrink-0 text-xl group-open:rotate-45">＋</span></summary>
          <article aria-label={guide.title} className="border-t border-[#153B31]/10 p-4 sm:p-5">
            <div className="grid items-start gap-5 md:grid-cols-2"><section><h3 className="text-lg font-semibold">三個做法</h3><ol className="mt-3 list-decimal space-y-3 pl-5 text-base leading-7 text-[#4C6259]">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></section><figure className="rounded-xl bg-[#EEF4F0] p-4"><h3 className="text-lg font-semibold">店務範例</h3><dl className="mt-3 divide-y divide-[#153B31]/15">{guide.example.map(([label,value]) => <div key={label} className="py-3"><dt className="font-semibold">{label}</dt><dd className="mt-1 text-base leading-7 text-[#4C6259]">{value}</dd></div>)}</dl><figcaption className="mt-2 text-sm leading-6 text-[#4C6259]">情境與數字為範例，非實際店家成果。</figcaption></figure></div>
            <p className="mt-4 border-t border-[#153B31]/10 pt-3 text-base leading-7 text-[#4C6259]">{guide.note}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><Link href={"/pricing/features#" + guide.feature} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">查看{guide.featureName} →</Link><a href="#guide-list" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">返回主題列表 ↑</a></div>
          </article>
        </details>)}</div>
      </section>)}
    </main><MarketingFooter />
  </div>;
}
