import {expect,it} from 'vitest';
import {preparedRoster} from './fixtures/prepared-roster';
import {rosterLessonCost} from '@/app/(dashboard)/dashboard/courses/roster-lesson-cost';
it('shows exact native booked units and does not use an ambiguous deduction-time label',()=>{
 const b=preparedRoster().roster[0];b.pointCost=1;b.unit='SESSION';expect(rosterLessonCost(b)).toBe('1 堂');
 b.pointCost=2;b.unit='POINT';expect(rosterLessonCost(b)).toBe('2 點');
});
it('shows one session for an eligible session-only unbound booking but never guesses across units or costs',()=>{
 const b=preparedRoster().roster[0];b.bookingKind='UNPAID';b.cardId=null;
 const balance={remaining:10,available:10,cost:1,unit:'SESSION',planName:'十堂'};
 const balances=[balance];b.sportsBalance={...balance,byUnit:balances};expect(rosterLessonCost(b)).toBe('1 堂');
 balances.push({...balance,unit:'POINT',cost:2});expect(rosterLessonCost(b)).toBe('—');
 b.sportsBalance=null;expect(rosterLessonCost(b)).toBe('—');
});
