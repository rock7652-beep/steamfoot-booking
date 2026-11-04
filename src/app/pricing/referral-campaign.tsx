/** Public campaign design. Referral attribution and subscription rewards are not live. */
export const REFERRAL_CAMPAIGN_TERMS = [
  ["推薦方式", "每個帳戶一組推薦碼與專屬連結，轉換方案後沿用。朋友透過連結申請時帶入推薦關係，也可於首次付款前填入推薦碼；每位新客限綁定一位推薦人。"],
  ["成功條件", "朋友首次付費並正式開通，滿 30 天未退款，該次推薦即符合獎勵資格。"],
  ["獎勵內容", "符合條件後，推薦人與朋友各獲贈主方案 30 天使用期；接續原使用期限，已到期者於重新啟用時使用。"],
  ["累積與併用", "每成功推薦一位不同新客，再獲贈 30 天；可與年繳送 2 個月活動併用。"],
  ["不適用情況", "自我推薦、同一經營者增設分店、重複帳戶及退款訂單，不列入有效推薦。"],
  ["費用範圍", "贈送範圍為主方案，不包含加購功能、分店費、LINE 訊息及金流等第三方費用。"],
] as const;

export function ReferralCampaign() {
  return <section id="referral-campaign" aria-labelledby="referral-campaign-title" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8 sm:px-8">
    <div className="overflow-hidden rounded-2xl border border-[#B48A42]/35 bg-[#EEE9DD] p-5 sm:p-8">
      <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
        <div>
          <p className="text-sm font-medium text-[#74603C]">蒸管家・好友推薦活動</p>
          <h2 id="referral-campaign-title" className="mt-3 text-3xl font-semibold leading-snug sm:text-4xl">好用，值得分享。</h2>
          <p className="mt-4 text-base leading-7 text-[#4C6259]">推薦朋友使用蒸管家，朋友首次付費並符合活動條件後，</p>
          <p className="mt-2 text-2xl font-semibold leading-snug text-[#153B31]">你和朋友，各享 <span className="whitespace-nowrap text-[#805C1B]">30 天免費使用期。</span></p>
          <p className="mt-4 text-base leading-7 text-[#4C6259]">分享你的專屬連結，或請朋友申請時填入推薦碼，就能記錄推薦關係。推薦越多，免費天數越多。</p>
          <div className="mt-5 flex flex-wrap gap-3" aria-describedby="referral-availability">
            <button type="button" disabled className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-full bg-[#123E32] px-5 py-3 text-base font-semibold text-white opacity-65">取得推薦連結</button>
            <button type="button" disabled className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-full border border-[#153B31]/35 bg-white/60 px-5 py-3 text-base font-semibold opacity-65">我有推薦碼</button>
          </div>
          <p id="referral-availability" className="mt-3 text-sm leading-6 text-[#4C6259]">活動即將開放，推薦連結與推薦碼入口尚未啟用。</p>
          <a href="#referral-terms" className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">查看活動辦法 ↓</a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" aria-label="雙方推薦獎勵">
          {["你", "朋友"].map(person => <div key={person} className="min-w-0 rounded-xl border border-[#153B31]/15 bg-white/80 p-5">
            <p className="text-base font-medium text-[#4C6259]">{person}獲得</p>
            <p className="mt-3 text-5xl font-semibold tabular-nums text-[#153B31]">30<span className="ml-2 text-lg font-medium">天</span></p>
            <p className="mt-3 text-base leading-7 text-[#4C6259]">主方案免費使用期</p>
          </div>)}
          <ol className="space-y-3 rounded-xl bg-[#F8F5EE] p-5 text-base leading-7 sm:col-span-2">
            <li><span className="mr-2 font-semibold text-[#805C1B]">01</span>分享專屬連結或推薦碼</li>
            <li><span className="mr-2 font-semibold text-[#805C1B]">02</span>朋友首次付費並符合活動條件</li>
            <li><span className="mr-2 font-semibold text-[#805C1B]">03</span>雙方各獲贈 30 天，獎勵可累積</li>
          </ol>
        </div>
      </div>
      <details id="referral-terms" className="mt-6 scroll-mt-24 border-t border-[#153B31]/20 pt-3">
        <summary className="min-h-12 cursor-pointer py-3 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">推薦活動辦法</summary>
        <dl className="divide-y divide-[#153B31]/15">{REFERRAL_CAMPAIGN_TERMS.map(([label, text]) => <div key={label} className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-4"><dt className="text-base font-semibold">{label}</dt><dd className="text-base leading-7 text-[#4C6259]">{text}</dd></div>)}</dl>
      </details>
    </div>
  </section>;
}
