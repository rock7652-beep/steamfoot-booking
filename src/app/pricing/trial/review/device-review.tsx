"use client";
import { useState } from "react";
const devices = {
  desktop: { label: "桌機", width: 1180 },
  tablet: { label: "iPad", width: 768 },
  phone: { label: "手機", width: 390 },
};
export function DeviceReview() {
  const [device, setDevice] = useState<keyof typeof devices>("desktop");
  return (
    <main className="min-h-screen bg-[#e7ebe7] p-4 text-[#263d35]">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
        <span className="text-sm">體驗申請畫面預覽</span>
        {Object.entries(devices).map(([key, value]) => (
          <button
            key={key}
            aria-pressed={device === key}
            onClick={() => setDevice(key as keyof typeof devices)}
            className={`rounded-lg border px-4 py-2 text-sm ${device === key ? "bg-[#315e49] text-white" : "bg-white"}`}
          >
            {value.label}
          </button>
        ))}
        <a
          className="text-sm underline"
          href="/pricing/trial"
          target="_blank"
          rel="noopener noreferrer"
        >
          直接開啟申請頁 ↗
        </a>
      </div>
      <iframe
        title={`${devices[device].label}體驗申請頁`}
        src="/pricing/trial"
        className="mx-auto block h-[820px] max-w-full rounded-xl border bg-white shadow-lg"
        style={{ width: devices[device].width }}
      />
    </main>
  );
}
