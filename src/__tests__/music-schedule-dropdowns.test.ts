// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({slots:vi.fn(),create:vi.fn()}));
vi.mock('@/server/actions/course-slot-matches',()=>({getMusicSlotMatches:m.slots}));
vi.mock('@/server/actions/course',()=>({createCourseSchedule:m.create}));
import {MusicScheduleWizard} from '@/app/(dashboard)/dashboard/courses/music-schedule-wizard';
let host:HTMLDivElement,root:Root;
const props={templates:[{id:'a',name:'吉他團班',durationMinutes:60,capacity:6,defaultRoomId:null},{id:'b',name:'鋼琴個別',durationMinutes:60,capacity:1,defaultRoomId:null}],rooms:[{id:'small',name:'小教室',capacity:1},{id:'large',name:'大教室',capacity:8}],coaches:[{id:'teacher',displayName:'老師甲'},{id:'other',displayName:'老師乙'}],initialDate:'2026-10-20',requestKey:'test',onCreated:vi.fn()};
const select=(name:string)=>host.querySelector<HTMLSelectElement>(`select[aria-label="${name}"]`)!;
async function change(name:string,value:string){await act(async()=>{select(name).value=value;select(name).dispatchEvent(new Event('change',{bubbles:true}));});}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();host=document.createElement('div');root=createRoot(host);m.create.mockResolvedValue({success:true,data:{sessionId:'new'}});});
afterEach(async()=>{await act(async()=>root.unmount());});
it('filters locally, auto selects a sole teacher and suitable room, submits actual selections',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'small',coachIds:['teacher']},{time:'09:00',roomId:'large',coachIds:['teacher']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,props)));
 await change('上課時間','09:00');
 expect(select('老師').value).toBe('teacher');expect(select('教室').value).toBe('large');expect(select('教室').textContent).not.toContain('小教室');expect(m.slots).toHaveBeenCalledTimes(1);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='建立課程，接著選學員')!.click());
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({templateId:'a',date:'2026-10-20',time:'09:00',coachId:'teacher',roomId:'large'}));
});
it('clears dependent selections when time changes and does not fetch again',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'large',coachIds:['teacher']},{time:'10:00',roomId:'large',coachIds:['teacher','other']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,props)));await change('上課時間','09:00');await change('上課時間','10:00');
 expect(select('老師').value).toBe('');expect(select('教室').value).toBe('');expect(select('教室').disabled).toBe(false);expect(m.slots).toHaveBeenCalledTimes(1);
});
it('ignores an old item response arriving after the current one',async()=>{
 let resolveOld!:(value:unknown)=>void;
 m.slots.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce({success:true,data:[{time:'11:00',roomId:'small',coachIds:['other']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,props)));await change('教學項目（大類）','b');
 await act(async()=>resolveOld({success:true,data:[{time:'09:00',roomId:'large',coachIds:['teacher']}]}));
 expect(select('上課時間').textContent).toContain('11:00');expect(select('上課時間').textContent).not.toContain('09:00');
});

it('keeps the clicked classroom and time and only offers teachers available there',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'large',coachIds:['other']},{time:'09:00',roomId:'small',coachIds:['teacher']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,initialTime:'09:00',initialRoomId:'large'})));
 expect(select('上課時間').value).toBe('09:00');expect(select('教室').value).toBe('large');expect(select('老師').value).toBe('other');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='建立課程，接著選學員')!.click());
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({time:'09:00',roomId:'large',coachId:'other'}));
});
it('does not silently substitute another room when the clicked room is unavailable',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'small',coachIds:['teacher']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,initialTime:'09:00',initialRoomId:'large'})));
 expect(select('教室').value).toBe('large');expect(host.textContent).toContain('沒有符合資格');
 expect([...host.querySelectorAll('button')].some(b=>b.textContent==='建立課程，接著選學員')).toBe(false);
});
it('filters teaching items by type and preserves the calendar location while switching types',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'large',coachIds:['teacher']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,templates:props.templates.map((t,i)=>({...t,classType:i?'PRIVATE':'GROUP'})),initialTime:'09:00',initialRoomId:'large'})));
 expect(select('教學項目（大類）').textContent).not.toContain('鋼琴個別');
 await change('課程型態','PRIVATE');
 expect(select('教學項目（大類）').value).toBe('b');expect(select('上課時間').value).toBe('09:00');expect(select('教室').value).toBe('large');
 expect(host.querySelector('.bg-blue-600')).not.toBeNull();
});

it('lets the user choose among available teachers without a false no-availability warning',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'large',coachIds:['teacher','other']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,initialTime:'09:00',initialRoomId:'large'})));
 expect(host.textContent).not.toContain('沒有符合資格');
 await change('老師','other');expect(select('教室').value).toBe('large');
});

it('switches arrangement without resetting the chosen classroom, time, or teacher',async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:'09:00',roomId:'large',coachIds:['teacher']}]});
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,initialTime:'09:00',initialRoomId:'large'})));
 await change('安排方式','OPEN');
 expect(select('上課時間').value).toBe('09:00');expect(select('教室').value).toBe('large');expect(select('老師').value).toBe('teacher');
 expect(m.slots).toHaveBeenCalledTimes(1);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='建立開放選課課程')!.click());
 expect(props.onCreated).toHaveBeenCalledWith('new','2026-10-20','OPEN');
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({bookingAudience:'OPEN'}));
});
