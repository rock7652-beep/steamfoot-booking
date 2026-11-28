"use client";

import { PUBLIC_MARKETING_FAQ } from "@/lib/public-marketing-faq";
import { useId, useState } from "react";

const categories = PUBLIC_MARKETING_FAQ;

export function MarketingFaq() {
  const [active, setActive] = useState(0);
  const id = useId();
  const category = categories[active];
  return <section id="faq" aria-labelledby={`${id}-title`} className="mt-8 scroll-mt-24 border-t border-[#153B31]/15 pt-8">
    <h2 id={`${id}-title`} className="text-2xl font-semibold">常見問題，先看你最在意的</h2>
    <p className="mt-2 text-base leading-7 text-[#4C6259]">選一個分類，快速找到答案。</p>
    <div role="group" aria-label="常見問題分類" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {categories.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} aria-controls={`${id}-questions`} onClick={() => setActive(index)} className={`min-h-12 rounded-xl border px-3 py-3 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#967039] ${active === index ? "border-[#123E32] bg-[#123E32] text-white" : "border-[#153B31]/20 bg-white text-[#153B31] hover:bg-[#EDF1EA]"}`}>{item.label}</button>)}
    </div>
    <div id={`${id}-questions`} key={active} role="region" aria-label={category.label} className="mt-4 divide-y divide-[#153B31]/15 rounded-xl border border-[#153B31]/15 bg-white px-4 sm:px-5">
      {category.questions.map(item => <details key={item.question} name={`${id}-accordion`} className="group py-1">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#967039] [&::-webkit-details-marker]:hidden">
          {item.question}<span aria-hidden="true" className="shrink-0 text-xl text-[#967039] group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 pb-4 text-base leading-7 text-[#4C6259]">
          {item.answers.map(answer => <p key={answer}>{answer}</p>)}
          {item.pricingLink && <a href="/pricing" className="inline-flex min-h-11 items-center font-medium text-[#153B31] underline underline-offset-4">查看完整體驗說明與正式價格 →</a>}
        </div>
      </details>)}
    </div>
    <p className="mt-4 text-sm leading-6 text-[#4C6259]">還有其他問題？<a href="https://lin.ee/SGy5UBz" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-[#153B31] underline underline-offset-4">加官方 LINE 問我們 ↗</a></p>
  </section>;
}
