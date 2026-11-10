import type {NativeRosterBooking} from './roster-source';
/** Display an exact known unit; an unbound booking must not invent a debit. */
export function rosterLessonCost(booking:NativeRosterBooking):string{
 if(booking.bookingKind==='TRIAL')return '—';
 if(booking.bookingKind==='TEACHER_MAKEUP')return '免費券';
 if(booking.bookingKind==='UNPAID'){
  const balances=booking.sportsBalance?.byUnit??(booking.sportsBalance?[booking.sportsBalance]:[]);
  return balances.length===1&&balances[0].unit==='SESSION'&&balances[0].cost===1&&balances[0].available>=1?'1 堂':'—';
 }
 return `${booking.pointCost} ${booking.unit==='SESSION'?'堂':'點'}`;
}
