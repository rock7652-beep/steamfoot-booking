// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),day:vi.fn(),summary:vi.fn(),specials:vi.fn(),toast:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/synthetic/admin/dashboard/settings/hours'}));
vi.mock('sonner',()=>({toast:{success:m.toast,error:vi.fn()}}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/server/actions/course-business-hours',()=>({getCourseDayHours:m.day,getCourseMonthScheduleSummary:m.summary,getCourseMonthSpecialDays:m.specials}));
vi.mock('@/server/actions/business-hours',()=>({getDaySlotDetails:m.day,getMonthScheduleSummary:m.summary,getMonthSpecialDays:m.specials,syncFromHeadquarters:vi.fn()}));
import {ScheduleManager} from '@/app/(dashboard)/dashboard/settings/hours/schedule-manager';
import {serviceHoursReceipt,type ServiceHoursState} from '@/server/services/service-hours-state';
const date='2026-12-17',periods=[{openTime:'10:00',closeTime:'12:00',slotInterval:60,defaultCapacity:6},{openTime:'14:00',closeTime:'17:00',slotInterval:60,defaultCapacity:6}];
let host:HTMLDivElement,root:Root,state:ServiceHoursState;
const receipt=()=>serviceHoursReceipt(state,date,true);
async function render(key:string){const initial=receipt();await act(async()=>root.render(h(ScheduleManager,{key,storeId:'s',initialHoursRevision:initial.day.hoursRevision,weeklyHours:initial.weekly,initialSpecialDays:initial.specials,initialSummary:initial.summary,initialYear:2026,initialMonth:12,canManage:true,isHeadquarters:true})));}
function day(n:number){return [...host.querySelectorAll<HTMLButtonElement>('[data-schedule-calendar] button')].find(b=>b.querySelector('span')?.textContent===String(n))!;}
async function click(text:string){const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;expect(button).toBeTruthy();await act(async()=>button.click());}
async function input(field:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});}
function field(label:string){return host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;}
beforeEach(async()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('fetch',m.fetch);state={hours:Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,isOpen:false,openTime:null,closeTime:null,slotInterval:60,defaultCapacity:6,segments:null})),specials:[],overrides:[]};m.day.mockImplementation(async(d:string)=>serviceHoursReceipt(state,d,true).day);host=document.createElement('div');document.body.append(host);root=createRoot(host);await render('initial');await act(async()=>day(17).click());});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('shows a missing second end time, saves both periods, adopts the authoritative starts and retains them when reopened or reloaded',async()=>{
 await click('調整時間');await input(field('第1段開始時間'),'10:00');await input(field('第1段結束時間'),'12:00');await click('＋ 新增一段');await input(field('第2段開始時間'),'14:00');
 expect(host.textContent).toContain('第 2 段：請填寫完整結束時間');expect(host.textContent).toContain('尚未儲存的時段預覽');expect(m.fetch).not.toHaveBeenCalled();
 const check=()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='檢查變更')!;expect(check().disabled).toBe(true);
 await input(field('第2段結束時間'),'17:00');expect(check().disabled).toBe(false);await click('檢查變更');expect(m.fetch).not.toHaveBeenCalled();
 m.fetch.mockImplementation(async(_url:string,options:{body:string})=>{const input=JSON.parse(options.body);expect(input.values).toMatchObject({date,status:'custom',periods});state.specials=[{id:'saved',date:new Date(date+'T00:00:00Z'),type:'custom',reason:null,openTime:'10:00',closeTime:'17:00',slotInterval:60,defaultCapacity:6,segments:periods}];return {json:async()=>({success:true,storeId:'s',data:{...receipt(),count:0,skipped:[],operationId:null}})};});
 await click('確認並儲存');expect(m.fetch).toHaveBeenCalledOnce();expect(host.textContent).toContain('2026-12-17 已儲存：10:00–12:00、14:00–17:00');
 const starts=()=>host.querySelector('[aria-label="開放時段預覽"]')!.textContent!;for(const time of ['10:00','11:00','14:00','15:00','16:00'])expect(starts()).toContain(time);expect(host.textContent).not.toContain('尚未儲存的時段預覽');
 await act(async()=>day(18).click());await act(async()=>day(17).click());expect(field('第2段結束時間').value).toBe('17:00');expect(starts()).toContain('16:00');
 await render('reload');await act(async()=>day(17).click());expect(field('第2段結束時間').value).toBe('17:00');expect(starts()).toContain('16:00');
});
