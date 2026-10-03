import Link from "next/link";
import { DayStory } from "../business/day-story";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { BOOKING_TYPES } from "../booking-types";

const stories = {
  slots: {
    name: "時段預約", title: "每個時段，還能接幾位？", intro: "適合蒸足與固定場次體驗。把可預約時間、接待名額與當日名單放在一起。",
    scenes: [
      { question: "客人一直問，什麼時間有空？", answer: "顧客自己選日期、時段與人數，完成預約後，名單進入店長後台。", caption: "顧客｜選擇時段", rows: [["14:00", "剩餘 3 位"], ["15:00", "已額滿"], ["16:00", "剩餘 2 位"]] },
      { question: "今天誰要來？還能再接客嗎？", answer: "查看各時段的名單與名額，打開預約即可核對方案次數、到期日與服務備註。", caption: "店長｜14:00 當日預約", rows: [["範例顧客 A", "1 位・已預約"], ["範例顧客 B", "2 位・已預約"], ["剩餘名額", "3 位"]] },
      { question: "臨時休息，或想多開一個時段？", answer: "當日時段可加開、關閉或重新開放，儲存前先確認。關閉只停止新預約，既有預約仍保留。", caption: "店長｜確認時段調整", rows: [["17:00", "停止接受新預約"], ["18:00", "當日加開"], ["既有預約", "保留，另行聯繫顧客"]] },
    ],
    details: "可設定每週固定時段、特定日期的營業安排與預約開放期限。店內備註與本次備註分開記錄；已開通現金抽屜的店家，可在預約管理直接登記當日手動收支。",
  },
  services: {
    name: "服務預約", title: "服務、人員與時間，一起安排。", intro: "適合 SPA、美容與美體。依服務內容安排人員與位置，讓不同長度的療程接得上。",
    scenes: [
      { question: "療程長短不同，怎麼安排空檔？", answer: "依療程與整理時間找出可用空檔，顧客自行選擇時間與人員。", caption: "療程｜時間安排", rows: [["範例療程", "服務 60 分鐘"], ["整理時間", "15 分鐘"], ["內部占用", "共 75 分鐘"]] },
      { question: "芳療師或床位，會不會排重複？", answer: "核對人員專業、班表與服務位置，避開預約與休假衝突。人員可指定或不指定。", caption: "店長｜可用安排", rows: [["人員 A", "已有預約"], ["人員 B", "專業與時間符合"], ["位置 2", "此時段可用"]] },
      { question: "服務人員怎麼知道今天接誰？", answer: "人員查看自己的行程與服務備註；顧客查看預約與療程剩餘次數。", caption: "服務人員｜我的工作", rows: [["14:00", "範例顧客 A・60 分鐘"], ["服務位置", "位置 2"], ["16:00", "範例顧客 B・90 分鐘"]] },
    ],
    details: "店長可管理療程規格、人員專業、固定班表與請假等例外，並安排服務位置。依店內方案使用療程扣次或儲值結帳；會員與人員入口需完成對應身分設定，LINE 入口另需完成串接。",
  },
  fitness: {
    name: "運動教室", title: "課表、名額與出席，一起掌握。", intro: "適合運動教室、瑜珈與皮拉提斯。學員自己預約，教練查看行程，店長集中管理課表與堂數。",
    scenes: [
      { question: "學員一直問，明天還有哪堂課？", answer: "學員從顧客入口查看課表、剩餘名額與自己的預約，依店家規則預約或取消，減少來回確認。", caption: "學員｜選擇課程", rows: [["09:00 瑜珈", "剩餘 3 位"], ["11:00 皮拉提斯", "已額滿"], ["我的預約", "明天 09:00"]] },
      { question: "今天誰來上課？還剩幾堂？", answer: "店長與教練查看當堂學員名單、堂數與備註，記錄出席、請假或未到，依課程規則核對扣堂。", caption: "教練｜當堂學員", rows: [["範例學員 A", "出席・剩餘 5 堂"], ["範例學員 B", "請假"], ["範例學員 C", "待確認"]] },
      { question: "老師請假，課表怎麼調整？", answer: "從日、週、月課表查看老師與教室安排，處理單堂或後續課程異動。教練也能從「我的工作」核對自己的授課行程。", caption: "店長｜課表安排", rows: [["原課程", "週三 18:00"], ["調整後", "週四 19:00"], ["教練行程", "查看異動後課程"]] },
    ],
    details: "可安排個別與團體課程，管理老師、教室、學員方案與課程容量。預約及取消期限依店家設定；出席、請假、未到與扣堂依課型規則處理。LINE 顧客入口需完成串接，進階功能依購買方案開通。",
  },
  music: {
    name: "音樂教室", title: "學員、老師與每堂課，清楚接起來。", intro: "適合音樂教室、樂器教學與才藝課程。從固定課表、調課補課到續報與老師鐘點，接起櫃檯每天的工作。",
    scenes: [
      { question: "這位學員，每週跟誰上課？", answer: "固定課表集中顯示學員、老師與教室，可查看日、週、月安排；個別課與團體課各自保留上課規則。", caption: "櫃檯｜固定課表", rows: [["週二 18:00", "範例學員 A・吉他"], ["授課老師", "範例老師 B"], ["上課教室", "教室 1"]] },
      { question: "臨時請假或調課，怕漏掉哪一堂？", answer: "保留請假與課程異動紀錄，依課型處理補課。調課可選這堂、連續幾週或之後的課程，讓櫃檯核對原課與新安排。", caption: "櫃檯｜核對課程異動", rows: [["原固定課", "週二 18:00"], ["這堂調整", "週四 19:00"], ["後續固定課", "維持原時段"]] },
      { question: "上到第幾堂？老師鐘點怎麼算？", answer: "查看學員本期進度與下期繳費，續報沿用原資料。已開通月結管理時，可核對老師授課明細與鐘點，依店內設定計算。", caption: "櫃檯｜進度與帳務", rows: [["本期進度", "第 4／4 堂"], ["下期繳費", "已繳 8 堂"], ["老師鐘點", "月結明細核對"]] },
    ],
    details: "可安排個別、雙人與團體課程，管理固定課與約課、期數、方案期限及續報。請假、未到與補課依課型規則處理；老師鐘點或拆帳依店內設定，月結管理依方案內含或另外加購。",
  },
} as const;

