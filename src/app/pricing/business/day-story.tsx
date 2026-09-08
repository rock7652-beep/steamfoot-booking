"use client";

import { useState } from "react";

const stories = [
  {
    title: "接住詢問，帶到下一步。",
    description: "LINE 數位管家引導顧客留下需求，或前往預約。",
    from: "顧客的 LINE", to: "管家引導",
    message: "我想了解第一次體驗", result: "了解服務・前往預約・留下需求",
    detail: "依門市設定提供引導；數位管家需另行開通。",
  },
  {
    title: "顧客約好了，後台也整理好了。",
    description: "預約送出後，顧客資料與時段一起進後台，減少重複抄寫。",
    from: "顧客送出預約", to: "店長預約管理",
    message: "體驗服務｜14:00｜1 位", result: "14:00　體驗顧客　1 位",
    detail: "新客完成必要資料後建立名單；既有顧客沿用資料。",
  },
  {
    title: "顧客確認會到，店長看得到。",
    description: "到店與體驗提醒，讓顧客自行確認、改期或取消。",
    from: "LINE 提醒卡片", to: "店長查看回覆",
    message: "別忘了明天的體驗預約", result: "已確認會到",
    detail: "依已啟用的提醒規則與通知設定發送。",
  },
  {
    title: "服務完成，帳也清楚。",
    description: "從預約核對結帳方式，處理收款或方案扣堂。",
    from: "核對這筆預約", to: "完成服務與結帳",
    message: "確認服務與結帳方式", result: "收款紀錄／方案扣堂",
    detail: "收款方式與操作依門市產業模組及設定提供。",
  },
  {
    title: "方案快到期，提早照顧。",
    description: "提醒顧客查看方案，安排預約或聯繫店長。",
    from: "LINE 方案提醒", to: "顧客安排下一步",
    message: "你的方案即將到期", result: "查看方案・諮詢店長",
    detail: "依方案期限與門市到期提醒設定發送。",
  },
];

export function DayStory() {
  const [active, setActive] = useState(0);
  const groups = [
    { title: "詢問與預約", description: "LINE 接住詢問，顧客預約後，名單與時段自動整理。", panels: [0, 1] },
    { title: "提醒與回訪", description: "到店確認與方案到期提醒，放在同一處看懂。", panels: [2, 4] },
    { title: "服務與結帳", description: "核對預約，完成服務，處理收款或方案扣堂。", panels: [3] },
  ];
  const group = groups[active];
  return (
    <section id="how-it-works" aria-labelledby="day-title" className="mx-auto max-w-6xl scroll-mt-4 px-5 pb-8 sm:px-8">
      <h2 id="day-title" className="text-2xl font-semibold">店長的一天，一起看懂。</h2>
      <div role="tablist" aria-label="店務情境" className="mt-4 grid grid-cols-3 gap-2">
        {groups.map((item, index) => <button key={item.title} id={"story-tab-" + index} role="tab" aria-selected={active === index} aria-controls="story-panel" tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={(event) => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % groups.length;
          else if (event.key === "ArrowLeft") next = (index + groups.length - 1) % groups.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = groups.length - 1;
          else return;
          event.preventDefault(); setActive(next); document.getElementById("story-tab-" + next)?.focus();
        }} className={"rounded-xl px-2 py-3 text-sm font-semibold sm:text-base focus-visible:outline-2 focus-visible:outline-offset-2 " + (active === index ? "bg-[#123E32] text-white" : "bg-[#EEE9DD] text-[#123E32]")}>{item.title}</button>)}
      </div>
      <div id="story-panel" role="tabpanel" aria-labelledby={"story-tab-" + active} className="mt-4 rounded-2xl bg-[#EEE9DD] p-4 sm:p-4">
        <p className="mb-4 text-base leading-7">{group.description}</p>
        <div className={"grid items-start gap-4 " + (group.panels.length === 2 ? "md:grid-cols-2" : "")}>
          {group.panels.map(index => <figure key={index} className="min-w-0">
            <WorkflowPanel index={index} />
            <figcaption className="mt-3 text-sm leading-6 text-[#4C6259]">{stories[index].detail}</figcaption>
          </figure>)}
        </div>
        <p className="mt-3 border-t border-[#153B31]/10 pt-3 text-sm text-[#64756D]">介面示意・範例資料</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#4C6259]">另可選配健康評估與體態追蹤，查看量測紀錄與變化趨勢。</p>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-2 border-b border-[#153B31]/10 py-3 text-base"><span className="text-[#64756D]">{label}</span><span className="font-medium">{value}</span></div>;
}

function Action({ children }: { children: React.ReactNode }) {
  return <span className="block rounded-lg bg-[#123E32] px-4 py-3 text-center text-base font-medium text-white">{children}</span>;
}

