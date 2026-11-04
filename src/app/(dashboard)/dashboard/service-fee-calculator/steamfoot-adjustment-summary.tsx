"use client";
import {adjustmentTotals} from "@/lib/staff-monthly-adjustment";
import {useMonthlyAdjustmentState} from "@/components/operations/monthly-adjustment-context";
const money=(n:number)=>`NT$ ${n.toLocaleString("zh-TW",{maximumFractionDigits:2})}`;
export function SteamfootAdjustmentSummary({people}:{people:{id:string;name:string;amount:number;needsReview:boolean}[]}) {
  const state=useMonthlyAdjustmentState()!;
  const entries=people.map(p=>({...p,totals:adjustmentTotals(state.snapshot.rows.filter(r=>r.staffId===p.id))}));
  return <>
    <section className="space-y-2"><h2 className="text-sm font-medium">本月收入與調整</h2><div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-earth-50"><tr>{["人員","原收入金額","加項合計","減項合計","調整後合計"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{entries.map(p=><tr key={p.id} className="border-t"><td className="p-3">{p.name}</td><td className="p-3">{money(p.amount)}</td><td className="p-3">+{money(p.totals.addition)}</td><td className="p-3">−{money(p.totals.deduction)}</td><td className="p-3 font-medium">{p.needsReview?"待核對":money(p.amount+p.totals.net)}</td></tr>)}</tbody></table></div><p className="text-sm text-earth-500">租金依原約定分列，不自動從收入扣除。負數差額不自動帶入下個月。</p></section>
    {entries.some(p=>p.amount+p.totals.net<0)&&<p role="alert" className="text-sm text-amber-800">部分人員的減項超過原收入，請核對；差額不會自動帶入下個月。</p>}
  </>;
}
