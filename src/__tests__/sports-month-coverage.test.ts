import {expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {sportsMonthHasMissingOccurrences} from '@/server/services/sports-permanent-series';
import type {FixedCourseSeries} from '@/lib/course-series';
const series:FixedCourseSeries={requestKey:'weekly',startsAt:new Date('2026-11-02T01:00:00Z'),endsAt:new Date('2026-11-02T02:00:00Z'),roomId:'r',coachId:'c',frequency:'WEEKLY',excludedDates:[],untilDate:null,cancelledAt:null};
function reader(rows:{requestKey:string;requestIndex:number}[]){const findMany=vi.fn().mockResolvedValue(rows);return {findMany,tx:{courseSession:{findMany}} as unknown as Prisma.TransactionClient};}
it('checks 100 series in one store-scoped read, including moved/cancelled occurrence indexes',async()=>{
 const rules=Array.from({length:100},(_,i)=>({...series,requestKey:'series-'+i})),rows=rules.flatMap(s=>[0,1,2,3,4].map(requestIndex=>({requestKey:s.requestKey,requestIndex})));
 const {tx,findMany}=reader(rows);expect(await sportsMonthHasMissingOccurrences(tx,'store',rules,'2026-11-01','2026-11-30')).toBe(false);
 expect(findMany).toHaveBeenCalledOnce();const query=findMany.mock.calls[0][0];expect(query.where.storeId).toBe('store');expect(query.where.OR).toHaveLength(100);expect(query.where.OR[0]).toEqual({requestKey:'series-0',requestIndex:{in:[0,1,2,3,4]}});expect(query.where).not.toHaveProperty('cancelledAt');expect(query.where).not.toHaveProperty('startsAt');
});
it('detects a missing occurrence and leaves materialization to the existing caller',async()=>{
 const {tx}=reader([{requestKey:'weekly',requestIndex:0}]);expect(await sportsMonthHasMissingOccurrences(tx,'store',[series],'2026-11-01','2026-11-30')).toBe(true);
});
it('preserves fortnight cadence, exclusions, stop dates and cancelled series without any queries for empty coverage',async()=>{
 const {tx,findMany}=reader([{requestKey:'weekly',requestIndex:0},{requestKey:'weekly',requestIndex:2}]);
 expect(await sportsMonthHasMissingOccurrences(tx,'store',[{...series,frequency:'BIWEEKLY',excludedDates:['2026-11-16']}],'2026-11-01','2026-11-30')).toBe(false);
 expect(findMany.mock.calls[0][0].where.OR[0].requestIndex.in).toEqual([0,2]);
 findMany.mockClear();expect(await sportsMonthHasMissingOccurrences(tx,'store',[{...series,cancelledAt:new Date()}],'2026-11-01','2026-11-30')).toBe(false);expect(findMany).not.toHaveBeenCalled();
 expect(await sportsMonthHasMissingOccurrences(tx,'store',[{...series,untilDate:new Date('2026-10-31T00:00Z')}],'2026-11-01','2026-11-30')).toBe(false);expect(findMany).not.toHaveBeenCalled();
});
it('bounds large-store queries and retains exact row-count semantics',async()=>{
 const {tx,findMany}=reader([]);findMany.mockImplementation(async({where})=>where.OR.map((row:{requestKey:string})=>({requestKey:row.requestKey,requestIndex:1})));
 expect(await sportsMonthHasMissingOccurrences(tx,'store',Array.from({length:251},(_,i)=>({...series,requestKey:'series-'+i})),'2026-11-09','2026-11-09')).toBe(false);expect(findMany).toHaveBeenCalledTimes(2);
 const duplicate=reader([{requestKey:'weekly',requestIndex:1},{requestKey:'weekly',requestIndex:1}]);expect(await sportsMonthHasMissingOccurrences(duplicate.tx,'store',[series],'2026-11-09','2026-11-09')).toBe(true);
});
