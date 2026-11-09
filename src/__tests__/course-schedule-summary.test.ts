// @vitest-environment jsdom
import {act,createElement as h,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({matches:vi.fn().mockResolvedValue({success:true,data:[]})}));
vi.mock('@/server/actions/course-slot-matches',()=>({getMusicSlotMatches:m.matches}));
import {ScheduleSummaryButton} from '@/components/admin/schedule-summary-button';
import {CourseScheduleBoard} from '@/app/(dashboard)/dashboard/courses/course-schedule-board';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLElement.prototype.scrollTo=vi.fn();
function pointer(node:HTMLElement,type:string,pointerType='mouse'){const event=new Event(type,{bubbles:true});Object.defineProperty(event,'pointerType',{value:pointerType});node.dispatchEvent(event);}
it('shares the white card for pointer and keyboard, closes on Escape/scroll, and keeps the original click',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),open=vi.fn();
 try{
  await act(async()=>root.render(h(ScheduleSummaryButton,{summary:h('p',null,'完整課程摘要'),onClick:open,title:'不重複顯示原生灰色提示'},'課程')));
  const button=host.querySelector('button')!;
  await act(async()=>pointer(button,'pointerover'));expect(document.querySelector('[data-service-card-summary]')?.textContent).toBe('完整課程摘要');expect(button.hasAttribute('title')).toBe(false);expect(open).not.toHaveBeenCalled();
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));expect(document.querySelector('[data-service-card-summary]')).toBeNull();
  await act(async()=>button.focus());expect(document.querySelector('[data-service-card-summary]')).not.toBeNull();
  await act(async()=>window.dispatchEvent(new Event('scroll')));expect(document.querySelector('[data-service-card-summary]')).toBeNull();
  await act(async()=>pointer(button,'pointerover'));await act(async()=>button.click());expect(open).toHaveBeenCalledOnce();expect(document.querySelector('[data-service-card-summary]')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('ignores touch hover and keeps one-tap opening',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),open=vi.fn();
 try{await act(async()=>root.render(h(ScheduleSummaryButton,{summary:'摘要',onClick:open},'課程')));const button=host.querySelector('button')!;await act(async()=>pointer(button,'pointerover','touch'));expect(document.querySelector('[data-service-card-summary]')).toBeNull();await act(async()=>button.click());expect(open).toHaveBeenCalledOnce();}finally{await act(async()=>root.unmount());host.remove();}
});
it.each(['MUSIC','FITNESS'] as const)('%s day and week cards show the existing authorized course fields without another read',async businessProfile=>{
 for(const mode of ['day','week'] as const){
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host),open=vi.fn();
  const props:ComponentProps<typeof CourseScheduleBoard>={businessProfile,sportsNative:businessProfile==='FITNESS',mode,selectedDate:'2099-10-29',today:'2099-10-29',initialResourceView:'room',rooms:[{id:'room',name:'測試教室',isActive:true}],coaches:[{id:'coach',displayName:'授課人員甲',status:'ACTIVE',courseCoachEnabled:true}],templates:[{id:'template',name:'鋼琴課',classType:'PRIVATE'}],sessions:[{id:'lesson',templateId:'template',nameSnapshot:'鋼琴課',startsAt:'2099-10-29T01:00:00Z',endsAt:'2099-10-29T02:00:00Z',coachId:'coach',roomId:'room',capacity:1,pointCost:1,bookings:[{customerId:'customer',customerName:'合成學員',status:'RESERVED',bookingKind:'REGULAR'}]}],storePeriods:[{openTime:'08:00',closeTime:'20:00'}],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:vi.fn(),onSelectDate:vi.fn(),onOpenSession:open};
  try{
   await act(async()=>root.render(h(CourseScheduleBoard,props)));const reads=m.matches.mock.calls.length;
   const card=host.querySelector<HTMLButtonElement>('[data-calendar-session="lesson"]')!;expect(card).not.toBeNull();
   await act(async()=>pointer(card,'pointerover'));const text=document.querySelector('[data-service-card-summary]')?.textContent??'';
   for(const label of ['合成學員','鋼琴課','09:00','10:00','測試教室','授課人員甲'])expect(text).toContain(label);
   expect(m.matches.mock.calls).toHaveLength(reads);await act(async()=>card.click());expect(open).toHaveBeenCalledOnce();expect(document.querySelector('[data-service-card-summary]')).toBeNull();
  }finally{await act(async()=>root.unmount());host.remove();}
 }
});
