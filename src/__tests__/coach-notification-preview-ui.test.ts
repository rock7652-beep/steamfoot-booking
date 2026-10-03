// @vitest-environment jsdom
import { act,createElement as el } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/server/actions/course-coach-notifications',()=>({setCoachNotification:m.save}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error}}));
import {CoachNotificationSettings} from '@/app/(dashboard)/dashboard/courses/reminders/coach-notification-settings';
let host:HTMLDivElement,root:Root;
beforeEach(async()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(el(CoachNotificationSettings,{initial:{DIGEST:false,CHANGE:false,TRIAL:false},teachers:[],logs:[]})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens the actual Flex sample in place without enabling or saving notifications',async()=>{
 const previews=[...host.querySelectorAll('button')].filter(b=>b.textContent==='預覽');
 await act(async()=>previews[0].click());expect(host.textContent).toContain('體驗 2 位');expect(host.textContent).toContain('查看授課名單');expect(host.querySelector('[aria-label="教練通知卡片預覽"]')).toBeTruthy();expect(m.save).not.toHaveBeenCalled();
 await act(async()=>previews[1].click());expect(host.textContent).toContain('授課安排已更新');expect(host.querySelectorAll('[aria-label="教練通知卡片預覽"]')).toHaveLength(1);expect(host.textContent).not.toContain('體驗 2 位');
});
it('uses accessible shared switches and retains off state on a failed save',async()=>{
 const switches=host.querySelectorAll<HTMLInputElement>('[role="switch"]');expect(switches).toHaveLength(3);expect(switches[0].className).toContain('appearance-none');m.save.mockResolvedValue({success:false,error:'儲存失敗'});
 await act(async()=>switches[0].click());expect(switches[0].checked).toBe(false);expect(m.error).toHaveBeenCalledWith('儲存失敗');
});
