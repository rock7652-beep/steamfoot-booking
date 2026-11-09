// @vitest-environment jsdom
import {act,createElement,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
vi.mock('@/server/actions/course-slot-matches',()=>({getMusicSlotMatches:vi.fn()}));
import {CourseScheduleBoard} from '@/app/(dashboard)/dashboard/courses/course-schedule-board';
// jsdom does not implement element scrolling; the real scroll behavior is
// covered by the browser preview across viewports and overflowing day ranges.
const originalScroll=HTMLElement.prototype.scrollTo;
beforeAll(()=>{HTMLElement.prototype.scrollTo=vi.fn();});
afterAll(()=>{HTMLElement.prototype.scrollTo=originalScroll;});
type Props=ComponentProps<typeof CourseScheduleBoard>;
const base:Props={businessProfile:'FITNESS',sportsNative:true,mode:'day',selectedDate:'2099-10-29',today:'2099-10-29',initialResourceView:'room',rooms:[{id:'room',name:'教室1',isActive:true}],coaches:[{id:'coach',displayName:'老師甲',status:'ACTIVE',courseCoachEnabled:true}],templates:[{id:'template',name:'課程',classType:'GROUP'}],sessions:[],storePeriods:[{openTime:'08:00',closeTime:'23:00'}],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:vi.fn(),onSelectDate:vi.fn(),onOpenSession:vi.fn()};
const session={id:'lesson',templateId:'template',nameSnapshot:'課程摘要',startsAt:'2099-10-29T01:15:00Z',endsAt:'2099-10-29T02:00:00Z',coachId:'coach',roomId:'room',capacity:1,pointCost:1,bookings:[]};
async function mount(overrides:Partial<Props>){Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,...overrides})));return {host,root,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
it.each(['FITNESS','MUSIC'] as const)('%s honors the selected day opening range and blocks partial hours outside it',async businessProfile=>{
 const {host,close}=await mount({businessProfile,sportsNative:businessProfile==='FITNESS',calendarDays:{'2099-10-29':{status:'open',periods:[{openTime:'10:30',closeTime:'20:15'}]}}});try{
 expect(host.querySelector('button[aria-label^="08:00"]')).toBeNull();expect(host.querySelector('button[aria-label^="21:00"]')).toBeNull();
 expect(host.querySelector<HTMLButtonElement>('button[aria-label^="10:00"]')?.disabled).toBe(true);
 expect(host.querySelector<HTMLButtonElement>('button[aria-label^="10:30"]')?.disabled).toBe(false);
 expect(host.querySelector<HTMLButtonElement>('button[aria-label^="20:00"]')?.disabled).toBe(true);
 }finally{await close();}
});
it.each(['closed','training'])('keeps historical lessons clickable on a %s day while preventing new slots',async status=>{
 const open=vi.fn();const {host,close}=await mount({sessions:[session],occupiedSessions:[session],calendarDays:{'2099-10-29':{status,periods:[{openTime:'10:00',closeTime:'20:00'}]}},onOpenSession:open});try{
 const card=host.querySelector<HTMLButtonElement>('[data-calendar-session="lesson"]')!;expect(card.disabled).toBe(false);await act(async()=>card.click());expect(open).toHaveBeenCalledWith('lesson','2099-10-29');
 expect([...host.querySelectorAll<HTMLButtonElement>('button[aria-label^="09:"]:not([data-calendar-session])')].every(button=>button.disabled)).toBe(true);
 }finally{await close();}
});
it('preserves hidden historical occupations and moved origins when the visible class list is filtered',async()=>{
 const late={...session,id:'late',startsAt:'2099-10-29T14:30:00Z',endsAt:'2099-10-29T15:00:00Z',rescheduledFromStartsAt:'2099-10-29T00:00:00Z',rescheduledFromEndsAt:'2099-10-29T00:45:00Z',rescheduledFromRoomId:'room',rescheduledFromCoachId:'coach'};
 const {host,close}=await mount({businessProfile:'MUSIC',sportsNative:false,sessions:[],occupiedSessions:[late],storePeriods:[{openTime:'10:00',closeTime:'20:00'}]});try{
 expect(host.querySelector('button[aria-label^="08:00"]')).not.toBeNull();expect(host.querySelector('button[aria-label^="22:30"]')).not.toBeNull();
 expect(host.querySelector<HTMLButtonElement>('button[aria-label^="22:30"]')?.disabled).toBe(true);
 }finally{await close();}
});