export function BookingStory({ kind }: { kind: keyof typeof stories }) {
  const story = stories[kind];
  return <div className="min-h-screen bg-[#F8F5EE] text-[#153B31]">
    <MarketingNavigation active="features" />
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <nav aria-label="預約方式" className="flex flex-wrap gap-2 text-sm">
        {BOOKING_TYPES.map(({ id, name }) => <Link key={id} href={`/pricing/features/${id}`} aria-current={kind === id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border border-[#153B31]/20 px-4 focus-visible:outline-2 focus-visible:outline-offset-4 ${kind === id ? "bg-[#123E32] text-white" : "bg-white"}`}>{name}</Link>)}
      </nav>
      <p className="mt-8 text-sm font-medium text-[#74603C]">{story.name}</p>
      <h1 className="mt-3 text-balance text-3xl font-semibold leading-snug sm:text-4xl">{kind === "services" ? <><span className="inline-block">服務、人員與時間，</span><span className="inline-block">一起安排。</span></> : story.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[#4C6259]">{story.intro}</p>
      <div className="mt-8 space-y-5">
        {story.scenes.map((scene, i) => <section key={scene.question} aria-labelledby={`scene-${i}`} className="grid items-center gap-4 sm:gap-6 rounded-2xl border border-[#153B31]/15 bg-white/70 p-5 sm:p-7 md:grid-cols-2">
          <div><p className="text-sm font-medium text-[#967039]">0{i + 1}・店裡的日常</p><h2 id={`scene-${i}`} className="mt-3 text-xl font-semibold leading-snug sm:text-2xl">{scene.question}</h2><p className="mt-3 text-base leading-7 text-[#4C6259]">{scene.answer}</p></div>
          <figure className="min-w-0 rounded-xl bg-[#E9F1EB] p-4 sm:p-5"><p className="font-semibold">{scene.caption}</p><dl className="mt-3 divide-y divide-[#153B31]/15">{scene.rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3 text-sm"><dt>{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl><figcaption className="mt-2 text-xs leading-5 text-[#4C6259]">功能示意・範例資料，非實際預約畫面</figcaption></figure>
        </section>)}
      </div>
      {kind === "slots" ? <details id="slot-walkthrough" className="mt-6 scroll-mt-24 border-y border-[#153B31]/15 py-3">
        <summary className="cursor-pointer py-2 font-semibold">想看操作畫面？展開店長的一天</summary>
        <div className="pt-5"><DayStory /></div>
      </details> : null}
      <details className="mt-6 border-y border-[#153B31]/15 py-3"><summary className="cursor-pointer py-2 font-medium">還有哪些安排方式？</summary><p className="pb-2 pt-3 text-base leading-7 text-[#4C6259]">{story.details}</p></details>
      <div className="py-7"><h2 className="text-xl font-semibold">日常店務，也一起照顧。</h2><p className="mt-2 text-base leading-7 text-[#4C6259]">顧客資料、預約紀錄、方案次數與基本收款，接起每天的工作。操作方式依所選模組提供。</p><Link href="/pricing/features#daily" className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4">查看共用與進階功能 →</Link></div>
      <section className="rounded-2xl bg-[#123E32] p-6 text-white sm:p-8"><h2 className="text-2xl font-semibold">這和你的店很像嗎？</h2><p className="mt-3 leading-7 text-[#D4E0D8]">先聊聊現有的安排方式，再確認適合的體驗內容。</p><div className="mt-4 flex flex-wrap items-center gap-4"><Link href={`/apply?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=${kind}`} className="inline-flex min-h-12 items-center rounded-full bg-[#F5EFE3] px-6 py-3 font-semibold text-[#123E32]">申請體驗 →</Link><a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">先加 LINE 聊聊 ↗</a></div><Link href="/pricing" className="mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">查看方案與價格 →</Link></section>
    </main>
    <MarketingFooter />
  </div>;
}
