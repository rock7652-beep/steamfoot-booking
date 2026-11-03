// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ServiceScheduleFields,type ServiceRentalSource} from '@/components/admin/service-schedule-fields';
import type {ServiceReservationSource} from '@/components/admin/service-reservation-form';
const m=vi.hoisted(()=>({save:vi.fn(),create:vi.fn(),guard:vi.fn(),created:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/server/actions/course-rental',()=>({saveCourseRental:m.save,createRentalCustomer:m.create,getCourseRental:vi.fn(),cancelCourseRental:vi.fn(),saveRentalPayment:vi.fn(),listRoomRentals:vi.fn()}));
let host:HTMLDivElement,root:Root;
const source:ServiceReservationSource={itemEntitlements:true,services:[{id:'s',name:'按摩',duration:30,buffer:5,price:250,trialPrice:150,revision:1}],technicians:[{id:'t',name:'技師',serviceIds:['s']}],locations:[{id:'regular',name:'床位2'},{id:'free',name:'床位1'}],customers:[],cards:[],policyRevision:1,readAvailability:vi.fn(),submit:vi.fn()};
const rental:ServiceRentalSource={module:'beauty',rooms:[{id:'regular',name:'床位2',isActive:true,rentalEnabled:false,rentalHourlyRate:0},{id:'free',name:'床位1',isActive:true,rentalEnabled:true,rentalHourlyRate:0},{id:'paid',name:'收費空間',isActive:true,rentalEnabled:true,rentalHourlyRate:600},{id:'off',name:'停用位置',isActive:false,rentalEnabled:true,rentalHourlyRate:600}],customers:[],permissions:{create:true,customerRead:true,customerCreate:true,collect:true,correct:true,edit:true}};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.save.mockResolvedValue({success:true,id:'rent'});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(options:{rental?:ServiceRentalSource;roomId?:string}={}){await act(async()=>root.render(createElement(ServiceScheduleFields,{source,rental:options.rental??rental,date:'2026-11-03',seed:{time:'12:30',roomId:options.roomId??'free'},onGuard:m.guard,onCreated:m.created})));}
function field(selector:string){return host.querySelector<HTMLInputElement|HTMLSelectElement>(selector)!;}
async function set(selector:string,value:string){const el=field(selector);await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function mode(value='rental'){await set('[aria-label="安排類型"]',value);}
async function save(){await act(async()=>host.querySelectorAll('form')[1].dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('shows the rental mode for enabled beds and submits a free rental using the clicked date/time/room through the Beauty writer',async()=>{
 await mount();expect(host.textContent).toContain('空間出租');await mode();
 expect(field('input[name="date"]').value).toBe('2026-11-03');expect(field('input[name="time"]').value).toBe('12:30');
 const rooms=host.querySelectorAll('form')[1].querySelector('select')!;expect([...rooms.options].map(o=>o.value)).toEqual(['','free','paid']);expect(rooms.value).toBe('free');
 await set('[name="name"]','租借測試');await set('[name="phone"]','0900000003');await save();
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({roomId:'free',date:'2026-11-03',time:'12:30',amount:0,durationMinutes:60,calendar:false,repeatWeeks:1,customerName:'租借測試',customerPhone:'0900000003'}),'beauty');expect(m.created).toHaveBeenCalledWith('2026-11-03');expect(source.submit).not.toHaveBeenCalled();
});
it('falls back to a rentable bed when the clicked location is not enabled for rentals',async()=>{await mount({roomId:'regular'});await mode();expect(host.querySelectorAll('form')[1].querySelector('select')!.value).toBe('free');});
it('preserves both drafts through switches and reports the rental date actually saved',async()=>{
 await mount();await set('[aria-label="預約開始時間"]','13:00');await mode();await set('[name="date"]','2026-11-04');await set('[name="time"]','15:30');await set('[name="name"]','租借測試');await set('[name="phone"]','0900000003');
 await mode('service');expect(field('[aria-label="預約開始時間"]').value).toBe('13:00');await mode();expect(field('[name="date"]').value).toBe('2026-11-04');expect(field('[name="time"]').value).toBe('15:30');expect(field('[name="name"]').value).toBe('租借測試');
 await save();expect(m.created).toHaveBeenCalledWith('2026-11-04');
});
it('retains rental inputs after conflict and retries with the same request key',async()=>{
 m.save.mockResolvedValueOnce({success:false,error:'床位已有服務預約'});await mount();await mode();await set('[name="name"]','租借測試');await set('[name="phone"]','0900000003');await save();expect(m.created).not.toHaveBeenCalled();expect(host.textContent).toContain('床位已有服務預約');expect(field('[name="name"]').value).toBe('租借測試');
 await save();expect(m.save.mock.calls[0][0].requestKey).toBe(m.save.mock.calls[1][0].requestKey);expect(m.created).toHaveBeenCalledOnce();
});
it.each([false,true])('disables unavailable rentals when create permission is %s',async create=>{
 await mount({rental:{...rental,rooms:create?rental.rooms.filter(r=>!r.rentalEnabled):rental.rooms,permissions:{...rental.permissions,create}}});
 expect(host.querySelector<HTMLOptionElement>('option[value="rental"]')!.disabled).toBe(true);expect(host.querySelectorAll('form')).toHaveLength(1);expect(host.textContent).toContain(create?'尚無開放出租的位置':'沒有新增空間出租的權限');
});
it('blocks switching and double submits while reporting pending with the shared guard argument order',async()=>{
 let finish!:(value:unknown)=>void;m.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await mount();await mode();await set('[name="name"]','租借測試');await set('[name="phone"]','0900000003');
 await act(async()=>{host.querySelectorAll('form')[1].dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));host.querySelectorAll('form')[1].dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(m.save).toHaveBeenCalledOnce();expect(field('[aria-label="安排類型"]').disabled).toBe(true);expect(m.guard).toHaveBeenLastCalledWith(true,true);
 await act(async()=>finish({success:false,error:'衝突'}));expect(field('[aria-label="安排類型"]').disabled).toBe(false);expect(m.guard).toHaveBeenLastCalledWith(true,false);
});
it('selects trial once at the top, preserves the customer/time draft and omits plan copy',async()=>{
 const data={...source,customers:[{id:'customer',name:'測試顧客',phone:'0900000001'}]};
 await act(async()=>root.render(createElement(ServiceScheduleFields,{source:data,rental,date:'2026-11-03',seed:{time:'12:30',customerId:'customer'},onGuard:m.guard,onCreated:m.created})));
 await mode('trial');expect(field('[aria-label="顧客姓名 1"]').value).toContain('測試顧客');expect(field('[aria-label="預約開始時間"]').value).toBe('12:30');expect(host.querySelector('[aria-label="服務類型 1"]')).toBeNull();expect(host.textContent).toContain('體驗 NT$ 150');expect(host.textContent).not.toContain('本期剩餘');expect(host.textContent).not.toContain('先買先扣');expect(host.textContent).not.toContain('方案使用');
 await mode('service');expect(field('[aria-label="顧客姓名 1"]').value).toContain('測試顧客');expect(field('[aria-label="預約開始時間"]').value).toBe('12:30');expect(host.textContent).toContain('NT$ 250');
});
it('keeps a companion type independent while the first guest follows the top-level trial choice',async()=>{
 const data={...source,customers:[{id:'customer',name:'測試顧客',phone:'0900000001'}]};
 await act(async()=>root.render(createElement(ServiceScheduleFields,{source:data,rental,date:'2026-11-03',seed:{time:'12:30',customerId:'customer'},onGuard:m.guard,onCreated:m.created})));
 await mode('trial');await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='＋新增同行者')!.click());
 expect(field('[aria-label="服務類型 2"]').value).toBe('__trial__');await set('[aria-label="服務類型 2"]','');expect(field('[aria-label="服務類型 2"]').value).toBe('');expect(host.querySelector('[aria-label="服務類型 1"]')).toBeNull();expect(host.textContent).toContain('應收 NT$ 400');
});
