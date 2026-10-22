import {expect,it} from 'vitest';
import {memberPartyInput,halfHourRule,cardAllowsRecipient} from '@/lib/beauty/member-booking';
import {memberAppointmentGroups,beautyServiceTime} from '@/lib/beauty/portal-groups';
it('strips caller-supplied identities and trial switches and requires half-hour starts',()=>{
 const d={requestKey:crypto.randomUUID(),date:'2026-10-24',time:'09:30',contactName:'spoof',phone:'0900000000',isTrial:true,people:[{serviceId:'s',name:'spoof',phone:'0900000000',customerId:'foreign',pendingIdentity:true}]};
 const parsed=memberPartyInput.parse(d);expect(parsed).not.toHaveProperty('contactName');expect(parsed).not.toHaveProperty('isTrial');expect(parsed.people[0]).not.toHaveProperty('customerId');expect(()=>memberPartyInput.parse({...d,time:'09:15'})).toThrow();
});
it('aligns the member grid to half hours without widening opening periods or lunch breaks',()=>{
 const original={slotInterval:15,periods:[{openTime:'09:05',closeTime:'12:00',slotInterval:15},{openTime:'13:10',closeTime:'18:00',slotInterval:60}]};const rule=halfHourRule(original);expect(rule.periods.map(p=>[p.openTime,p.closeTime,p.slotInterval])).toEqual([['09:30','12:00',30],['13:30','18:00',30]]);expect(original.periods[0].openTime).toBe('09:05');
});
it('sorts upcoming items by their next pending time, splitting dates, and history newest first',()=>{
 const item=(id:string,groupId:string,day:string,status='RESERVED')=>({id,groupId,status,startsAt:day+'T01:00:00Z',endsAt:day+'T02:00:00Z'});const rows=[item('late','a','2026-10-30'),item('early','b','2026-10-24'),item('past','a','2026-10-20','COMPLETED'),item('middle','a','2026-10-27')];const now=Date.parse('2026-10-21T00:00Z');expect(memberAppointmentGroups(rows,false,now).map(g=>g.items[0].id)).toEqual(['early','middle','late']);expect(memberAppointmentGroups([...rows,item('recent','c','2026-10-21','CANCELLED')],true,now).map(g=>g.items[0].id)).toEqual(['recent','past']);
});
it('shows a repeated date only when a service ends after midnight and denies foreign sponsors',()=>{
 expect(beautyServiceTime('2026-10-24T01:00Z','2026-10-24T02:15Z')).toBe('09:00–10:15');expect(beautyServiceTime('2026-10-24T15:30Z','2026-10-24T16:30Z')).toBe('23:30–2026-10-25 00:30');expect(cardAllowsRecipient({allowShared:true,memberIds:['owner']},null,'other')).toBe(false);
});
