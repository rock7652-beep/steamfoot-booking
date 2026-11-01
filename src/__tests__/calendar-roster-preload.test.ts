import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {collectCalendarRosters} from '@/server/services/calendar-roster-preload';

describe('calendar-owned complete rosters',()=>{
 it('waits for every unique session and bounds concurrent reads',async()=>{
  let active=0,max=0;const finished:string[]=[];
  const read=vi.fn(async(id:string)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,4));active--;finished.push(id);return {success:true as const,data:{id,available:7}};});
  const data=await collectCalendarRosters(['a','b','a','c','d'],read);
  expect(max).toBe(2);expect(read).toHaveBeenCalledTimes(4);expect(finished).toHaveLength(4);
  expect(Object.keys(data)).toEqual(['a','b','c','d']);expect(data.c).toEqual({id:'c',available:7});
 });
 it('rejects instead of handing a partially populated calendar to the client',async()=>{
  const read=vi.fn(async(id:string)=>id==='b'?{success:false as const,error:'權限已變更'}:{success:true as const,data:id});
  await expect(collectCalendarRosters(['a','b','c'],read)).rejects.toThrow('權限已變更');
 });
 it('does not silently truncate an oversized calendar or read any of it',async()=>{
  const read=vi.fn();await expect(collectCalendarRosters(Array.from({length:1001},(_,i)=>String(i)),read)).rejects.toThrow('上限');expect(read).not.toHaveBeenCalled();
 });
 it('does not query empty calendars',async()=>{const read=vi.fn();expect(await collectCalendarRosters([],read)).toEqual({});expect(read).not.toHaveBeenCalled();});
});
