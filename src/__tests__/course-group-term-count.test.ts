import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({many:vi.fn(),count:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseSession:{findMany:db.many,count:db.count}}}));
import {withCourseCalendarRead} from '@/server/services/course-calendar-read-scope';
import {readCourseGroupTermCount} from '@/server/queries/course-group-term-count';
import {readCourseSessionDetail} from '@/server/queries/course-session-detail';
const session=(id:string,requestKey='series',requestIndex=0,lessons:number|null=8,classType:string|null='GROUP')=>({id,requestKey,templateId:'item',requestIndex,template:{classType,musicTermLessons:lessons}});
beforeEach(()=>vi.resetAllMocks());

it('leaves private, unset and zero-length group periods without a count query',async()=>{
 for(const row of [undefined,session('private','series',0,4,'PRIVATE'),session('unclassified','series',0,4,null),session('unset','series',0,null),session('zero','series',0,0)]){
  expect(await readCourseGroupTermCount('store','selected',row)).toBe(0);
 }
 expect(db.count).not.toHaveBeenCalled();expect(db.many).not.toHaveBeenCalled();
});
it('keeps ordinary reads live and preserves whole-period bounds and cancelledAt filtering',async()=>{
 db.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
 const row=session('one','series',7,4);
 expect(await readCourseGroupTermCount('store','one',row)).toBe(3);
 expect(await readCourseGroupTermCount('store','one',row)).toBe(2);
 expect(db.count).toHaveBeenCalledTimes(2);
 expect(db.count).toHaveBeenLastCalledWith({where:{storeId:'store',cancelledAt:null,requestKey:'series',templateId:'item',requestIndex:{gte:4,lt:8}}});
});
it('replaces 26 distinct period counts with one batch while reusing the existing calendar metadata read',async()=>{
 const sessions=Array.from({length:26},(_,n)=>session(`s${n}`,`series${n}`,4));
 sessions.push(session('same-period','series0',5));
 db.many.mockImplementation(async q=>q.select.id?sessions:sessions.slice(0,26).flatMap(s=>Array.from({length:8},(_,requestIndex)=>({requestKey:s.requestKey,templateId:'item',requestIndex}))));
 await withCourseCalendarRead('store',sessions.map(s=>s.id),async()=>{
  await readCourseSessionDetail('store',sessions[0].id);
  expect(await Promise.all(sessions.map(s=>readCourseGroupTermCount('store',s.id,s)))).toEqual(sessions.map(()=>8));
 });
 expect(db.count).not.toHaveBeenCalled();
 expect(db.many).toHaveBeenCalledTimes(2);
 const batch=db.many.mock.calls.find(([q])=>!q.select.id)![0];
 expect(batch.where.storeId).toBe('store');expect(batch.where.cancelledAt).toBeNull();
 expect(batch.where.OR).toHaveLength(26);expect(batch.select).toEqual({requestKey:true,templateId:true,requestIndex:true});
});
it('separates adjacent terms, templates and series and includes lessons outside the visible month',async()=>{
 const sessions=[session('late','series',7,4),session('next','series',8,4),{...session('other-template','series',7,4),templateId:'other'},session('other-series','another',7,4)];
 const rows=[4,5,7,8,9].map(requestIndex=>({requestKey:'series',templateId:'item',requestIndex}));
 rows.push({requestKey:'series',templateId:'other',requestIndex:7},{requestKey:'another',templateId:'item',requestIndex:7});
 db.many.mockImplementation(async q=>q.select.id?sessions:rows);
 const values=await withCourseCalendarRead('store',sessions.map(s=>s.id),()=>Promise.all(sessions.map(s=>readCourseGroupTermCount('store',s.id,s))));
 expect(values).toEqual([3,2,1,1]);
 const where=db.many.mock.calls.find(([q])=>!q.select.id)![0].where;
 expect(where).not.toHaveProperty('startsAt');expect(where).not.toHaveProperty('id');
 expect(where.OR).toContainEqual({requestKey:'series',templateId:'item',requestIndex:{gte:4,lt:8}});
});
it('does not reuse a store or session outside the current calendar, or retain counts for the next read',async()=>{
 const row=session('one');db.count.mockResolvedValue(6);
 db.many.mockImplementation(async q=>q.select.id?[row]:[{requestKey:'series',templateId:'item',requestIndex:0}]);
 await withCourseCalendarRead('store',['one'],async()=>{
  expect(await readCourseGroupTermCount('other','one',row)).toBe(6);
  expect(await readCourseGroupTermCount('store','unselected',row)).toBe(6);
  expect(await readCourseGroupTermCount('store','one',row)).toBe(1);
 });
 db.many.mockImplementation(async q=>q.select.id?[row]:[]);
 expect(await withCourseCalendarRead('store',['one'],()=>readCourseGroupTermCount('store','one',row))).toBe(0);
 expect(db.count).toHaveBeenCalledTimes(2);expect(db.many).toHaveBeenCalledTimes(4);
});
it('rejects all waiting callers on batch failure and retries in a new calendar read',async()=>{
 const row=session('one');let unavailable=true;
 db.many.mockImplementation(async q=>{if(q.select.id)return [row];if(unavailable)throw new Error('unavailable');return [];});
 const values=await withCourseCalendarRead('store',['one'],()=>Promise.allSettled([1,2].map(()=>readCourseGroupTermCount('store','one',row))));
 expect(values.every(v=>v.status==='rejected')).toBe(true);expect(db.many).toHaveBeenCalledTimes(2);
 unavailable=false;
 expect(await withCourseCalendarRead('store',['one'],()=>readCourseGroupTermCount('store','one',row))).toBe(0);
 expect(db.many).toHaveBeenCalledTimes(4);
});
