// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn()}));
vi.mock('@/server/actions/course-charge',()=>({loadCourseChargeOptions:vi.fn()}));
vi.mock('@/components/operations/panel-read-cache',()=>({usePanelReader:()=>m}));
vi.mock('@/server/actions/course-rental',()=>({createRentalCustomer:vi.fn()}));
vi.mock('@/server/actions/sports-staging',()=>({sportsStagingCommand:m.command}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:()=>null}));
import {SportsScheduleFields} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const settings={kind:'single',durationMinutes:90,trialPrice:480,trialDuration:null,providerIds:['coach']};
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({success:true,enabled:true,defaultTrialPrice:499,rows:[{id:'single',name:'舞蹈單次',open:false,price:700,settings}]});m.command.mockResolvedValue({success:false,error:'隔離失敗，保留草稿'});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(){await act(async()=>root.render(createElement(SportsScheduleFields,{initial:{storeId:'s',date:'2026-10-27',subjects:[{id:'subject',templateId:'t',name:'舞蹈',category:'',active:true,updatedAt:'v1'}],fees:[],lessons:[],students:[],customers:[{id:'existing',name:'既有學員',phone:'0900000000'}],coaches:[{id:'coach',name:'老師',templates:['t']}],rooms:[{id:'room',name:'A',capacity:8,rental:true}]},date:'2026-10-27',seed:{coachId:'coach'},schedulingModes:{selfBookingEnabled:false,assignedSchedulingEnabled:true},requestKey:'00000000-0000-4000-8000-000000000001',onGuard:()=>{},onCreated:()=>{}})));
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='體驗')!.click());}
async function fill(label:string,value:string){const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('loads the selected single charge trial price/duration and creates a guest intent with stable retries',async()=>{
 await mount();expect(host.querySelector('[aria-label="搜尋學員"]')).toBeNull();
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課費用"]')!.value).toBe('480');expect(host.querySelector<HTMLInputElement>('[aria-label="排課時長"]')!.value).toBe('90');
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課時長"]')!.readOnly).toBe(true);
 await fill('體驗學員姓名','新體驗者');await fill('體驗學員手機','0912-345-678');
 const submit=()=>act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await submit();await submit();expect(m.command).toHaveBeenCalledTimes(2);expect(m.command.mock.calls[0][0]).toEqual(m.command.mock.calls[1][0]);expect(m.command.mock.calls[0][0]).toMatchObject({operation:'schedule',payload:{kind:'體驗',fee:'single',duration:90,price:480,students:[],trialLearner:{name:'新體驗者',phone:'0912345678',participantKey:expect.any(String)}}});
 expect(host.querySelector<HTMLInputElement>('[aria-label="體驗學員姓名"]')!.value).toBe('新體驗者');
});
it('does not offer an unconfigured assigned trial as a zero-price class',async()=>{
 m.read.mockResolvedValue({success:true,enabled:true,defaultTrialPrice:499,rows:[]});await mount();
 expect(host.textContent).toContain('沒有開放體驗的單次收費');await fill('體驗學員姓名','新體驗者');await fill('體驗學員手機','0912345678');
 expect(host.querySelector<HTMLButtonElement>('button:not([type])')!.disabled).toBe(true);
});
it('blocks an invalid phone before sending a schedule request',async()=>{await mount();await fill('體驗學員姓名','新體驗者');await fill('體驗學員手機','123');await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(m.command).not.toHaveBeenCalled();});

it('uses an explicit free trial price and trial duration instead of store defaults',async()=>{
 m.read.mockResolvedValue({success:true,enabled:true,defaultTrialPrice:499,rows:[{id:'free',name:'免費體驗',price:700,open:false,settings:{...settings,trialPrice:0,trialDuration:30}}]});await mount();
 expect(host.querySelector<HTMLInputElement>('[aria-label="排課費用"]')!.value).toBe('0');expect(host.querySelector<HTMLInputElement>('[aria-label="排課時長"]')!.value).toBe('30');
});
