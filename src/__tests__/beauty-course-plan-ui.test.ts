// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {OperationScope} from '@/components/operations/operation-scope';
import {CoursePlanDraftForm,type Plan} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
const m=vi.hoisted(()=>({save:vi.fn(),course:vi.fn(),refresh:vi.fn()}));
vi.mock('@/server/actions/course-members',()=>({saveCourseCustomer:m.course}));
vi.mock('@/server/actions/sports-staging',()=>({saveSportsFee:m.course}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/test/admin/dashboard/beauty',useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{sessionStorage.clear();vi.resetAllMocks();vi.stubGlobal('fetch',m.course);m.save.mockResolvedValue({success:false,error:'保留輸入'});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(plan:Plan|null=null){await act(async()=>root.render(React.createElement(OperationScope,{scope:'user:test:beauty'},React.createElement(CoursePlanDraftForm,{storeId:'store',plan,templates:[{id:'s',name:'做臉',category:'保養',isActive:true}],termSessions:[],profitEnabled:false,catalog:{save:m.save},onPending:()=>{},onSaved:()=>{}}))));}
async function set(selector:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLSelectElement>(selector)!;expect(el,selector).toBeTruthy();const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('uses the existing plan form without preset quota or price and submits service scope plus sharing',async()=>{
 await mount();await set('select[aria-label="收費類型"]','plan');for(const name of ['points','price','days'])expect(host.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value).toBe('');
 expect(host.textContent).not.toContain('計費方式');expect(host.querySelector('select[name="unit"]')).toBeNull();
 for(const [name,value] of Object.entries({name:'七次保養',points:'7',price:'6500',days:'80'}))await set(`[name="${name}"]`,value);
 await act(async()=>host.querySelector<HTMLInputElement>('[name="allowShared"]')!.click());await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"][value="s"]')!.click());await submit();
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({catalogKind:'plan',name:'七次保養',points:7,price:6500,validDays:80,templateIds:['s'],allowShared:true,unit:'SESSION'}),null);expect(m.course).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('[name="points"]')!.value).toBe('7');expect(host.textContent).toContain('保留輸入');
});
it('edits trial pricing in the shared form, with no hidden required name or scheme fields blocking submit',async()=>{
 const plan:Plan={id:'trial:s',name:'做臉',points:1,price:500,validDays:0,isActive:true,unit:'SESSION',templateIds:['s'],catalogKind:'trial',catalogRevision:3};await mount(plan);await set('[name="price"]','');expect(host.querySelector<HTMLInputElement>('[name="name"]')!.disabled).toBe(true);expect(host.querySelector('[name="points"]')).toBeNull();expect(host.querySelector('[name="days"]')).toBeNull();expect(host.querySelector<HTMLInputElement>('[name="price"]')!.required).toBe(false);await submit();expect(m.save).toHaveBeenCalledWith(expect.objectContaining({catalogKind:'trial',catalogPriceValue:'',templateIds:['s']}),plan);expect(m.course).not.toHaveBeenCalled();
});
it('opens new charging directly with the full unfilled session-plan fields',async()=>{
 await mount();
 expect(host.querySelector<HTMLSelectElement>('select[aria-label="收費類型"]')!.value).toBe('plan');
 for(const name of ['name','points','price','days']){const input=host.querySelector<HTMLInputElement>(`[name="${name}"]`)!;expect(input,name).toBeTruthy();expect(input.disabled,name).toBe(false);expect(input.value,name).toBe('');}
 expect(host.querySelector('[name="allowShared"]')).toBeTruthy();
 expect(m.course).not.toHaveBeenCalled();
});
