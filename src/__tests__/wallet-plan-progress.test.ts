import {describe,it,expect} from 'vitest';
import {walletPlanProgress} from '@/lib/wallet-plan-progress';
const day=(d:string)=>new Date(`${d}T00:00:00+08:00`);
const row=(id:string,status='AVAILABLE')=>({id,status,completedAt:null as Date|null,voidedAt:null as Date|null,booking:null as {bookingDate:Date}|null});
describe('steam plan date grid',()=>{
 it('keeps purchased cells blank while a reservation holds balance',()=>{
  const result=walletPlanProgress({totalSessions:3,remainingSessions:3,sessions:[row('a'),row('b','RESERVED'),row('c')]});
  expect(result).toEqual({available:true,total:3,completed:[],voided:[]});
 });
 it('uses service date for visits, actual backfill date, and void operation date',()=>{
  const result=walletPlanProgress({totalSessions:4,remainingSessions:1,sessions:[{...row('visit','COMPLETED'),completedAt:day('2026-11-11'),booking:{bookingDate:day('2026-11-02')}},{...row('backfill','BACKFILLED'),completedAt:day('2026-11-03')},{...row('void','VOIDED'),voidedAt:day('2026-11-04')},row('reserved','RESERVED')]});
  expect(result.available&&result.completed.map(r=>r.date)).toEqual([day('2026-11-02').toISOString(),day('2026-11-03').toISOString()]);
  expect(result.available&&result.voided[0].date).toBe(day('2026-11-04').toISOString());
 });
 it('clears reversed use instead of retaining a stale date',()=>{
  expect(walletPlanProgress({totalSessions:1,remainingSessions:1,sessions:[{...row('a'),completedAt:day('2026-11-01')}]})).toEqual({available:true,total:1,completed:[],voided:[]});
 });
 it.each(['missing-rows','missing-date','balance-mismatch'])('refuses misleading progress for %s',kind=>{
  const sessions=kind==='missing-rows'?[]:kind==='missing-date'?[row('a','BACKFILLED')]:[{...row('a','COMPLETED'),completedAt:day('2026-11-01')}];
  expect(walletPlanProgress({totalSessions:1,remainingSessions:kind==='balance-mismatch'?1:0,sessions}).available).toBe(false);
 });
});
