// @vitest-environment jsdom
import {createElement,act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({preview:vi.fn(),send:vi.fn()}));
vi.mock('@/server/actions/course-monthly-notification',()=>({previewCourseMonthlyNotifications:m.preview,notifyCourseMonthlyPerson:m.send}));
import {CourseMonthlyNotifications} from '@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-notifications';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const props={month:'2026-09',revision:1,enabled:true,confirmed:true};
it('blocks notification before income access is enabled',async()=>{await act(async()=>root.render(createElement(CourseMonthlyNotifications,{...props,enabled:false})));expect(host.textContent).toContain('先於月結設定');expect(host.querySelector('button')!.disabled).toBe(true);});
it('blocks an unconfirmed revision',async()=>{await act(async()=>root.render(createElement(CourseMonthlyNotifications,{...props,confirmed:false})));expect(host.querySelector('button')!.disabled).toBe(true);});
it('shows counts before sending and never sends in preview',async()=>{
 m.preview.mockResolvedValue({success:true,data:{revision:1,reason:null,preview:true,rows:[{staffId:'s',name:'林教練',status:'READY',reason:''},{staffId:'s2',name:'黃教練',status:'UNBOUND',reason:'未綁定'}]}});
 await act(async()=>root.render(createElement(CourseMonthlyNotifications,props)));
 await act(async()=>host.querySelector('button')!.click());
 expect(host.textContent).toContain('可通知／重試 1 人');expect(host.textContent).toContain('未完成綁定 1 人');
 const send=[...host.querySelectorAll('button')].find(b=>b.textContent==='通知 1 位人員')!;expect(send.disabled).toBe(true);expect(m.send).not.toHaveBeenCalled();
});
it('only sends ready or retryable rows, not successful or unbound rows',async()=>{
 m.preview.mockResolvedValue({success:true,data:{revision:1,reason:null,preview:false,rows:[{staffId:'a',name:'甲',status:'READY',reason:''},{staffId:'b',name:'乙',status:'SENT',reason:''},{staffId:'c',name:'丙',status:'UNBOUND',reason:''}]}});m.send.mockResolvedValue({success:true,data:{status:'SENT'}});
 await act(async()=>root.render(createElement(CourseMonthlyNotifications,props)));await act(async()=>host.querySelector('button')!.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='通知 1 位人員')!.click());
 expect(m.send).toHaveBeenCalledTimes(1);expect(m.send).toHaveBeenCalledWith({month:'2026-09',revision:1,staffId:'a'});
});
