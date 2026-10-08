"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

// Verified aggregate snapshot; see docs/marketing-usage-statistics.md.
// No customer records or database credentials are sent to the browser.
export function MarketingUsageStatistics({ snapshot }: { snapshot: MarketingUsageSnapshot }) {
  const statistics = [
    { label: "使用店家", value: snapshot.stores, unit: "間" },
    { label: "服務顧客", value: snapshot.customers, unit: "位" },
    { label: "完成服務", value: snapshot.completedPeople, unit: "人次" },
    { label: "自動提醒", value: snapshot.remindersSent, unit: "則" },
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
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4 md:gap-x-6">
        {statistics.map((item, index) => <div key={item.label} className={`min-w-0 ${index % 2 === 1 ? "border-l border-[#153B31]/15 pl-4 md:pl-6" : index > 0 ? "md:border-l md:border-[#153B31]/15 md:pl-6" : ""}`}>
          <dt className="text-sm leading-6 text-[#4C6259] sm:text-base">{item.label}</dt>
          <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="sr-only">{item.value.toLocaleString("en-US")} {item.unit}</span>
            <span aria-hidden="true" className="inline-grid text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-tight tabular-nums">
              <span className="invisible col-start-1 row-start-1">{item.value.toLocaleString("en-US")}</span>
              <span className="col-start-1 row-start-1">{Math.round(item.value * progress).toLocaleString("en-US")}</span>
            </span>
            <span aria-hidden="true" className="text-sm text-[#74603C]">{item.unit}</span>
          </dd>
        </div>)}
      </dl>
      <p className="mt-5 text-sm leading-6 text-[#4C6259]">每日更新｜資料更新至 {snapshot.asOf.replaceAll("-", "/")}</p>
      <p className="mt-1 text-sm leading-6 text-[#4C6259]">自動提醒依已記錄成功發送統計</p>
    </div>
  </section>;
}