export function WorkflowPanel({ index }: { index: number }) {
  if (index === 0) return <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-[#153B31]/15 bg-[#DDE7E2]" role="img" aria-label="LINE 數位管家對話示意：顧客詢問體驗，管家提供預約與聯繫選項">
    <div className="bg-white px-5 py-3 font-semibold">LINE｜門市數位管家</div>
    <div className="space-y-4 p-4">
      <p className="ml-auto w-fit rounded-2xl rounded-tr-none bg-[#BCE6AD] px-4 py-3">我想了解第一次體驗</p>
      <div className="mr-5 rounded-2xl rounded-tl-none bg-white p-4">
        <p className="leading-7">你好，想先了解服務，還是直接安排體驗？</p>
        <div className="mt-4 grid gap-2"><Action>了解服務</Action><Action>前往預約</Action><span className="py-2 text-center text-[#123E32]">留下需求，聯繫店家</span></div>
      </div>
    </div>
  </div>;
  if (index === 1) return <div className="space-y-4" role="img" aria-label="預約建檔示意：顧客預約成功後，14 點體驗預約顯示於店長名單">
    <div className="flex items-center gap-3 rounded-xl bg-white p-4"><span className="rounded-full bg-[#E0EDE4] px-3 py-2 text-[#123E32]">✓</span><div><p className="font-semibold">預約成功</p><p className="mt-1 text-sm text-[#64756D]">體驗顧客・14:00・1 位</p></div></div>
    <div className="overflow-hidden rounded-xl border border-[#153B31]/15 bg-white">
      <div className="flex justify-between gap-3 border-b p-4"><strong>店長｜當日預約</strong><span className="text-sm text-[#64756D]">顧客與時段</span></div>
      <div className="grid grid-cols-[0.7fr_1fr_1fr] gap-2 bg-[#F3F5F1] px-4 py-3 text-sm text-[#64756D]"><span>時間</span><span>顧客</span><span>服務</span></div>
      <div className="grid grid-cols-[0.7fr_1fr_1fr] items-center gap-2 border-l-4 border-[#B58C43] bg-[#FAF5E9] px-3 py-5 text-base"><strong>14:00</strong><span>體驗顧客</span><span>體驗・1 位</span></div>
      <div className="px-4 py-3 text-sm text-[#64756D]">顧客資料　✓　預約時段　✓</div>
    </div>
  </div>;
  if (index === 2) return <div className="mx-auto max-w-md space-y-4" role="img" aria-label="到店提醒卡片示意，含確認會到、改期、取消與導航；後台顯示已確認會到">
    <div className="overflow-hidden rounded-xl bg-white shadow-sm"><div className="bg-[#123E32] px-5 py-3 text-white">LINE｜體驗到店提醒</div><div className="p-4"><p className="text-xl font-semibold">明天見！</p><Field label="服務" value="首次體驗" /><Field label="預約時間" value="明天 14:00" /><div className="mt-4"><Action>確認會到</Action></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm text-[#123E32]"><span>改期</span><span>取消</span><span>導航店家</span></div></div></div>
    <div className="flex flex-wrap justify-between gap-3 rounded-xl border border-[#123E32]/20 bg-[#E0EDE4] p-4"><span>店長後台｜體驗顧客</span><strong className="text-[#123E32]">✓ 已確認會到</strong></div>
  </div>;
  if (index === 3) return <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-[#153B31]/15 bg-white shadow-sm" role="img" aria-label="結帳面板示意：核對顧客服務，選擇方案扣堂，完成後留下扣堂紀錄">
    <div className="border-b px-5 py-3 font-semibold">店長｜服務與結帳</div><div className="p-4"><Field label="顧客" value="範例顧客" /><Field label="服務" value="門市服務・1 位" /><p className="mb-3 mt-4 text-sm text-[#64756D]">核對結帳方式</p><div className="grid grid-cols-2 gap-3"><span className="rounded-lg border px-3 py-3 text-center">單次收款</span><span className="rounded-lg border-2 border-[#123E32] bg-[#EFF5F0] px-3 py-3 text-center font-medium">✓ 方案扣堂</span></div><Field label="本次使用" value="1 堂" /><div className="mt-4"><Action>完成服務</Action></div><p className="mt-4 text-center text-sm text-[#64756D]">完成後，可核對方案扣堂紀錄</p></div>
  </div>;
  return <div className="mx-auto max-w-md overflow-hidden rounded-xl bg-white shadow-sm" role="img" aria-label="方案到期卡片示意：顯示方案、剩餘堂數和到期日，提供立即預約和諮詢店長">
    <div className="bg-[#123E32] px-5 py-3 text-white">LINE｜方案到期提醒</div><div className="p-4"><p className="text-xl font-semibold">別忘了你的剩餘堂數</p><Field label="方案" value="範例方案" /><Field label="剩餘堂數" value="2 堂" /><Field label="到期日（範例）" value="9 月 30 日" /><p className="my-4 text-sm leading-6 text-[#64756D]">請於方案有效期限內完成服務。</p><Action>立即預約</Action><span className="mt-2 block rounded-lg border border-[#123E32]/20 py-3 text-center text-base">諮詢店長</span></div>
  </div>;
}
