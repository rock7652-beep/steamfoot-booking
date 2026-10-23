// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ServiceReservationForm,type ServiceReservationSource} from '@/components/admin/service-reservation-form';
let host:HTMLDivElement,root:Root;
const read=vi.fn(),submit=vi.fn(),guard=vi.fn(),created=vi.fn(),createCustomer=vi.fn();
const card={id:'soon',name:'快到期方案',memberIds:['customer','other'],serviceIds:['s1','s2'],remaining:4,held:0,expiresAt:'2026-12-31T15:59:59Z',closedAt:null};
function source():ServiceReservationSource{return {services:[{id:'s1',name:'做臉',duration:60,buffer:15,price:1000,trialPrice:500,revision:7},{id:'s2',name:'按摩',duration:90,buffer:15,price:1500,trialPrice:null,revision:2}],technicians:[{id:'t1',name:'技師甲',serviceIds:['s1','s2']},{id:'t2',name:'技師乙',serviceIds:['s1','s2']}],locations:[{id:'r1',name:'床位甲'},{id:'r2',name:'床位乙'}],customers:[{id:'customer',name:'同名顧客',phone:'0900000001'},{id:'other',name:'同名顧客',phone:'0900000002'}],cards:[{...card,id:'later',expiresAt:'2027-02-01T15:59:59Z'},card],policyRevision:3,readAvailability:read,submit,createCustomer};}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);read.mockResolvedValue({success:true,data:{slots:['14:00','15:00']}});submit.mockResolvedValue({success:true});createCustomer.mockResolvedValue({success:true,customer:{id:'new',name:'新顧客',phone:'0900000003'}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function mount(seed:{roomId?:string;coachId?:string;customerId?:string}={},data=source()){await act(async()=>root.render(createElement(ServiceReservationForm,{source:data,date:'2026-10-28',seed:{time:'14:00',...seed},onGuard:guard,onCreated:created})));}
function input(label:string){return host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;}
function button(text:string){return [...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;}
async function set(label:string,value:string){const element=input(label);await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function tick(){await act(async()=>vi.advanceTimersByTimeAsync(360));}
async function choose(index:number,phone:string){await act(async()=>input(`顧客姓名 ${index}`).focus());await set(`顧客姓名 ${index}`,phone);await act(async()=>[...host.querySelectorAll<HTMLElement>('[role="option"]')].find(e=>e.textContent?.includes(phone))!.click());}
it('uses clicked time/technician/location, defaults to the first location outside that view and shows real service and buffer times',async()=>{
 await mount({coachId:'t2',roomId:'r2',customerId:'customer'});expect(input('預約開始時間').value).toBe('14:00');expect(input('預約技師').value).toBe('t2');expect(input('預約位置').value).toBe('r2');expect(host.textContent).toContain('14:00–15:00');expect(host.textContent).toContain('整理至 15:15');
 await set('服務項目 1','s2');expect(host.textContent).toContain('14:00–15:30');expect(host.textContent).toContain('整理至 15:45');
 await act(async()=>root.unmount());root=createRoot(host);await mount();expect(input('預約位置').value).toBe('r1');
});
it('searches names or phones, distinguishes identical names and invalidates a prior customer as soon as a new query is typed',async()=>{
 await mount();await choose(1,'0900000002');await tick();expect(read.mock.calls.at(-1)![0].people[0].customerId).toBe('other');expect(button('確認預約').disabled).toBe(false);
 await act(async()=>input('顧客姓名 1').focus());await set('顧客姓名 1','尚未選定');expect(button('確認預約').disabled).toBe(true);expect(submit).not.toHaveBeenCalled();expect(input('使用方案 1').value).toBe('');
});
it('prioritizes valid expiring plans, automatically checks availability, and submits authoritative identity links without collecting payment',async()=>{
 await mount({customerId:'customer',coachId:'t1'});expect(input('使用方案 1').value).toBe('soon');expect([...input('使用方案 1').querySelectorAll('option')].map(o=>o.value)).toEqual(['soon','later','']);await tick();expect(read.mock.calls[0][0].requestKey).toMatch(/^[0-9a-f-]{36}$/);
 expect(host.textContent).toContain('方案使用 1 次');expect(host.textContent).toContain('應收 NT$ 0');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(submit).toHaveBeenCalledOnce();expect(submit.mock.calls[0][0]).toMatchObject({date:'2026-10-28',time:'14:00',policyRevision:3,people:[{customerId:'customer',serviceId:'s1',cardId:'soon',specifiedTechnicianId:'t1',specifiedLocationId:'r1'}]});expect(submit.mock.calls[0][0]).not.toHaveProperty('paid');expect(created).toHaveBeenCalledWith('2026-10-28');
});
it('shows each companion duration and explicit resource conflicts instead of silently moving another person',async()=>{
 await mount({customerId:'customer',coachId:'t1'});await act(async()=>button('＋新增同行者').click());await choose(2,'0900000002');await set('服務項目 2','s2');
 expect(host.textContent).toContain('位置與第 1 位重複');expect(host.textContent).toContain('14:00–15:30');expect(button('確認預約').disabled).toBe(true);
 await set('此位位置 2','r2');expect(host.textContent).toContain('技師與第 1 位重複');await set('此位技師 2','t2');await tick();expect(button('確認預約').disabled).toBe(false);
 expect(read.mock.calls.at(-1)![0].people[0].specifiedLocationId).toBe('r1');expect(read.mock.calls.at(-1)![0].people[1].specifiedLocationId).toBe('r2');
});
it('keeps an incompatible selected plan visible with an error and never silently falls back to a charge',async()=>{
 const data=source();data.cards=[{...card,serviceIds:['s1']}];await mount({customerId:'customer'},data);await set('服務項目 1','s2');expect(input('使用方案 1').value).toBe('soon');expect(host.textContent).toContain('此方案不適用');expect(button('確認預約').disabled).toBe(true);expect(submit).not.toHaveBeenCalled();
});
it('does not clear clicked inactive resources or select another one silently',async()=>{
 await mount({customerId:'customer',roomId:'inactive',coachId:'inactive'});expect(input('預約位置').value).toBe('inactive');expect(input('預約技師').value).toBe('inactive');expect(button('確認預約').disabled).toBe(true);await tick();expect(read).not.toHaveBeenCalled();
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
