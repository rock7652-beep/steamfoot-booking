// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),mark:vi.fn(),save:vi.fn(),refresh:vi.fn(),push:vi.fn(),vip:vi.fn()}));
vi.mock("@/server/actions/steamfoot-store-notices",()=>({loadSteamfootStoreNotices:m.load,markSteamfootStoreNotice:m.mark,saveSteamfootNoticeSetting:m.save,loadSteamfootVipNoticeTarget:m.vip,loadSteamfootReminderTarget:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh,push:m.push}),usePathname:()=>'/s/s/admin/dashboard/bookings'}));
vi.mock("next/dynamic",()=>({default:()=> (p:{bookingId:string;readOnly:boolean;onClose:()=>void})=>createElement('div',{'data-booking':p.bookingId,'data-readonly':String(p.readOnly)},createElement('button',{onClick:p.onClose},'關閉預約'))}));
import {SteamfootStoreNoticeBell} from "@/components/admin/steamfoot-store-notice-bell";
import {SteamfootNoticeSetting} from "@/components/admin/steamfoot-notice-setting";
let host:HTMLDivElement,root:Root;
const row={id:'n',targetId:'booking-verified',kind:'MOVE',customerName:'小美',courseName:'蒸足',coachName:'值班店長',previousCoachName:null,startsAt:'2030-01-11T02:00:00Z',previousStartsAt:null,affectedCount:1,details:{},handledAt:null,handledByName:null,revision:0,createdAt:'2030-01-10T02:00:00Z',updatedAt:'2030-01-10T02:00:00Z',canViewCourse:true};
const response=(canHandle=true)=>({success:true,storeId:'s',enabled:true,items:[row],count:1,more:false,canHandle});
const click=async(label:string)=>{const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.startsWith(label)||b.getAttribute('aria-label')===label)!;expect(button).toBeTruthy();await act(async()=>button.click());};
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.load.mockResolvedValue(response());host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens the authorized booking in-place without marking or navigating',async()=>{
 await act(async()=>root.render(createElement(SteamfootStoreNoticeBell,{storeId:'s'})));
 await click('門市通知，1 筆待處理');await click('小美改期');await click('查看預約');
 expect(document.querySelector('[data-booking]')?.getAttribute('data-booking')).toBe('booking-verified');expect(document.querySelector('[data-booking]')?.getAttribute('data-readonly')).toBe('false');expect(m.mark).not.toHaveBeenCalled();
 await click('關閉預約');expect(document.querySelector('[role=dialog]')).not.toBeNull();expect(m.load.mock.calls.length).toBeGreaterThan(2);
});
it('keeps a read-only store view read-only in booking details and notice controls',async()=>{
 m.load.mockResolvedValue(response(false));await act(async()=>root.render(createElement(SteamfootStoreNoticeBell,{storeId:'s'})));
 await click('門市通知，1 筆待處理');expect(document.querySelector<HTMLButtonElement>('[aria-label="標記已處理：小美"]')?.disabled).toBe(true);
 await click('小美改期');await click('查看預約');expect(document.querySelector('[data-booking]')?.getAttribute('data-readonly')).toBe('true');
});
it('opens the current store pending-payment page from a compact payment notice',async()=>{
 m.load.mockResolvedValue({...response(),items:[{...row,id:'digital:p',targetId:null,kind:'PAYMENT',customerName:'方案付款',coachName:'',canViewCourse:true}]});
 await act(async()=>root.render(createElement(SteamfootStoreNoticeBell,{storeId:'s'})));
 await click('門市通知，1 筆待處理');await click('方案付款待核帳');await click('查看待核帳');
 expect(m.push).toHaveBeenCalledWith('/s/s/admin/dashboard/payments');expect(m.mark).not.toHaveBeenCalled();
});
it('resolves the VIP customer from the store notice before navigation',async()=>{
 m.load.mockResolvedValue({...response(),items:[{...row,id:'digital:vip',targetId:null,kind:'VIP',customerName:'續購需求',coachName:'',canViewCourse:true}]});
 m.vip.mockResolvedValue({success:true,storeId:'s',data:{id:'customer'}});
 await act(async()=>root.render(createElement(SteamfootStoreNoticeBell,{storeId:'s'})));
 await click('門市通知，1 筆待處理');await click('續購需求待聯繫');await click('查看顧客需求');
 expect(m.vip).toHaveBeenCalledWith({storeId:'s',id:'digital:vip'});expect(m.push).toHaveBeenCalledWith('/s/s/admin/dashboard/customers/customer');
});
it('starts on, saves immediately and refreshes only the steamfoot notification channel',async()=>{
 m.save.mockResolvedValue({success:true,data:{enabled:false}});const event=vi.fn();window.addEventListener('steamfoot-notices-setting',event);
 await act(async()=>root.render(createElement(SteamfootNoticeSetting,{storeId:'s',initialEnabled:true,canEdit:true})));
 const toggle=host.querySelector<HTMLInputElement>('[role=switch]')!;expect(toggle.checked).toBe(true);await act(async()=>toggle.click());
 expect(m.save).toHaveBeenCalledWith({storeId:'s',enabled:false,previous:true});expect(toggle.checked).toBe(false);expect(event).toHaveBeenCalledTimes(1);expect(m.refresh).toHaveBeenCalledTimes(1);window.removeEventListener('steamfoot-notices-setting',event);
});
it('restores the previous setting on failure and disables writes for read-only users',async()=>{
 m.save.mockResolvedValue({success:false,error:'設定已更新'});await act(async()=>root.render(createElement(SteamfootNoticeSetting,{storeId:'s',initialEnabled:true,canEdit:true})));
 const toggle=host.querySelector<HTMLInputElement>('[role=switch]')!;await act(async()=>toggle.click());expect(toggle.checked).toBe(true);expect(host.textContent).toContain('設定已更新');
 await act(async()=>root.render(createElement(SteamfootNoticeSetting,{storeId:'s',initialEnabled:true,canEdit:false})));expect(toggle.disabled).toBe(true);
});
