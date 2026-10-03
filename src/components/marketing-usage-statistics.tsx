"use client";

import { useEffect, useRef, useState } from "react";

// Verified aggregate snapshot; see docs/marketing-usage-statistics.md.
// No customer records or database credentials are sent to the browser.
const statistics = [
  { label: "正式使用門市", value: 3, unit: "間" },
  { label: "已服務顧客名單", value: 328, unit: "筆" },
  { label: "累計完成服務", value: 1631, unit: "人次" },
] as const;

export function MarketingUsageStatistics() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const section = sectionRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!section || motion.matches || !("IntersectionObserver" in window)) return;
    let frame = 0;
    let started = false;
    const finish = () => {
      cancelAnimationFrame(frame);
      setProgress(1);
    };
    const onMotionChange = () => { if (motion.matches) finish(); };
    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some(entry => entry.isIntersecting)) return;
      started = true;
      observer.disconnect();
      if (motion.matches) return;
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = Math.min((now - start) / 1100, 1);
        setProgress(1 - Math.pow(1 - elapsed, 3));
        if (elapsed < 1) frame = requestAnimationFrame(tick);
      };
      setProgress(0);
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.25 });
    observer.observe(section);
    motion.addEventListener("change", onMotionChange);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <section ref={sectionRef} id="usage" aria-labelledby="usage-title" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-7 sm:px-8 sm:pb-8">
    <div className="border-y border-[#153B31]/15 py-6 sm:py-7">
      <h2 id="usage-title" className="text-sm font-medium tracking-widest text-[#74603C]">每天的服務，累積真實的使用紀錄</h2>
      <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-6">
        {statistics.map((item, index) => <div key={item.label} className={index > 0 ? "border-l border-[#153B31]/15 pl-3 sm:pl-6" : ""}>
          <dt className="min-h-12 text-sm leading-6 text-[#4C6259] sm:min-h-0 sm:text-base">{item.label}</dt>
          <dd className="mt-2 flex flex-wrap items-baseline gap-x-1 sm:gap-x-2">
            <span className="sr-only">{item.value.toLocaleString("en-US")} {item.unit}</span>
            <span aria-hidden="true" className="inline-block w-[5ch] text-[clamp(1.625rem,4vw,3rem)] font-semibold leading-tight tracking-tight tabular-nums">{Math.round(item.value * progress).toLocaleString("en-US")}</span>
            <span aria-hidden="true" className="text-sm text-[#74603C]">{item.unit}</span>
          </dd>
        </div>)}
      </dl>
      <p className="mt-5 text-sm leading-6 text-[#4C6259]">截至 2026/10/2・依正式門市系統紀錄統計</p>
      <details className="mt-1 text-sm leading-6 text-[#4C6259]">
        <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4">統計方式</summary>
        <p className="mt-2 max-w-2xl">排除展示與體驗門市。顧客名單為有完成服務紀錄的名單，按門市計算，未作跨店人數去重；服務人次依實際出席人數累計，同一位顧客再次到店會再計一次。統計涵蓋自 2026/4/28 起的系統紀錄。</p>
      </details>
    </div>
  </section>;
}
