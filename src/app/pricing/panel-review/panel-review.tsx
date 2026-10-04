"use client";

import { useState } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

export type PanelMode = "side" | "centered" | "compact" | "fit" | "settings";
const devices = [
  { label: "窄手機", width: 360, height: 800 },
  { label: "手機", width: 390, height: 844 },
  { label: "分割畫面", width: 640, height: 768 },
  { label: "iPad 直向", width: 768, height: 1024 },
  { label: "iPad 橫向", width: 1024, height: 768 },
  { label: "桌機", width: 1366, height: 900 },
  { label: "寬螢幕", width: 1920, height: 1080 },
  { label: "短視窗", width: 1024, height: 400 },
];
const title = "共用設定與營運視窗：長名稱及不中斷英文識別碼ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const control = "min-h-11 rounded-lg border px-3 text-sm";

export function PanelDeviceReview({ mode, spa = false }: { mode: PanelMode; spa?: boolean }) {
  const [device, setDevice] = useState(devices[5]);
  return <main className="min-h-dvh bg-earth-50 p-4">
    <h1 className="text-lg font-semibold">共用視窗 RWD 驗收{spa ? "・SPA 樣式" : ""}</h1>
    <p className="my-2">使用正式共用元件與假資料，沒有儲存或通知。尺寸切換保留同一 iframe，檢查草稿不被重置。</p>
    <nav aria-label="視窗種類" className="flex flex-wrap gap-2">
      {(["side", "centered", "compact", "fit", "settings"] as const).map(item =>
        <a key={item} href={"?mode=" + item + (spa ? "&theme=spa" : "")} className={control} aria-current={mode === item ? "page" : undefined}>{item}</a>)}
    </nav>
    <div aria-label="裝置尺寸" className="my-3 flex flex-wrap gap-2">
      {devices.map(item => <button type="button" key={item.label} className={control} aria-pressed={device.label === item.label} onClick={() => setDevice(item)}>{item.label}</button>)}
    </div>
    <p>{device.width} × {device.height}</p>
    <div className="mt-3 overflow-x-auto">
      <iframe title="共用視窗測試" src={"/pricing/panel-review?frame=1&mode=" + mode} width={device.width} height={device.height} className="block border-0 bg-white" />
    </div>
  </main>;
}

function FixtureContent() {
  const [draft, setDraft] = useState("");
  useSettingsPanelGuard(Boolean(draft), false);
  return <div className="min-w-0 space-y-3 p-4">
    <label className="block">測試草稿
      <input aria-label="測試草稿" value={draft} onChange={event => setDraft(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border px-3 text-base" />
    </label>
    <p className="break-words">目前草稿：{draft || "尚未輸入"}</p>
    <p role="alert" className="break-words text-red-700">測試錯誤：保留原本輸入，請檢查欄位後再操作。</p>
    <div role="region" aria-label="局部捲動表格" tabIndex={0} className="max-w-full overflow-x-auto rounded border">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead><tr>{["名稱", "狀態", "門市", "備註"].map(item => <th key={item} className="p-2">{item}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 24 }, (_, index) => <tr key={index} className="border-t">
          <td className="p-2">測試資料 {index + 1}</td><td className="p-2">啟用</td><td className="p-2">測試門市</td><td className="p-2">大量資料與長名稱驗收</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p>底部內容已到達，沒有真實資料。</p>
    <button type="button" className={control}>測試主操作</button>
  </div>;
}

export function PanelFixture({ mode }: { mode: PanelMode }) {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);
  if (mode === "settings") return <SettingsPanel title={title} sourceHref="/pricing/panel-review"><FixtureContent /></SettingsPanel>;
  return <main className="p-4">
    <button type="button" className={control} onClick={() => setOpen(true)}>開啟視窗</button>
    <RightSheet open={open} onClose={() => setOpen(false)} presentation={mode === "side" ? "side" : "centered"} compact={mode === "compact"} fitContent={mode === "fit"} width={mode === "side" ? 460 : 1100} labelledById="review-title">
      <header className="flex items-center justify-between gap-3 border-b p-4">
        <div className="flex-1"><h2 id="review-title" className="font-semibold">{title}</h2></div>
        <button type="button" className={control + " shrink-0"} onClick={() => setOpen(false)}>關閉視窗</button>
      </header>
      {mode === "fit" ? <form onSubmit={event => { event.preventDefault(); setSaved(true); }}><FixtureContent /><footer className="flex gap-3 border-t p-4"><button type="submit" className={control}>測試儲存</button><span role="status">{saved ? "測試完成，沒有寫入資料" : "未儲存"}</span></footer></form> :
        <><div className="min-h-0 min-w-0 flex-1 overflow-y-auto"><FixtureContent /></div><footer className="flex gap-3 border-t p-4"><button type="button" className={control} onClick={() => setSaved(true)}>測試儲存</button><button type="button" className={control} onClick={() => setOpen(false)}>取消</button><span role="status">{saved ? "測試完成，沒有寫入資料" : "未儲存"}</span></footer></>}
    </RightSheet>
  </main>;
}
