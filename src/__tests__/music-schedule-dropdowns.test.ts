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
it('restores four types, assigned/open enrollment, and weekly/biweekly colors while retaining calendar position',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div'),root=createRoot(host);
 const props={templates:[{id:'guitar',name:'吉他',durationMinutes:60,capacity:4,defaultRoomId:null,musicSubjectId:'guitar',musicSubject:{id:'guitar',name:'吉他',isActive:true}}],rooms:[{id:'room',name:'教室A'}],coaches:[],initialDate:'2026-10-20',seed:{time:'09:00',roomId:'room'},requestKey:'test',onCreated:vi.fn(),onArrangementChange:vi.fn(),initialScheduleKind:'FIXED' as const};
 try {
 await act(async()=>root.render(React.createElement(MusicScheduleWizard,props)));
 expect([...host.querySelectorAll('select[aria-label="安排類型"] option')].map(o=>o.textContent)).toEqual(['固定課','單次課','體驗課','空間租借']);
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!.value).toBe('09:00');
 expect(host.querySelector<HTMLSelectElement>('[aria-label="排課教室"]')!.value).toBe('room');
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
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!.value).toBe('09:00');
 }finally{await act(async()=>root.unmount());}
});
