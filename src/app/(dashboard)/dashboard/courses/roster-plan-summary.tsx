"use client";
import type {NativeRosterBooking} from './roster-source';
export function RosterPlanSummary({booking,onOpen,onPreload}:{booking:NativeRosterBooking;onOpen:()=>void;onPreload?:()=>void}){
 if(booking.bookingKind==='TRIAL'||booking.bookingKind==='TEACHER_MAKEUP')return null;
 if(!booking.cardId){
  const balances=booking.sportsBalance?.byUnit??(booking.sportsBalance?[booking.sportsBalance]:[]);
  return <button type="button" className="min-h-11 w-full min-w-0 py-1 text-left text-sm text-primary-800" aria-label={`${booking.customerName} 適用方案合計，查看方案`} onPointerEnter={onPreload} onFocus={onPreload} onTouchStart={onPreload} onClick={onOpen}>
   {balances.length?balances.map(b=><span className="block" key={b.unit}><strong className="block">可用 {b.available} {b.unit==='SESSION'?'堂':'點'}</strong>{b.remaining!==b.available&&<span className="block text-earth-600">剩餘 {b.remaining} {b.unit==='SESSION'?'堂':'點'}</span>}</span>):<span className="block">{booking.sportsBalance&&'reviewRequired' in booking.sportsBalance&&booking.sportsBalance.reviewRequired?'方案科目待核對':'無可用的同科目方案'}</span>}
   {balances.length>0&&balances.every(b=>Number.isFinite(b.cost)&&b.available<b.cost)&&<span className="block text-amber-800">額度不足</span>}
  </button>;
 }
 const unit=booking.unit==='SESSION'?'堂':'點';
 return <button type="button" className="min-h-11 w-full min-w-0 py-1 text-left text-sm text-primary-800" aria-label={`${booking.customerName} · ${booking.planName} 上課紀錄`} onPointerEnter={onPreload} onFocus={onPreload} onTouchStart={onPreload} onClick={onOpen}>
  <strong className="block">剩 {booking.cardRemaining??'—'} {unit}</strong><span className="block truncate underline">{booking.planName}</span>
 </button>;
}
