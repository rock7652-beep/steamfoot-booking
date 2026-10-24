// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/components/admin/course-setup-step-badge',()=>({CourseSetupStepBadge:()=>null}));
import {CourseHoursWorkspace} from '@/app/(dashboard)/dashboard/courses/hours/hours-workspace';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('Beauty omits reservation controls and opens weekly hours even for an old booking deep link',async()=>{
 await act(async()=>root.render(h(CourseHoursWorkspace,{initialSection:'booking',schedule:h('section',{'data-schedule-grid':true},'營業時段')})));
 expect([...host.querySelectorAll('button')].map(b=>b.textContent)).toEqual(['每週營業','特殊公休']);expect(host.querySelector('button[aria-pressed=true]')?.textContent).toBe('每週營業');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='特殊公休')!.click());expect(host.querySelector('button[aria-pressed=true]')?.textContent).toBe('特殊公休');
});
it('other modules retain their original booking tab and initial selection',async()=>{
 await act(async()=>root.render(h(CourseHoursWorkspace,{initialSection:'booking',booking:h('p',null,'原有預約設定'),schedule:h('section',null,'營業時段')})));
 expect(host.querySelector('button[aria-pressed=true]')?.textContent).toBe('預約開放');expect(host.textContent).toContain('原有預約設定');
});
