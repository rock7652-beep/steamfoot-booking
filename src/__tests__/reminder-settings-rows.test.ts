// @vitest-environment jsdom
import {act,createElement as h,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({push:vi.fn(),save:vi.fn(),preference:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push,refresh:vi.fn()})}));
vi.mock('@/server/actions/reminder',()=>({saveSessionBalanceTemplateSetting:m.save}));
vi.mock('@/server/actions/session-balance-notification-toggle',()=>({setSessionBalanceNotificationToggle:vi.fn()}));
vi.mock('@/lib/manager-notification-save',()=>({saveManagerNotification:(store:string,id:string,key:string,on:boolean)=>m.preference(store,id,key,on)}));
vi.mock('@/server/actions/store-line-notification-recipients',()=>({createStoreLineNotificationRecipient:vi.fn(),resumeStoreLineNotificationRecipient:vi.fn(),removeStoreLineNotificationRecipient:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {useSettingsPanelGuard,useSettingsPanelNavigation} from '@/components/admin/settings-panel-context';
import {ReminderSettingRow,ReminderSettingsScope} from '@/components/admin/reminder-settings-list';
import {SimpleSessionBalanceReminders} from '@/app/(dashboard)/dashboard/reminders/simple-session-balance-reminders';
import {extractSessionBalanceCustomCopy,DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING as defaults} from '@/lib/session-balance-notification-settings';
import {LineNotificationRecipientsCard} from '@/app/(dashboard)/dashboard/reminders/line-notification-recipients-card';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const rows=()=>Array.from(host.querySelectorAll<HTMLDetailsElement>('details[data-reminder-row]'));
async function open(row:HTMLDetailsElement){await act(async()=>{row.open=true;row.dispatchEvent(new Event('toggle',{bubbles:false}));});}
async function input(el:HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
function Draft(){const [value,set]=useState('');return h('input',{'aria-label':'draft',value,onChange:e=>set(e.target.value)});}
it('opens only one settings row and preserves mounted drafts when another opens',async()=>{
 await act(async()=>root.render(h(ReminderSettingsScope,null,h(ReminderSettingRow,{title:'A'},h(Draft)),h(ReminderSettingRow,{title:'B'},h('p',null,'preview')))));
 const original=host.querySelector<HTMLInputElement>('[aria-label=draft]')!;
 await open(rows()[0]);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(original,'unsaved');original.dispatchEvent(new Event('input',{bubbles:true}));});
 await open(rows()[1]);expect(rows()[0].open).toBe(false);expect(rows()[1].open).toBe(true);
 expect(host.querySelector('[aria-label=draft]')).toBe(original);expect(original.value).toBe('unsaved');await open(rows()[0]);expect(original.value).toBe('unsaved');
});
it('saves only the selected balance row and cancel leaves the other draft intact',async()=>{
 m.save.mockResolvedValue({success:true});await act(async()=>root.render(h(ReminderSettingsScope,null,h(SimpleSessionBalanceReminders,{initialSetting:defaults}))));
 const [last,used]=rows();const lastInput=last.querySelector('textarea')!,usedInput=used.querySelector('textarea')!;
 await open(last);await input(lastInput,'last draft');await open(used);await input(usedInput,'used draft');
 const save=Array.from(last.querySelectorAll('button')).find(b=>b.textContent==='儲存變更')!;
 await act(async()=>save.click());expect(m.save).toHaveBeenCalledExactlyOnceWith({section:'last-session',lastSessionUnbookedTemplate:'last draft',lastSessionBookedTemplate:extractSessionBalanceCustomCopy(defaults.lastSessionBookedTemplate)});
 expect(usedInput.value).toBe('used draft');expect(used.textContent).toContain('未儲存');
 await act(async()=>Array.from(used.querySelectorAll('button')).find(b=>b.textContent==='取消')!.click());expect(used.open).toBe(false);expect(usedInput.value).not.toBe('used draft');expect(lastInput.value).toBe('last draft');
});
it('retains failed balance drafts and shows errors on the affected row only',async()=>{
 m.save.mockResolvedValue({success:false,error:'拒絕儲存'});await act(async()=>root.render(h(SimpleSessionBalanceReminders,{initialSetting:defaults})));
 await open(rows()[0]);await input(rows()[0].querySelector('textarea')!,'keep me');await act(async()=>Array.from(rows()[0].querySelectorAll('button')).find(b=>b.textContent==='儲存變更')!.click());
 expect(rows()[0].querySelector('textarea')!.value).toBe('keep me');expect(rows()[0].textContent).toContain('拒絕儲存');expect(rows()[1].textContent).not.toContain('拒絕儲存');expect(rows()[0].open).toBe(true);
});
it('keeps a pending recipient write scoped to its original person after selecting another',async()=>{
 let resolve!:(v:unknown)=>void;m.preference.mockReturnValue(new Promise(r=>{resolve=r;}));
 const recipients=['A','B'].map(id=>({id,displayName:id,roleLabel:'店長',isActive:true,linkedAt:new Date(),sameDayBookingEnabled:false,preferences:{trial:false}}));
 await act(async()=>root.render(h(LineNotificationRecipientsCard,{storeId:'store-a',recipients})));
 const a=host.querySelector<HTMLInputElement>('input[aria-label="A 當日預約"]')??host.querySelectorAll<HTMLInputElement>('[data-notification-recipient] input[role=switch]')[1];
 await act(async()=>a.click());const select=host.querySelector<HTMLSelectElement>('select[aria-label="通知收件人"]')!;
 await act(async()=>{select.value='B';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('[data-notification-recipient]')!.parentElement!.hidden).toBe(true);
 expect(m.preference.mock.calls[0].slice(0,2)).toEqual(['store-a','A']);
 await act(async()=>resolve({success:true}));expect(host.querySelectorAll<HTMLInputElement>('[data-notification-recipient]')[1].querySelectorAll<HTMLInputElement>('input[role=switch]')[1].checked).toBe(false);
 await act(async()=>{select.value='A';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(a.checked).toBe(true);
});

it('keeps read-only recipient controls disabled while allowing previews',async()=>{
 const recipient={id:'r',displayName:'唯讀店長',roleLabel:'店長',isActive:true,linkedAt:new Date(),sameDayBookingEnabled:false,preferences:{}};
 await act(async()=>root.render(h(ReminderSettingsScope,null,h(LineNotificationRecipientsCard,{storeId:'store-a',recipients:[recipient],readOnly:true}))));
 expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[role=switch]')).every(input=>input.disabled)).toBe(true);
 await open(rows()[0]);expect(rows()[0].open).toBe(true);expect(rows()[0].textContent).toContain('示範資料');expect(m.preference).not.toHaveBeenCalled();
});

function Guarded({dirty,pending}:{dirty:boolean;pending:boolean}){useSettingsPanelGuard(dirty,pending);const navigate=useSettingsPanelNavigation();return h('button',{onClick:()=>navigate?.('/next')},'leave');}
it('blocks tab navigation while saving and confirms dirty drafts before leaving',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 await act(async()=>root.render(h(ReminderSettingsScope,null,h(Guarded,{dirty:true,pending:true}))));
 await act(async()=>host.querySelector('button')!.click());expect(m.push).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();expect(host.textContent).toContain('正在儲存');
 await act(async()=>root.render(h(ReminderSettingsScope,null,h(Guarded,{dirty:true,pending:false}))));
 await act(async()=>host.querySelector('button')!.click());expect(confirm).toHaveBeenCalledOnce();expect(m.push).not.toHaveBeenCalled();
 confirm.mockReturnValue(true);await act(async()=>host.querySelector('button')!.click());expect(m.push).toHaveBeenCalledWith('/next');confirm.mockRestore();
});
