"use client";

import { useEffect, useState } from "react";
import { getPublicAddonOffer, getPublicPricingOffer, PUBLIC_PRICING_PLANS } from "@/lib/public-pricing-offer";
import { MarketingIcon } from "./marketing-icon";

function useNow(initialNow: number) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return now;
}
const money = (amount: number) => amount.toLocaleString("zh-TW");
const annualSavings = (plan: (typeof PUBLIC_PRICING_PLANS)[number]) => Number(plan.original.replaceAll(",", "")) * 12 - plan.annual;

export function PricingOffer({ initialNow, trialUrl }: { initialNow: number; trialUrl: string }) {
  const offer = getPublicPricingOffer(useNow(initialNow));
  return <>
    {offer.active && <section aria-labelledby="yearend-offer" className="mb-4 overflow-hidden rounded-2xl bg-[#123E32] px-5 py-4 text-white sm:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-semibold tracking-widest text-[#ECD5A4]">2026 年底前限定優惠</p>
          <h2 id="yearend-offer" className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">年繳 12 個月<span className="block text-[#ECD5A4] sm:ml-3 sm:inline">再送 2 個月</span></h2>
          <p className="mt-2 text-lg font-semibold text-[#ECD5A4]">年繳最高省 NT${money(Math.max(...PUBLIC_PRICING_PLANS.map(annualSavings)))}</p>
        </div>
        <div className="shrink-0">
          <p className="mb-2 text-sm text-[#E0E9E3]">優惠倒數</p>
          <div role="timer" aria-label="距離年底付款優惠截止" aria-live="off" className="flex gap-2">
            {offer.countdown.map((value, index) => <div key={index} className="min-w-0 flex-1 rounded-lg border border-[#ECD5A4]/30 bg-white/5 px-3 py-2 text-center sm:min-w-16">
              <span className="block text-3xl font-semibold tabular-nums text-[#ECD5A4]">{String(value).padStart(2, "0")}</span>
              <span className="mt-1 block text-sm text-[#E0E9E3]">{["天", "時", "分", "秒"][index]}</span>
            </div>)}
          </div>
        </div>
      </div>
      <p className="mt-3 border-t border-white/15 pt-2 text-sm leading-6 text-[#E0E9E3]">2026/12/31 23:59:59 前完成付款（台灣時間），自正式啟用日起享 14 個月。</p>
    </section>}
    <section aria-label="方案價格" className="grid gap-4 lg:grid-cols-3">
      {PUBLIC_PRICING_PLANS.map(plan => <article key={plan.id} aria-labelledby={plan.id} className={"flex flex-col rounded-2xl border p-5 " + (plan.id === "GROWTH" ? "border-[#123E32]/40 bg-[#E9F1EB]" : "border-[#153B31]/20 bg-white")}>
        <h2 id={plan.id} className="flex items-center gap-3 text-xl font-semibold"><MarketingIcon kind={plan.icon} />{plan.name}</h2>
        <p className="mt-1 text-lg font-medium">{plan.purpose}</p>
        <p className="mt-1 text-base leading-6 text-[#4C6259]">適合{plan.audience}</p>
        <div className="mt-3 border-t border-[#153B31]/15 pt-3">
          <p className="text-sm text-[#64756D] line-through">原價 NT${plan.original}／月{plan.id === "ALLIANCE" ? "起" : ""}</p>
          <p className="mt-2 text-sm font-medium text-[#4C6259]">年繳換算・平均每月{offer.active ? "約" : ""}</p>
          <p className="mt-1 whitespace-nowrap"><span className="text-4xl font-semibold tracking-tight">NT${money(Math.round(plan.annual / offer.months))}</span><span className="ml-1 text-base">／月{plan.id === "ALLIANCE" ? "起" : ""}</span></p>
          <p className="mt-2 text-base font-semibold">年繳 NT${money(plan.annual)}{plan.id === "ALLIANCE" ? "起" : ""}<span className="block text-sm font-normal text-[#4C6259]">一次繳清</span></p>
          <p className="mt-2 text-lg font-semibold text-[#805C1B]">年繳省 NT${money(annualSavings(plan))}</p>
          <p className="mt-2 rounded-lg border border-[#C39A51]/30 bg-[#FBF4E5] px-3 py-2 text-base font-semibold text-[#59441E]">{offer.active ? <>12 個月<span className="ml-1 text-[#805C1B]">＋贈送 2 個月</span></> : "使用 12 個月"}</p>
        </div>
        <ul className="my-3 space-y-1 text-sm leading-6">{plan.benefits.map(benefit => <li key={benefit} className="flex gap-2"><span aria-hidden="true" className="font-semibold text-[#805C1B]">✓</span><span>{benefit}</span></li>)}</ul>
        {plan.id === "ALLIANCE" && <p className="mb-3 text-sm leading-6 text-[#4C6259]">串接費依實際分店數另計；各分店系統月費另計。</p>}
        <a href={trialUrl} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-[#123E32] px-5 py-3 text-base font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4">申請 30 天免費體驗<span aria-hidden="true" className="ml-2">→</span></a>
      </article>)}
    </section>
    <p className="mt-3 text-sm leading-6 text-[#4C6259]">年繳省額依原價月費 × 12 − 年繳總額計算，不含贈送月份價值。平均月費依年繳總額 ÷ {offer.months} 個月{offer.active ? "計算，四捨五入至整元" : "計算"}，採一次年繳。使用期間自正式啟用日起算。LINE 訊息、金流、加購功能與分店相關費用另計，開通前確認。</p>
  </>;
}
export function PricingOfferTerms({ initialNow }: { initialNow: number }) {
  const offer = getPublicPricingOffer(useNow(initialNow));
  return <>{offer.active ? "2026/12/31 前完成付款，主方案年繳 12 個月＋贈送 2 個月，自正式啟用日起享 14 個月。2027/01/01 起取消贈送 2 個月，年繳金額不變，使用期間為 12 個月。" : "主方案採一次年繳，自正式啟用日起使用 12 個月；年底贈送 2 個月活動已結束，年繳金額不變。"}</>;
}

export function AddonOffer({ initialNow }: { initialNow: number }) {
  const offer = getPublicAddonOffer(useNow(initialNow));
  return <div className="mt-4">
    {offer.active && <div className="rounded-xl border border-[#C39A51]/40 bg-[#FBF4E5] p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><p className="text-lg font-semibold text-[#59441E]">雙十店務升級優惠</p><p className="mt-1 text-base text-[#59441E]">十月限定・加購每項年繳最高省 NT$3,600</p></div>
        <div><p className="mb-1 text-sm text-[#59441E]">加購優惠倒數</p><div role="timer" aria-label="距離雙十加購付款優惠截止" aria-live="off" className="flex gap-2">
          {offer.countdown.map((value, index) => <div key={index} className="rounded-lg bg-white px-3 py-2 text-center"><span className="block text-2xl font-semibold tabular-nums">{String(value).padStart(2, "0")}</span><span className="text-sm">{["天", "時", "分", "秒"][index]}</span></div>)}
        </div></div>
      </div>
      <p className="mt-3 border-t border-[#C39A51]/25 pt-2 text-sm leading-6 text-[#59441E]">2026/10/31 23:59:59 前完成付款（台灣時間），優惠價適用首次購買期間；續約恢復原價。</p>
    </div>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {[{ name: "工具功能", features: "LINE 自動提醒／資料匯出／現金抽屜", monthly: offer.toolMonthly, original: 500 }, { name: "經營功能", features: "顧客經營／健康追蹤／月結管理／課程候補／分析", monthly: offer.businessMonthly, original: 800 }].map(item => <article key={item.name} className="rounded-xl border border-[#153B31]/15 bg-white p-4">
        <h3 className="text-lg font-semibold">{item.name}</h3>
        <p className="mt-1 text-sm leading-6 text-[#4C6259]">{item.features}・各項分別選購</p>
        {offer.active && <p className="mt-1 text-sm text-[#64756D] line-through">原價每項 NT${money(item.original)}／月</p>}
        <p className="mt-2 text-base">{offer.active ? "年繳優惠月費" : "年繳計價月費"} <span className="text-3xl font-semibold">NT${money(item.monthly)}</span>／月</p>
        <p className="mt-2 text-base font-semibold">每項年繳 NT${money(item.monthly * 12)}・一次繳清</p>
        <p className="mt-2 rounded-lg border border-[#C39A51]/30 bg-[#FBF4E5] px-3 py-2 text-base font-semibold text-[#59441E]">{offer.active && <span className="mb-1 block text-lg">每項年繳省 NT${money((item.original - item.monthly) * 12)}</span>}{offer.months === 14 ? "12 個月＋贈送 2 個月，使用 14 個月" : "使用 12 個月"}</p>
      </article>)}
    </div>
    <p className="mt-3 text-sm leading-6 text-[#4C6259]">加購採年繳，與主方案一起購買，自正式啟用日起算並同步到期。{offer.months === 14 && "贈送 2 個月優惠至 2026/12/31；雙十加購降價僅至 10/31。"}</p>
  </div>;
}

export function AddonRate({ initialNow, original }: { initialNow: number; original: number }) {
  const offer = getPublicAddonOffer(useNow(initialNow));
  const monthly = original === 500 ? offer.toolMonthly : offer.businessMonthly;
  return <>{offer.active && <span className="mr-2 line-through">原價 NT${original}／月</span>}<span className="font-semibold">{offer.active ? "年繳優惠月費" : "年繳計價月費"}每項 NT${monthly}／月</span>{offer.active && <span className="block font-semibold text-[#805C1B]">每項年繳省 NT${money((original - monthly) * 12)}</span>}<span className="block">年繳 NT${money(monthly * 12)}，使用 {offer.months} 個月。{offer.active && "10/31 前完成付款，首次購買期間適用；續約恢復原價。"}</span><a href="/pricing#addons" className="underline underline-offset-4">查看加購費用與優惠說明 →</a></>;
}
