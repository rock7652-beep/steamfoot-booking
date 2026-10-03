"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateZh } from "@/lib/date-utils";
import type { MarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

// Verified aggregate snapshot; see docs/marketing-usage-statistics.md.
// No customer records or database credentials are sent to the browser.
export function MarketingUsageStatistics({ snapshot }: { snapshot: MarketingUsageSnapshot }) {
  const statistics = [
    { label: "使用門市", value: snapshot.stores, unit: "間" },
    { label: "服務顧客名單", value: snapshot.customers, unit: "筆" },
    { label: "累計完成服務", value: snapshot.completedPeople, unit: "人次" },
  ];
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
      <h2 id="usage-title" className="text-sm font-medium tracking-widest text-[#74603C]">從預約到服務，店家每天都在使用</h2>
      <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-6">
        {statistics.map((item, index) => <div key={item.label} className={index > 0 ? "border-l border-[#153B31]/15 pl-3 sm:pl-6" : ""}>
          <dt className="min-h-12 text-sm leading-6 text-[#4C6259] sm:min-h-0 sm:text-base">{item.label}</dt>
          <dd className="mt-2 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="sr-only">{item.value.toLocaleString("en-US")} {item.unit}</span>
            <span aria-hidden="true" style={{ width: `${item.value.toLocaleString("en-US").length}ch` }} className="inline-block text-[clamp(1.625rem,4vw,3rem)] font-semibold leading-tight tracking-tight tabular-nums">{Math.round(item.value * progress).toLocaleString("en-US")}</span>
            <span aria-hidden="true" className="text-sm text-[#74603C]">{item.unit}</span>
          </dd>
        </div>)}
      </dl>
      <p className="mt-5 text-sm leading-6 text-[#4C6259]">截至 {formatDateZh(snapshot.asOf)}</p>
    </div>
  </section>;
}
