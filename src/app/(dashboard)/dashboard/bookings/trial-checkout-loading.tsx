import {formatDateWithWeekdayZh} from "@/lib/date-utils";

/** Neutral loading shell: does not guess grouped/individual payment or expose a transaction. */
export function TrialCheckoutLoading({bookingDate,slotTime,people,staffName,error,onClose}:{bookingDate?:string;slotTime?:string;people?:number;staffName?:string;error:string|null;onClose:()=>void}) {
  return <div className="flex min-h-0 flex-1 flex-col" aria-busy={!error}>
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-earth-200 px-4 py-3"><h2 id="booking-drawer-title" className="text-xl font-bold text-earth-900">預約詳情{people && people>1 ? <span className="ml-2 rounded-full bg-amber-100 px-3 py-1 text-base">{people} 人</span> : null}</h2><button type="button" onClick={onClose} aria-label="關閉" className="min-h-11 min-w-11 rounded text-earth-500">✕</button></header>
    <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-earth-100 px-4 py-2 text-base"><span>{bookingDate ? formatDateWithWeekdayZh(bookingDate) : "讀取日期中…"} {slotTime}</span>{staffName && <span className="text-earth-600">{staffName}</span>}</div>
    <section className="min-h-0 overflow-y-auto p-4"><h3 className="text-base font-semibold text-earth-900">到店人員</h3><p role={error ? "alert" : "status"} className="py-3 text-sm text-earth-600">{error ?? "正在讀取收款資料…"}</p></section>
  </div>;
}
