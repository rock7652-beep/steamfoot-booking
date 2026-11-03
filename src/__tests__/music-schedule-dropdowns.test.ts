// @vitest-environment jsdom
vi.mock('@/server/actions/course-charge',()=>({loadCourseChargeOptions:vi.fn().mockResolvedValue({success:true,rows:[],enabled:true,defaultTrialPrice:499})}));
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
import {inspectCourseSchedule} from '@/server/actions/course-schedule-check';
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

it('keeps the same teaching item when switching to trial and back, with position and participant drafts intact',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(getMusicSlotMatches).mockResolvedValue({success:true,data:[{time:'09:00',roomId:'room',coachIds:['wu']}],unavailable:[],blocker:undefined});
 vi.mocked(inspectCourseSchedule).mockResolvedValue({success:true,issues:[]});
 vi.mocked(loadCourseScheduleEnrollmentOptions).mockResolvedValue({success:true,cards:[],customers:[],trialSettings:{enabled:true,price:499}});
 const subjects=[{id:'experience',name:'體驗',isActive:true},{id:'guitar',name:'吉他',isActive:true}];
 const props={subjects,templates:subjects.map(s=>({id:`version-${s.id}`,name:s.name,musicSubjectId:s.id,musicSubject:s,durationMinutes:25,capacity:1,defaultRoomId:null})),rooms:[{id:'room',name:'01'}],coaches:[{id:'wu',displayName:'教師甲'}],initialDate:'2026-10-24',seed:{time:'09:00',roomId:'room',coachId:'wu'},initialLearner:{customerId:'student',cardId:'',name:'原學員'},requestKey:'switch-test',onCreated:vi.fn()};
 function Harness(){const [kind,setKind]=React.useState<'fixed'|'single'|'trial'|'rental'>('single');return React.createElement(MusicScheduleWizard,{...props,isTrial:kind==='trial',initialScheduleKind:kind==='fixed'?'FIXED':'SINGLE',onArrangementChange:setKind});}
 const host=document.createElement('div'),root=createRoot(host);
 const select=async(label:string,value:string)=>act(async()=>{const input=host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));});
 const course=()=>host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!.value;
 try{
  await act(async()=>root.render(React.createElement(Harness)));
  await select('課程','teaching:experience');await select('安排類型','trial');
  expect(course()).toBe('teaching-trial:experience');
  expect(vi.mocked(getMusicSlotMatches)).toHaveBeenLastCalledWith(expect.objectContaining({templateId:'teaching-trial:experience'}));
  const name=host.querySelector<HTMLInputElement>('[aria-label="體驗者 1 姓名"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'體驗草稿');name.dispatchEvent(new Event('input',{bubbles:true}));});
  await select('課程','teaching-trial:guitar');await select('安排類型','single');
  expect(course()).toBe('teaching:guitar');expect(host.querySelector('[aria-label="排課學員"]')?.textContent).toContain('原學員');
  await select('安排類型','fixed');expect(course()).toBe('teaching:guitar');
  await select('安排類型','trial');expect(course()).toBe('teaching-trial:guitar');
  expect(host.querySelector<HTMLInputElement>('[aria-label="體驗者 1 姓名"]')!.value).toBe('體驗草稿');
  expect(host.querySelector<HTMLInputElement>('[aria-label="排課日期"]')!.value).toBe('2026-10-24');
  expect(host.querySelector<HTMLInputElement>('[aria-label="排課時間"]')!.value).toBe('09:00');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="排課教室"]')!.value).toBe('room');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="授課教師"]')!.value).toBe('wu');
  expect(host.querySelector<HTMLInputElement>('[aria-label="時長"]')!.value).toBe('25');
 }finally{await act(async()=>root.unmount());}
});

it('maps legacy templates by subject and never silently selects another subject when no counterpart exists',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const subject={id:'guitar',name:'吉他',isActive:true},other={id:'drums',name:'爵士鼓',isActive:true};
 const regular={id:'regular',name:'吉他',musicSubjectId:'guitar',musicSubject:subject,durationMinutes:50,capacity:1,defaultRoomId:null};
 const trial={...regular,id:'trial',musicTrialMode:'PAID'};
 const props={templates:[regular,trial],rooms:[],coaches:[],initialDate:'2026-10-24',requestKey:'legacy-switch',initialTemplateId:'regular',onCreated:vi.fn()};
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,isTrial:true})));
  expect(host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!.value).toBe('trial');
  await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,isTrial:true,templates:[regular,{...trial,id:'other-trial',musicSubjectId:'drums',musicSubject:other}]})));
  expect(host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!.value).toBe('');
  expect(host.textContent).toContain('此教學項目目前沒有可安排的體驗課');
  await act(async()=>root.render(React.createElement(MusicScheduleWizard,{...props,isTrial:false})));
  expect(host.querySelector<HTMLSelectElement>('[aria-label="課程"]')!.value).toBe('regular');
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

it('keeps save failures beside the submit button outside the scrolling fields and preserves the draft',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(getMusicSlotMatches).mockResolvedValue({success:true,data:[{time:'18:00',roomId:'room',coachIds:['wu']}],unavailable:[],blocker:undefined});
 vi.mocked(inspectCourseSchedule).mockResolvedValue({success:true,issues:[]});
 vi.mocked(loadCourseScheduleEnrollmentOptions).mockResolvedValue({success:true,cards:[],customers:[{id:'student',name:'測試學員',phone:'0900000000'}],trialSettings:{enabled:false,price:0}});
 const {createCourseSchedule}=await import('@/server/actions/course');
 vi.mocked(createCourseSchedule).mockResolvedValue({success:false,error:'方案期別待確認，請先核對各期堂數',conflicts:[]});
 const created=vi.fn(),host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(React.createElement(MusicScheduleWizard,{templates:[{id:'guitar',name:'吉他',durationMinutes:50,capacity:1,defaultRoomId:null,musicSubjectId:'guitar',musicSubject:{id:'guitar',name:'吉他',isActive:true}}],rooms:[{id:'room',name:'01'}],coaches:[{id:'wu',displayName:'教師'}],initialDate:'2026-10-27',seed:{time:'18:00',roomId:'room',coachId:'wu'},initialTemplateId:'guitar',initialLearner:{customerId:'student',name:'測試學員',cardId:''},initialScheduleKind:'FIXED',requestKey:'save-error',onCreated:created})));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,160));});
  const save=()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='新增')!;
  expect(save().disabled).toBe(false);
  await act(async()=>save().click());
  expect(host.querySelector('footer [role="alert"]')?.textContent).toBe('方案期別待確認，請先核對各期堂數');
  expect(host.querySelector<HTMLInputElement>('[aria-label="排課日期"]')!.value).toBe('2026-10-27');
  expect(host.textContent).toContain('測試學員');expect(created).not.toHaveBeenCalled();expect(save().disabled).toBe(false);
 }finally{await act(async()=>root.unmount());}
});
