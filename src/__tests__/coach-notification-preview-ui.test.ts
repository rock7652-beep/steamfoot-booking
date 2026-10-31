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
 const rows=[...host.querySelectorAll<HTMLDetailsElement>('details[data-reminder-row]')];
 expect(rows).toHaveLength(3);
 await act(async()=>rows[0].querySelector('summary')!.click());
 expect(rows[0].open).toBe(true);expect(rows[0].textContent).toContain('體驗 2 位');expect(rows[0].textContent).toContain('查看授課名單');expect(rows[0].querySelector('[aria-label="教練通知卡片預覽"]')).toBeTruthy();expect(m.save).not.toHaveBeenCalled();
 await act(async()=>{rows[0].open=false;rows[1].querySelector('summary')!.click();});
 expect(rows[1].open).toBe(true);expect(rows[1].textContent).toContain('授課安排已更新');expect(rows.filter(r=>r.open)).toHaveLength(1);expect(m.save).not.toHaveBeenCalled();
});
it('uses accessible shared switches and retains off state on a failed save',async()=>{
 const switches=host.querySelectorAll<HTMLInputElement>('[role="switch"]');expect(switches).toHaveLength(3);expect(switches[0].className).toContain('appearance-none');m.save.mockResolvedValue({success:false,error:'儲存失敗'});
 await act(async()=>switches[0].click());expect(switches[0].checked).toBe(false);expect(m.error).toHaveBeenCalledWith('儲存失敗');
});
