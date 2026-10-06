"use client";
import { useState } from "react";
const devices = {
  desktop: { label: "桌機", width: 1180 },
  tablet: { label: "iPad 直向", width: 768 },
  landscape: { label: "iPad 橫向", width: 1024 },
  narrow: { label: "窄手機", width: 360 },
  phone: { label: "手機", width: 390 },
};
export function DeviceReview() {
  const [device, setDevice] = useState<keyof typeof devices>("desktop");
  const [page, setPage] = useState("/pricing/trial");
  return (
    <main className="min-h-screen bg-[#e7ebe7] p-4 text-[#263d35]">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
        <span className="text-sm">官網與共用加購提示預覽</span>
        {Object.entries(devices).map(([key, value]) => (
          <button
            key={key}
            aria-pressed={device === key}
            onClick={() => setDevice(key as keyof typeof devices)}
            className={`min-h-11 rounded-lg border px-4 py-2 text-sm ${device === key ? "bg-[#315e49] text-white" : "bg-white"}`}
          >
            {value.label}
          </button>
        ))}
        <select
          aria-label="預覽內容"
          value={page}
          onChange={(event) => setPage(event.target.value)}
          className="min-h-11 max-w-full rounded-lg border bg-white px-3 py-2 text-sm"
        >
          <option value="/pricing#comparison">方案比較</option>
          <option value="/pricing#addons">加購項目</option>
          <option value="/pricing/features#work-orders">工單功能說明</option>
          <option value="/pricing/features#inventory">進銷存功能說明</option>
          <option value="/pricing/business">店務管理介紹</option>
          <option value="/pricing/addon-review">共用加購提示與方案說明（虛擬資料）</option>
          <option value="/pricing/trial">申請表單</option>
          <option value="/pricing/trial/guide/oa-admin">官方 LINE 授權教學</option>
          <option value="/pricing/trial/guide/developers">Developers 授權教學</option>
          <option value="/hq/dashboard/trial-applications">總部收件（需管理員登入）</option>
        </select>
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
        src={page}
        className="mx-auto block h-[820px] max-w-full rounded-xl border bg-white shadow-lg"
        style={{ width: devices[device].width }}
      />
    </main>
  );
}
