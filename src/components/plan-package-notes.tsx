/** Display copy only: never updates billing, subscriptions or entitlements. */
export function PlanPackageNotes() {
  return (
    <section className="rounded-xl border border-earth-200 bg-white p-5 text-sm leading-relaxed text-earth-700">
      <h3 className="font-semibold text-earth-900">限時優惠｜一次繳一年，再送 2 個月</h3>
      <p className="mt-2">主方案一次支付 12 個月費用，共可使用 14 個月。基本版 NT$17,880、專業版 NT$29,880、展店版 NT$59,880 起。</p>
      <p className="mt-2">三個付費方案皆內含 LINE 顧客入口（LIFF），可預約、取消及查詢方案堂數；保留各門市獨立開關。入口開啟不代表其他模組全部開通。</p>
      <h4 className="mt-4 font-semibold text-earth-900">選配額度與額外加購</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>基本版：內含 1 個工具型模組選配額度。</li>
        <li>專業版：內含顧客經營、現金抽屜，另含 1 個工具型與 1 個經營型模組選配額度。</li>
        <li>工具型模組：LINE 自動提醒、資料匯出、現金抽屜；額外加購每個 NT$500／月。</li>
        <li>經營型模組：顧客經營、健康評估與體態追蹤、經營診斷、月結管理；額外加購每個 NT$800／月。</li>
        <li>額度內選配不另收費；展店版包含上述模組。數位管家需個別確認開通，不列入上述全含範圍。</li>
      </ul>
      <p className="mt-3">健康評估與體態追蹤包含量測紀錄、歷史數據與變化趨勢，協助日常追蹤與顧客關懷，不作醫療診斷或效果保證；各門市保留獨立開關。</p>
      <p className="mt-3 text-xs text-earth-500">以上年繳總額僅計主方案。額外加購模組、分店營運費及其贈送期間，請於開通前確認；實際開通與付款請聯絡客服。本頁不變更既有帳單或訂閱期限。</p>
    </section>
  );
}
