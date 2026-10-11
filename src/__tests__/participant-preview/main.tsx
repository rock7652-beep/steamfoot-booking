import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingParticipantCheckout } from "../../app/(dashboard)/dashboard/bookings/booking-participant-checkout";
import { RightSheet } from "../../components/admin/right-sheet";
import { OperationScope } from "../../components/operations/operation-scope";
import { state, sales } from "./actions";
import "../../app/globals.css";

function Preview() {
  const [revision, refresh] = useState(0); const [busy, setBusy] = useState(false);
  const checkout = { ...state, slots: state.slots.map(slot => ({ ...slot })) };
  return <OperationScope scope="isolated-participant-preview"><main className="min-h-screen bg-earth-100 p-4">
    <RightSheet open fitContent presentation="centered" width={860} onClose={() => {}} labelledById="preview-title">
      <header className="border-b border-earth-200 p-4">
        <p className="text-sm text-amber-800">隔離介面驗收 · 模擬資料 · 不會產生真實收款</p>
        <h1 id="preview-title" className="mt-2 text-xl font-semibold text-earth-900">10/9 13:30 · 兩人體驗</h1>
        <p className="mt-1 text-base text-earth-600">預約 2 人 · 已完成 {checkout.slots.filter(slot => slot.status === "COMPLETED").length} 人</p>
      </header>
      <div className="min-w-0 overflow-y-auto"><BookingParticipantCheckout bookingId="preview" checkout={checkout} readOnly={false} blocked={busy}
        companions={{ canAdd: checkout.slots.length < 4, canCreate: true, canEdit: true, slots: checkout.slots.filter(slot => slot.position > 1) }}
        onBusy={setBusy} onUpdated={() => refresh(value => value + 1)} /></div>
      <footer className="border-t border-earth-200 p-4 text-sm text-earth-600" data-revision={revision}>體驗費與方案分開收款。已開方案 {sales.length} 張。</footer>
    </RightSheet>
  </main></OperationScope>;
}
function DevicePreview() {
  const [size, setSize] = useState([1366, 900]);
  return <main className="min-h-screen bg-earth-100 p-3">
    <h1 className="text-lg font-semibold">多人預約 · 隔離 UI 驗收</h1>
    <p className="my-2 text-sm">模擬視窗尺寸，不連資料庫。切換尺寸會保留 iframe 內的操作狀態。</p>
    <nav className="mb-3 flex flex-wrap gap-2" aria-label="驗收尺寸">
      {[[1366, 900, "桌機"], [1024, 768, "iPad 橫向"], [768, 1024, "iPad 直向"], [390, 844, "窄螢幕"]].map(([width, height, label]) =>
        <button key={label} type="button" className="min-h-11 rounded border border-earth-300 bg-white px-3" aria-pressed={size[0] === width}
          onClick={() => setSize([Number(width), Number(height)])}>{label} {width}×{height}</button>)}
    </nav>
    <div className="max-w-full overflow-auto">
      <iframe title="逐人体驗操作預覽" src="?frame=1" width={size[0]} height={size[1]} className="block border border-earth-300" />
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(new URLSearchParams(window.location.search).has("frame") ? <Preview /> : <DevicePreview />);
