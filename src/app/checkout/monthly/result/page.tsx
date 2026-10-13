export default function MonthlyCheckoutResultPage() {
  return <main className="mx-auto max-w-xl px-5 py-12 text-[#18332b]">
    <div className="rounded-2xl border border-[#153B31]/15 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">已返回蒸管家</h1>
      <p className="mt-3 leading-7 text-[#4C6259]">付款結果以蒸管家收到並驗證綠界的伺服器通知為準。首次授權成功後才會開通訂閱；若頁面未更新，請稍候或聯絡客服確認。</p>
      <a href="/terms" className="mt-4 inline-flex min-h-11 items-center underline">查看服務條款</a>
    </div>
  </main>;
}
