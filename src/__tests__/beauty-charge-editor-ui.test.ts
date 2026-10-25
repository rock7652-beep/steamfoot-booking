// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import type {BeautyChargeDraft} from '@/lib/beauty/charge-editor';
import {BeautyChargeEditor,type BeautyChargePort} from '@/components/beauty/charge-editor';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const services=[{id:'s',name:'按摩',active:true,duration:60,buffer:15},{id:'f',name:'做臉',active:true,duration:90,buffer:10}];
const technicians=[{id:'t',name:'雅婷',active:true,serviceIds:['s']}];
let root:ReturnType<typeof createRoot>|undefined;
afterEach(()=>{act(()=>root?.unmount());document.body.replaceChildren();vi.restoreAllMocks();});
function field(name:string){const input=document.querySelector(`[name="${name}"]`);if(!input)throw Error('missing '+name);return input as HTMLInputElement;}
function mount(port?:BeautyChargePort,draft?:BeautyChargeDraft){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(h(BeautyChargeEditor,{storeId:'store',services,technicians,onClose:vi.fn(),port,initialDraft:draft})));}
function fill(name:string,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field(name),value);field(name).dispatchEvent(new Event('input',{bubbles:true}));});}
function select(index:number,value:string){act(()=>{const el=document.querySelectorAll('select')[index];el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});}
async function submit(){await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('single exposes trial minutes, plan removes trial fields and restores them when switching back',()=>{mount();expect(field('trialMinutes')).toBeTruthy();select(0,'plan');expect(document.querySelector('[name="trialMinutes"]')).toBeNull();expect(field('sessions').min).toBe('2');select(0,'single');expect(field('trialMinutes')).toBeTruthy();});
it('preview submits only a local summary, preserving zero and inherited duration',async()=>{mount();fill('name','按摩');fill('price','1000');fill('trialPrice','0');act(()=>document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await submit();expect(document.querySelector('[role="status"]')?.textContent).toContain('體驗 $0・60 分鐘');select(1,'f');expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);});
it('an unsupported persistence port cannot be called even with valid fields',async()=>{const save=vi.fn<BeautyChargePort['save']>();mount({perChargeTechnicians:false,save});fill('name','按摩');fill('price','1000');act(()=>document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await submit();expect(save).not.toHaveBeenCalled();expect(document.querySelector('[role="alert"]')?.textContent).toContain('未儲存');});

const savedSingle:BeautyChargeDraft={expectedStoreId:'store',kind:'single',serviceId:'s',name:'按摩單次',price:1000,sessions:1,trialPrice:null,trialMinutes:null,technicianIds:['t']};
it('allows explicitly removing a retired selected technician instead of trapping an invisible invalid ID',async()=>{mount(undefined,{...savedSingle,technicianIds:['t','deleted']});const label=[...document.querySelectorAll('label')].find(l=>l.textContent?.includes('已移除技師'));expect(label).toBeTruthy();act(()=>label!.querySelector<HTMLInputElement>('input')!.click());expect(document.body.textContent).not.toContain('已移除技師');await submit();expect(document.querySelector('[role="status"]')?.textContent).toContain('僅核對');});
it('locks repeated submits while a real persistence port is pending',async()=>{let release!:(value:{success:boolean})=>void;const save=vi.fn<BeautyChargePort['save']>().mockImplementation(()=>new Promise(done=>{release=done;}));mount({perChargeTechnicians:true,save},savedSingle);await submit();await submit();expect(save).toHaveBeenCalledTimes(1);await act(async()=>{release({success:true});});});
