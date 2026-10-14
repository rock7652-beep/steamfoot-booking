// @vitest-environment jsdom
import {act,createElement as el} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn(),report:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh}),usePathname:()=>'/s/music/admin/dashboard/courses'}));
vi.mock('@/components/settings/save-settings-receipt',()=>({saveSettingsReceipt:m.save}));
vi.mock('@/server/actions/trial-care',()=>({saveTrialCareSettings:vi.fn(),stopCustomerTrialCare:vi.fn()}));
import {TrialCareCard} from '@/app/(dashboard)/dashboard/reminders/trial-care-card';
import {defaultCourseTrialCareRules} from '@/lib/trial-care';
import {SettingsPanelContext} from '@/components/admin/settings-panel-context';
it('guards a dirty care setting, confirms returned rules once and does not refresh its host',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const rules=defaultCourseTrialCareRules();m.save.mockResolvedValue({success:true,data:{enabled:true,rules}});
 try{await act(async()=>root.render(el(SettingsPanelContext.Provider,{value:{report:m.report,navigate:vi.fn()}},el(TrialCareCard,{storeId:'music',storeName:'合成測試',initialEnabled:false,initialRules:rules,logs:[],course:true}))));
 await act(async()=>host.querySelector<HTMLButtonElement>('button[role=switch]')!.click());expect(m.report.mock.calls.at(-1)?.[1].dirty).toBe(true);
 await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
 expect(m.save).toHaveBeenCalledOnce();expect(m.save.mock.calls[0][0]).toBe('TRIAL_CARE');expect(m.refresh).not.toHaveBeenCalled();expect(m.report.mock.calls.at(-1)?.[1]).toEqual({dirty:false,pending:false});expect(host.textContent).toContain('設定已儲存');
 }finally{await act(async()=>root.unmount());host.remove()}
});
