import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingParticipantCheckout } from "../../app/(dashboard)/dashboard/bookings/booking-participant-checkout";
import { BookingCompanionEditor } from "../../app/(dashboard)/dashboard/bookings/booking-companion-editor";
import { RightSheet } from "../../components/admin/right-sheet";
import { OperationScope } from "../../components/operations/operation-scope";
import { state, sales } from "./actions";
import "../../app/globals.css";

function Preview() {
  const [revision, refresh] = useState(0); const [busy, setBusy] = useState(false);
  const checkout = { ...state, slots: state.slots.map(slot => ({ ...slot })) };
  return <OperationScope scope="isolated-participant-preview"><main className="min-h-screen bg-earth-100 p-4">
    <RightSheet open presentation="centered" width={860} onClose={() => {}} labelledById="preview-title">
      <header className="border-b border-earth-200 p-4">
        <p className="text-sm text-amber-800">隔離介面驗收 · 模擬資料 · 不會產生真實收款</p>
        <h1 id="preview-title" className="mt-2 text-xl font-semibold text-earth-900">10/9 13:30 · 兩人體驗</h1>
        <p className="mt-1 text-base text-earth-600">預約 2 人 · 已完成 {checkout.slots.filter(slot => slot.status === "COMPLETED").length} 人</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <section className="min-w-0 p-4"><h2 className="text-base font-semibold">預約者與同行者</h2>
          <p className="mt-2 text-base">呂明憲（宗諺爸） · 0912-345-678</p>
          <BookingCompanionEditor bookingId="preview" companions={{ canCreate: true, canEdit: true, slots: checkout.slots.filter(slot => slot.position > 1) }}
            readOnly={busy} onUpdated={() => refresh(value => value + 1)} />
        </section>
        <div className="min-w-0"><BookingParticipantCheckout bookingId="preview" checkout={checkout} readOnly={false} blocked={busy}
          onBusy={setBusy} onUpdated={() => refresh(value => value + 1)} /></div>
      </div>
      <footer className="border-t border-earth-200 p-4 text-sm text-earth-600" data-revision={revision}>體驗費與方案分開收款。已開方案 {sales.length} 張。</footer>
    </RightSheet>
  </main></OperationScope>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
