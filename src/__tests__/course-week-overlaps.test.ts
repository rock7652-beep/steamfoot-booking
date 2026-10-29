import {expect,it} from 'vitest';
import {courseWeekOverlaps} from '@/lib/course-week-overlaps';
const row=(id:string,start:string,end:string,date='2026-10-29')=>({id,startsAt:`${date}T${start}:00+08:00`,endsAt:`${date}T${end}:00+08:00`});
it('combines simultaneous courses deterministically without mutating the source',()=>{
 const rows=[row('b','14:00','15:00'),row('a','14:00','15:00')];
 const groups=courseWeekOverlaps(rows);
 expect(groups).toHaveLength(1);expect(groups[0].sessions.map(s=>s.id)).toEqual(['a','b']);expect(rows.map(s=>s.id)).toEqual(['b','a']);
});
it('keeps individual start times and spans a connected overlap chain',()=>{
 const rows=[row('a','14:00','15:00'),row('b','14:30','15:30'),row('c','15:15','16:00')];
 const [group]=courseWeekOverlaps(rows);expect(group.startsAt).toBe(rows[0].startsAt);expect(group.endsAt).toBe(rows[2].endsAt);expect(group.sessions).toEqual(rows);
});
it('does not group adjacent classes or different Taiwan dates',()=>{
 expect(courseWeekOverlaps([row('a','14:00','15:00'),row('b','15:00','16:00'),row('c','14:00','15:00','2026-10-30')])).toHaveLength(3);
});
it('does not mistake cleanup overlap for two concurrent services',()=>{
 const a={...row('a','14:00','15:00'),occupiedEndsAt:'2026-10-29T15:15:00+08:00'};
 expect(courseWeekOverlaps([a,row('b','15:00','16:00')])).toHaveLength(2);
});
it('compares instants consistently for differently serialized offsets and excludes no valid member from a large group',()=>{
 const rows=Array.from({length:30},(_,i)=>({...row(String(i).padStart(2,'0'),'14:00','15:00'),...(i===0?{startsAt:'2026-10-29T06:00:00Z'}:{})}));
 expect(courseWeekOverlaps(rows)[0].sessions).toHaveLength(30);expect(courseWeekOverlaps([])).toEqual([]);
});
