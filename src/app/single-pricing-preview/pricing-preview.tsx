"use client";
import { useState } from "react";
import { CollectSingleModal } from "@/app/(dashboard)/dashboard/bookings/collect-single-modal";
import { resolveSingleBookingTotal } from "@/lib/single-booking-price";

export default function PricingPreview({ framed = false }: { framed?: boolean }) {
  const [people, setPeople] = useState<number | null>(null);
  const [device, setDevice] = useState([1366, 900]);
  if (!framed) return <main className="p-4">
    <h1 className="mb-3 text-xl font-semibold">多人收款・裝置預覽</h1>
    <div className="mb-4 flex flex-wrap gap-2">
      {[[1366, 900], [1920, 1080], [1024, 768], [768, 1024]].map(([w, h]) =>
        <button key={w} className="min-h-11 rounded-lg border px-4" onClick={() => setDevice([w, h])}>{w} × {h}</button>)}
    </div>
    <div className="overflow-auto"><iframe title="收款預覽" src="/single-pricing-preview?frame=1"
      style={{ width: device[0], height: device[1], border: "1px solid #ddd" }} /></div>
  </main>;
  return <main className="mx-auto max-w-4xl p-6 text-earth-900">
    <h1 className="text-xl font-semibold">多人單次收款預覽</h1>
    <p className="my-4">測試資料，僅供查看；不會收款或變更顧客資料。</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[1, 2, 3, 4].map(n => <section key={n} className="rounded-xl border border-earth-200 p-4">
        <h2 className="font-semibold">{n} 人・單次蒸足</h2>
        <p className="my-3">預計收款 NT$ {resolveSingleBookingTotal({ people: n }).toLocaleString()}</p>
        <button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white" onClick={() => setPeople(n)}>查看 {n} 人收款</button>
      </section>)}
    </div>
    {people != null && <CollectSingleModal key={people} open onClose={() => setPeople(null)} bookingId="synthetic-pricing-preview"
      customerName="測試顧客" dateLabel="2026/10/09 17:30" people={people}
      defaultPrice={resolveSingleBookingTotal({ people })} readOnly onCollected={() => {}} />}
  </main>;
}
