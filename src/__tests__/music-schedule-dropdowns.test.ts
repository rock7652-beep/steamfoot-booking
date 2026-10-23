// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
vi.mock('@/server/actions/course-slot-matches',()=>({getMusicSlotMatches:vi.fn().mockResolvedValue({success:true,data:[]})}));
vi.mock('@/server/actions/course',()=>({createCourseSchedule:vi.fn()}));
vi.mock('@/server/actions/course-schedule-check',()=>({inspectCourseSchedule:vi.fn()}));
vi.mock('@/server/actions/music-schedule-rooms',()=>({getMusicScheduleRooms:vi.fn()}));
vi.mock('@/server/actions/course-schedule-enrollment',()=>({loadCourseScheduleEnrollmentOptions:vi.fn().mockResolvedValue({success:true,cards:[],customers:[]}),createScheduleCustomer:vi.fn()}));
import {MusicScheduleWizard} from '@/app/(dashboard)/dashboard/courses/music-schedule-wizard';
import {getMusicSlotMatches} from '@/server/actions/course-slot-matches';
import {loadCourseScheduleEnrollmentOptions} from '@/server/actions/course-schedule-enrollment';
it('restores four types, assigned/open enrollment, and weekly/biweekly colors while retaining calendar position',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div'),root=createRoot(host);
 const props={templates:[{id:'guitar',name:'吉他',durationMinutes:60,capacity:4,defaultRoomId:null,musicSubjectId:'guitar',musicSubject:{id:'guitar',name:'吉他',isActive:true}}],rooms:[{id:'room',name:'教室A'}],coaches:[],initialDate:'2026-10-20',seed:{time:'09:00',roomId:'room'},requestKey:'test',onCreated:vi.fn(),onArrangementChange:vi.fn(),initialScheduleKind:'FIXED' as const};
 try {
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,props)));
 expect([...host.querySelectorAll('select[aria-label="安排類型"] option')].map(o=>o.textContent)).toEqual(['固定課','單次課','體驗課','空間租借']);
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!.value).toBe('09:00');
 expect(host.querySelector<HTMLSelectElement>('[aria-label="排課教室"]')!.value).toBe('room');
 expect(host.querySelector<HTMLInputElement>('[aria-label="時長"]')!.value).toBe('50');
 expect(host.querySelector('.border-blue-500')).not.toBeNull();
 const frequency=host.querySelector<HTMLSelectElement>('[aria-label="固定課程頻率"]')!;
 await act(async()=>{frequency.value='BIWEEKLY';frequency.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('.border-violet-500')).not.toBeNull();
 expect(host.textContent).toContain('指定學員');expect(host.textContent).toContain('開放選課');
 const radios=host.querySelectorAll<HTMLInputElement>('input[type="radio"]');
 await act(async()=>radios[1].click());
 const course=host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!;
 await act(async()=>{course.value='guitar';course.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.textContent).toContain('名額');
 expect(host.querySelector<HTMLInputElement>('[aria-label="時長"]')!.value).toBe('60');
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!.value).toBe('09:00');
 }finally{await act(async()=>root.unmount());}
});
it('shows the calendar teacher before course selection and preserves assigned learners through course changes',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(getMusicSlotMatches).mockImplementation(async input=>({success:true,data:[{time:'09:00',roomId:'room',coachIds:(input as {templateId:string}).templateId==='guitar'?['wu','other']:['other']}],unavailable:[],blocker:undefined}));
 vi.mocked(loadCourseScheduleEnrollmentOptions).mockResolvedValue({success:true,cards:[],customers:[{id:'student',name:'小明',phone:'0900000000'}],trialSettings:{enabled:false,price:0}});
 const host=document.createElement('div'),root=createRoot(host);
 const props={templates:['guitar','drums'].map(id=>({id,name:id==='guitar'?'吉他':'爵士鼓',durationMinutes:60,capacity:4,defaultRoomId:null,musicSubjectId:id,musicSubject:{id,name:id,isActive:true}})),rooms:[{id:'room',name:'01'}],coaches:[{id:'wu',displayName:'吳興儒'},{id:'other',displayName:'其他老師'}],initialDate:'2026-10-22',seed:{time:'09:00',roomId:'room',coachId:'wu'},requestKey:'teacher-seed',onCreated:vi.fn()};
 try {
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,props)));
 const teacher=()=>host.querySelector<HTMLSelectElement>('[aria-label="授課教師"]')!;
 expect(teacher().value).toBe('wu');expect(teacher().selectedOptions[0].textContent).toBe('吳興儒');
 expect(teacher().disabled).toBe(true);
 const search=host.querySelector<HTMLInputElement>('[aria-label="搜尋排課學員"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'小明');search.dispatchEvent(new Event('input',{bubbles:true}));});
 const add=Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('小明'))!;
 await act(async()=>add.click());
 const choose=async(value:string)=>act(async()=>{const course=host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!;course.value=value;course.dispatchEvent(new Event('change',{bubbles:true}));});
 await choose('guitar');
 expect(teacher().value).toBe('wu');expect(teacher().disabled).toBe(false);
 expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain('小明');
 expect(host.querySelector('[aria-label="搜尋排課學員"]')).not.toBeNull();
 await choose('drums');
 expect(teacher().value).toBe('wu');
 expect(teacher().selectedOptions[0].disabled).toBe(true);
 expect(teacher().selectedOptions[0].textContent).toContain('此時段不可安排');
 expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain('小明');
 expect(host.querySelector('[aria-label="搜尋排課學員"]')).not.toBeNull();
 await act(async()=>{const room=host.querySelector<HTMLSelectElement>('[aria-label="排課教室"]')!;room.value='';room.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('[aria-label="排課學員"]')!.textContent).toContain('小明');
 expect(host.querySelector('[aria-label="搜尋排課學員"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());}
});
