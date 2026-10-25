// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import type {BeautyChargeDraft} from '@/lib/beauty/charge-editor';
import {BeautyChargeEditor,type BeautyChargePort} from '@/components/beauty/charge-editor';
vi.mock('@/server/actions/course-members',()=>({saveCourseCustomer:vi.fn()}));
vi.mock('@/server/actions/sports-staging',()=>({saveSportsFee:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/test/admin/dashboard/beauty',useRouter:()=>({refresh:vi.fn()})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const services=[{id:'s',name:'按摩',active:true,duration:60,buffer:15},{id:'f',name:'做臉',active:true,duration:90,buffer:10}];
const technicians=[{id:'t',name:'雅婷',active:true,serviceIds:['s']}];
let root:ReturnType<typeof createRoot>|undefined;
afterEach(()=>{act(()=>root?.unmount());document.body.replaceChildren();vi.restoreAllMocks();});
function field(name:string){const input=document.querySelector(`[name="${name}"]`);if(!input)throw Error('missing '+name);return input as HTMLInputElement;}
function mount(port?:BeautyChargePort,draft?:BeautyChargeDraft){const onClose=vi.fn();const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(h(BeautyChargeEditor,{storeId:'store',services,technicians,onClose,port,initialDraft:draft})));return onClose;}
function fill(name:string,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field(name),value);field(name).dispatchEvent(new Event('input',{bubbles:true}));});}
function selectByLabel(label:string,value:string){act(()=>{const el=document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});}
async function submit(){await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('single exposes trial minutes, plan removes trial fields and restores them when switching back',()=>{mount();expect(field('trialDuration')).toBeTruthy();selectByLabel('收費類型','plan');expect(document.querySelector('[name="trialDuration"]')).toBeNull();expect(field('points').min).toBe('2');selectByLabel('收費類型','single');expect(field('trialDuration')).toBeTruthy();});
it('preview submits only a local summary, preserving zero and inherited duration',async()=>{mount();fill('name','按摩');fill('price','1000');fill('trialPrice','0');act(()=>document.querySelector<HTMLInputElement>('[data-fee-coaches] input[type="checkbox"]')!.click());await submit();expect(document.querySelector('[role="alert"]')?.textContent).toContain('體驗 $0・60 分鐘');selectByLabel('服務項目','f');expect(document.querySelectorAll('[data-fee-coaches] input[type="checkbox"]').length).toBe(0);});
it('an unsupported persistence port cannot be called even with valid fields',async()=>{const save=vi.fn<BeautyChargePort['save']>();mount({perChargeTechnicians:false,save});fill('name','按摩');fill('price','1000');act(()=>document.querySelector<HTMLInputElement>('[data-fee-coaches] input[type="checkbox"]')!.click());await submit();expect(save).not.toHaveBeenCalled();expect(document.querySelector('[role="alert"]')?.textContent).toContain('未儲存');});

const savedSingle:BeautyChargeDraft={expectedStoreId:'store',kind:'single',serviceId:'s',name:'按摩單次',price:1000,sessions:1,trialPrice:null,trialMinutes:null,technicianIds:['t']};
it('allows explicitly removing a retired selected technician instead of trapping an invisible invalid ID',async()=>{mount(undefined,{...savedSingle,technicianIds:['t','deleted']});const label=[...document.querySelectorAll('label')].find(l=>l.textContent?.includes('已移除技師'));expect(label).toBeTruthy();act(()=>label!.querySelector<HTMLInputElement>('input')!.click());expect(document.body.textContent).not.toContain('已移除技師');await submit();expect(document.querySelector('[role="alert"]')?.textContent).toContain('僅核對');});
it('locks repeated submits while a real persistence port is pending',async()=>{let release!:(value:{success:boolean})=>void;const save=vi.fn<BeautyChargePort['save']>().mockImplementation(()=>new Promise(done=>{release=done;}));mount({perChargeTechnicians:true,save},savedSingle);await submit();await submit();expect(save).toHaveBeenCalledTimes(1);await act(async()=>{release({success:true});});});

it('closes an edited beauty charge without a discard prompt, but blocks closing while saving',async()=>{
 const confirm=vi.spyOn(window,'confirm');let release!:(value:{success:boolean;error?:string})=>void;
 const save=vi.fn<BeautyChargePort['save']>().mockImplementation(()=>new Promise(done=>{release=done;}));
 const onClose=mount({perChargeTechnicians:true,save},savedSingle);fill('name','修改收費名稱');
 const cancel=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='取消')!;
 act(()=>cancel.click());expect(onClose).toHaveBeenCalledTimes(1);expect(confirm).not.toHaveBeenCalled();
 await submit();act(()=>cancel.click());expect(onClose).toHaveBeenCalledTimes(1);
 await act(async()=>release({success:false,error:'測試保留草稿'}));
 act(()=>cancel.click());expect(onClose).toHaveBeenCalledTimes(2);expect(confirm).not.toHaveBeenCalled();
});

it('uses the shared plan fields without multiplying the total price by the number of sessions',async()=>{
 const save=vi.fn<BeautyChargePort['save']>().mockResolvedValue({success:true});
 mount({perChargeTechnicians:true,save},{expectedStoreId:'store',kind:'plan',serviceId:'s',name:'五次按摩',price:4500,sessions:5,validDays:90,allowShared:true,technicianIds:['t']});
 expect(document.querySelector('#course-member-form')).toBeTruthy();
 expect(document.body.textContent).toContain('NT$ 900／次');
 expect(document.body.textContent).not.toContain('／堂');
 expect(field('points').closest('label')?.textContent).toContain('總次數');
 expect(document.querySelector('[name="trialPrice"]')).toBeNull();
 await submit();expect(save).toHaveBeenCalledWith(expect.objectContaining({kind:'plan',price:4500,sessions:5,validDays:90,allowShared:true,technicianIds:['t']}));
});
it('retains the same draft after an uncertain save and prevents closing until its result is confirmed',async()=>{
 const save=vi.fn<BeautyChargePort['save']>().mockRejectedValueOnce(Error('lost response')).mockResolvedValueOnce({success:true});
 const onClose=mount({perChargeTechnicians:true,save},savedSingle);
 await submit();expect(document.querySelector('[role="alert"]')?.textContent).toContain('尚未確認');
 const cancel=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='取消')!;
 act(()=>cancel.click());expect(onClose).not.toHaveBeenCalled();
 await submit();expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows a readable required-technician validation instead of a JSON issue dump',async()=>{mount();fill('name','按摩');fill('price','1000');await submit();const text=document.querySelector('[role="alert"]')?.textContent??'';expect(text).toContain('請至少選一位可安排技師');expect(text).not.toContain('too_small');expect(text).not.toContain('"path"');});

it('submits a configured store fixed fee and preserves it when editing',async()=>{const save=vi.fn<BeautyChargePort['save']>().mockResolvedValue({success:false,error:'合成資料保留'});mount({perChargeTechnicians:true,save},{...savedSingle,storeCost:300});expect((document.querySelector('[aria-label="店家固定費用"]') as HTMLInputElement).value).toBe('300');await submit();expect(save).toHaveBeenCalledWith(expect.objectContaining({storeCost:300}));});
