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
  return (
    <section id="how-it-works" aria-labelledby="day-title" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8 sm:py-24">
      <p className="text-sm tracking-widest text-[#74603C]">跟著店長的一天</p>
      <h2 id="day-title" className="mt-4 text-3xl font-semibold leading-snug sm:text-4xl">簡單學・一眼懂・輕鬆做</h2>
      <p className="mt-4 text-base leading-8 text-[#4C6259]">從第一句詢問，到下一次回訪。</p>
      <div className="mt-10 divide-y divide-[#153B31]/15">
        {stories.map((story, i) => (
          <article key={story.title} className="grid items-center gap-7 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <p className="text-sm font-medium text-[#967039]">0{i + 1}</p>
              <h3 className="mt-3 text-2xl font-semibold leading-snug">{story.title}</h3>
              <p className="mt-4 text-base leading-8 text-[#4C6259]">{story.description}</p>
            </div>
            <figure className="min-w-0 rounded-2xl border border-[#153B31]/15 bg-[#EEE9DD] p-5 sm:p-7">
              <div role="img" aria-label={story.from + "：" + story.message + "，接著" + story.to + "：" + story.result} className="grid gap-3">
                <div className="max-w-[90%] rounded-2xl rounded-bl-none bg-white p-5 shadow-sm">
                  <p className="text-sm text-[#74603C]">{story.from}</p>
                  <p className="mt-3 text-lg font-medium leading-7">{story.message}</p>
                  {i === 2 && <div aria-hidden="true" className="mt-4 border-t border-[#153B31]/15 pt-3 text-sm leading-7 text-[#123E32]">確認會到　／　改期　／　取消</div>}
                </div>
                <div aria-hidden="true" className="pl-6 text-xl text-[#967039]">↓</div>
                <div className="ml-auto w-[90%] rounded-2xl rounded-tr-none bg-[#123E32] p-5 text-white shadow-sm">
                  <p className="text-sm text-[#DFC99D]">{story.to}</p>
                  <p className="mt-3 text-lg font-semibold leading-7">{story.result}</p>
                </div>
              </div>
              <figcaption className="mt-4 text-sm leading-6 text-[#4C6259]">操作流程示意，非實際截圖。{story.detail}</figcaption>
            </figure>
          </article>
        ))}
      </div>
      <div className="mt-5 border-l-2 border-[#B58C43] pl-5">
        <h3 className="text-lg font-semibold">也照顧有體態管理需求的門市</h3>
        <p className="mt-2 text-base leading-8 text-[#4C6259]">健康評估與體態追蹤，可查看量測紀錄與變化趨勢，依方案選配或加購。</p>
      </div>
    </section>
  );
}
