// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ServiceReservationForm,type ServiceReservationSource} from '@/components/admin/service-reservation-form';
let host:HTMLDivElement,root:Root;
const read=vi.fn(),submit=vi.fn(),guard=vi.fn(),created=vi.fn(),createCustomer=vi.fn();
const card={id:'soon',name:'快到期方案',memberIds:['customer','other'],serviceIds:['s1','s2'],remaining:4,held:0,expiresAt:'2026-12-31T15:59:59Z',closedAt:null,allowShared:true};
function source():ServiceReservationSource{return {services:[{id:'s1',name:'做臉',duration:60,buffer:15,price:1000,trialPrice:500,revision:7},{id:'s2',name:'按摩',duration:90,buffer:15,price:1500,trialPrice:null,revision:2}],technicians:[{id:'t1',name:'技師甲',serviceIds:['s1','s2']},{id:'t2',name:'技師乙',serviceIds:['s1','s2']}],locations:[{id:'r1',name:'床位甲'},{id:'r2',name:'床位乙'}],customers:[{id:'customer',name:'同名顧客',phone:'0900000001'},{id:'other',name:'同名顧客',phone:'0900000002'}],cards:[{...card,id:'later',expiresAt:'2027-02-01T15:59:59Z'},card],policyRevision:3,readAvailability:read,submit,createCustomer};}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);read.mockImplementation(async intent=>({success:true,data:{slots:['14:00','15:00'],arrangement:intent.people.map((p: {specifiedTechnicianId:string;specifiedLocationId:string},i:number)=>({technicianId:p.specifiedTechnicianId||`t${i+1}`,locationId:p.specifiedLocationId||`r${i+1}`,technicianName:i?'技師乙':'技師甲',locationName:i?'床位乙':'床位甲'}))}}));submit.mockResolvedValue({success:true});createCustomer.mockResolvedValue({success:true,customer:{id:'new',name:'新顧客',phone:'0900000003'}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function mount(seed:{roomId?:string;coachId?:string;customerId?:string}={},data=source()){await act(async()=>root.render(createElement(ServiceReservationForm,{source:data,date:'2026-10-28',seed:{time:'14:00',...seed},onGuard:guard,onCreated:created})));}
function input(label:string){return host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;}
function button(text:string){return [...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;}
async function set(label:string,value:string){const element=input(label);await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function tick(){await act(async()=>vi.advanceTimersByTimeAsync(360));}
async function choose(index:number,phone:string){await act(async()=>input(`顧客姓名 ${index}`).focus());await set(`顧客姓名 ${index}`,phone);await act(async()=>[...host.querySelectorAll<HTMLElement>('[role="option"]')].find(e=>e.textContent?.includes(phone))!.click());}
it('uses clicked time/technician/location, defaults to the first location outside that view and shows real service and buffer times',async()=>{
 await mount({coachId:'t2',roomId:'r2',customerId:'customer'});expect(input('預約開始時間').value).toBe('14:00');expect(input('此位技師 1').value).toBe('t2');expect(input('此位位置 1').value).toBe('r2');expect(host.textContent).toContain('14:00–15:00');expect(host.textContent).toContain('整理至 15:15');
 await set('服務項目 1','s2');expect(host.textContent).toContain('14:00–15:30');expect(host.textContent).toContain('整理至 15:45');
 await act(async()=>root.unmount());root=createRoot(host);await mount();expect(input('此位位置 1').value).toBe('r1');
});
it('searches names or phones, distinguishes identical names and invalidates a prior customer as soon as a new query is typed',async()=>{
 await mount();await choose(1,'0900000002');await tick();expect(read.mock.calls.at(-1)![0].people[0].customerId).toBe('other');expect(button('確認預約').disabled).toBe(false);
 await act(async()=>input('顧客姓名 1').focus());await set('顧客姓名 1','尚未選定');expect(button('確認預約').disabled).toBe(true);expect(submit).not.toHaveBeenCalled();expect(input('使用方案 1').value).toBe('');
});
it('prioritizes valid expiring plans, automatically checks availability, and submits authoritative identity links without collecting payment',async()=>{
 await mount({customerId:'customer',coachId:'t1'});expect(input('使用方案 1').value).toBe('soon');expect([...input('使用方案 1').querySelectorAll('option')].map(o=>o.value)).toEqual(['soon','later','','__trial__']);await tick();expect(read.mock.calls[0][0].requestKey).toMatch(/^[0-9a-f-]{36}$/);
 expect(host.textContent).toContain('方案使用 1 次');expect(host.textContent).toContain('應收 NT$ 0');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(submit).toHaveBeenCalledOnce();expect(submit.mock.calls[0][0]).toMatchObject({date:'2026-10-28',time:'14:00',policyRevision:3,people:[{customerId:'customer',serviceId:'s1',cardId:'soon',specifiedTechnicianId:'t1',specifiedLocationId:'r1'}]});expect(submit.mock.calls[0][0]).not.toHaveProperty('paid');expect(created).toHaveBeenCalledWith('2026-10-28');
});
it('allocates a different technician and bed for a pending companion while preserving the clicked first resources',async()=>{
 await mount({customerId:'customer',coachId:'t1'});await act(async()=>button('＋新增同行者').click());await set('服務項目 2','s2');await tick();
 expect(input('顧客姓名 2').placeholder).toBe('同行者資料後補');expect(host.textContent).toContain('14:00–15:30');expect(button('確認預約').disabled).toBe(false);
 const intent=read.mock.calls.at(-1)![0];expect(intent.people[0]).toMatchObject({specifiedTechnicianId:'t1',specifiedLocationId:'r1'});expect(intent.people[1]).toMatchObject({customerId:null,phone:'',pendingIdentity:true,specifiedLocationId:null,specifiedTechnicianId:null,cardId:'soon'});
 expect(input('此位技師 2').textContent).toContain('自動 · 技師乙');expect(input('此位位置 2').textContent).toContain('自動 · 床位乙');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(submit.mock.calls[0][0].expectedArrangement).toEqual([{technicianId:'t1',locationId:'r1'},{technicianId:'t2',locationId:'r2'}]);
});
it('defaults to an applicable plan on service changes, then single payment if no applicable plan exists',async()=>{
 const data=source();data.cards=[{...card,serviceIds:['s1']}];await mount({customerId:'customer'},data);expect(input('使用方案 1').value).toBe('soon');await set('服務項目 1','s2');expect(input('使用方案 1').value).toBe('');expect(host.textContent).toContain('應收 NT$ 1,500');await tick();expect(button('確認預約').disabled).toBe(false);
});
it('disables duplicate IDs but allows distinct customers with the same name',async()=>{
 await mount({customerId:'customer'});await act(async()=>button('＋新增同行者').click());await act(async()=>input('顧客姓名 2').focus());
 const duplicate=[...host.querySelectorAll<HTMLElement>('[role="option"]')].find(e=>e.textContent?.includes('0900000001'))!;
 expect(duplicate.getAttribute('aria-disabled')).toBe('true');expect(duplicate.textContent).toContain('已選為第 1 位');await act(async()=>duplicate.click());expect(input('顧客姓名 2').value).toBe('');await choose(2,'0900000002');await tick();expect(button('確認預約').disabled).toBe(false);
});
it('shares only an authorized shared card and counts the combined party quota before falling back to single payment',async()=>{
 const data=source();data.cards=[{...card,remaining:2,held:1}];await mount({customerId:'customer'},data);await act(async()=>button('＋新增同行者').click());expect(input('使用方案 1').value).toBe('soon');expect(input('使用方案 2').value).toBe('');expect(host.textContent).toContain('方案使用 1 次');
 await set('使用方案 1','');expect(input('使用方案 2').value).toBe('soon');await set('使用方案 2','__trial__');await tick();expect(button('確認預約').disabled).toBe(true);expect(read).not.toHaveBeenCalled();await choose(2,'0900000002');await set('使用方案 2','__trial__');await tick();expect(read.mock.calls.at(-1)![0].people.map((p:{isTrial:boolean})=>p.isTrial)).toEqual([false,true]);expect(host.textContent).toContain('應收 NT$ 1,500');
});
it('does not allow a pending companion to use a non-shared card',async()=>{
 const data=source();data.cards=[{...card,allowShared:false}];await mount({customerId:'customer'},data);await act(async()=>button('＋新增同行者').click());expect(input('使用方案 2').value).toBe('');expect(input('使用方案 2').textContent).not.toContain('快到期方案');
});
it('pins the previewed assignments across an ambiguous retry and preserves manual overrides',async()=>{
 await mount({customerId:'customer'});await act(async()=>button('＋新增同行者').click());await set('此位位置 2','r2');await set('此位技師 2','t2');await tick();
 submit.mockRejectedValueOnce(Error('connection lost'));const send=()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await act(async()=>{send();});const first=structuredClone(submit.mock.calls[0][0]);expect(host.textContent).toContain('送出結果尚未確認');await act(async()=>{send();});expect(submit.mock.calls[1][0]).toEqual(first);expect(input('此位位置 2').value).toBe('r2');expect(input('此位技師 2').value).toBe('t2');
});
it('does not clear clicked inactive resources or select another one silently',async()=>{
 await mount({customerId:'customer',roomId:'inactive',coachId:'inactive'});expect(input('此位位置 1').value).toBe('inactive');expect(input('此位技師 1').value).toBe('inactive');expect(button('確認預約').disabled).toBe(true);await tick();expect(read).not.toHaveBeenCalled();
});
it('ignores late availability responses for a previous time and retains drafts after submit failure',async()=>{
 let old:(r:unknown)=>void=()=>{};read.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;}));await mount({customerId:'customer'});await tick();await set('預約開始時間','15:00');await tick();expect(button('確認預約').disabled).toBe(false);
 await act(async()=>old({success:true,data:{slots:[]}}));expect(button('確認預約').disabled).toBe(false);
 submit.mockResolvedValueOnce({success:false,error:'時段剛被預約'});await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.textContent).toContain('時段剛被預約');expect(input('預約開始時間').value).toBe('15:00');expect(input('顧客姓名 1').value).toContain('0900000001');
});
it('creates a customer only after an explicit action and selects the returned identity',async()=>{
 await mount();await act(async()=>input('顧客姓名 1').focus());await set('顧客姓名 1','新顧客');await act(async()=>button('＋新增顧客').click());await set('新增顧客姓名','新顧客');await set('新增顧客電話','0900000003');expect(createCustomer).not.toHaveBeenCalled();await act(async()=>button('建立並選用').click());await tick();expect(createCustomer).toHaveBeenCalledWith({name:'新顧客',phone:'0900000003'});expect(read.mock.calls.at(-1)![0].people[0].customerId).toBe('new');expect(host.textContent).toContain('應收 NT$ 1,000');
});

it('requires an explicit search result or an empty pending identity instead of silently discarding typed companion details',async()=>{await mount({customerId:'customer'});await act(async()=>button('＋新增同行者').click());await tick();expect(button('確認預約').disabled).toBe(false);await act(async()=>input('顧客姓名 2').focus());await set('顧客姓名 2','未建檔的親友');expect(button('確認預約').disabled).toBe(true);expect(host.textContent).toContain('請選擇搜尋結果，或清空姓名以資料後補');await set('顧客姓名 2','');await tick();expect(button('確認預約').disabled).toBe(false);});

it('supports one-customer direct service checkout without exposing card or companion grants',async()=>{const data={...source(),cards:[],maxPeople:1,createCustomer:undefined};await mount({customerId:'customer'},data);expect(button('＋新增同行者')).toBeUndefined();expect(input('使用方案 1').value).toBe('');expect(host.textContent).toContain('應收 NT$ 1,000');await set('使用方案 1','__trial__');expect(host.textContent).toContain('應收 NT$ 500');await tick();await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(submit.mock.calls[0][0].people[0]).toMatchObject({customerId:'customer',cardId:null,isTrial:true});});
