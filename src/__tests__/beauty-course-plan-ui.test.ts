// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {OperationScope} from '@/components/operations/operation-scope';
import {CoursePlanDraftForm} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
const m=vi.hoisted(()=>({save:vi.fn(),course:vi.fn(),refresh:vi.fn()}));
vi.mock('@/server/actions/course-members',()=>({saveCourseCustomer:m.course}));
vi.mock('@/server/actions/sports-staging',()=>({saveSportsFee:m.course}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/test/admin/dashboard/beauty',useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{sessionStorage.clear();vi.resetAllMocks();vi.stubGlobal('fetch',m.course);m.save.mockResolvedValue({success:false,error:'保留輸入'});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function set(selector:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLSelectElement>(selector)!;expect(el,selector).toBeTruthy();const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('uses the native sports fee interface and sends its service relation to the supplied core, without the three-kind UI or course writes',async()=>{
 const snapshot={storeId:'store',subjects:[{id:'s',name:'做臉',category:'保養',active:true,updatedAt:'1'}],fees:[],lessons:[],students:[],customers:[],coaches:[],rooms:[],date:'2026-10-23'};
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'user:test:beauty'},React.createElement(CoursePlanDraftForm,{storeId:'store',plan:null,subjectLabel:'服務項目',templates:[{id:'s',name:'做臉',category:'保養',isActive:true}],subjects:[{id:'s',name:'做臉',category:'保養',isActive:true}],sportsData:snapshot,termSessions:[],profitEnabled:false,catalog:{save:m.save},onPending:()=>{},onSaved:()=>{}}))));
 expect(host.querySelector('[aria-label="收費類型"]')).toBeNull();
 expect(host.querySelector('[aria-label="方案適用方式"]')).toBeTruthy();
 expect(host.querySelector<HTMLSelectElement>('[aria-label="服務項目"]')!.value).toBe('s');
 const billing=[...host.querySelectorAll('select')].find(s=>s.querySelector('option[value="SESSION"]'))!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(billing,'SESSION');billing.dispatchEvent(new Event('change',{bubbles:true}));});
 await set('[name="name"]','六次服務');await set('[name="points"]','6');await set('[name="price"]','5400');await set('[name="days"]','90');await submit();
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({sportsMode:'ASSIGNED',subjectId:'s',templateIds:['s'],unit:'SESSION',points:6,price:5400}),null);
 expect(m.course).not.toHaveBeenCalled();
});
it('keeps the complete native sports fee markup unchanged when a Beauty writer is supplied',async()=>{
 const props={storeId:'store',plan:null,templates:[{id:'s',name:'項目',category:'分類',isActive:true}],subjects:[{id:'s',name:'項目',category:'分類',isActive:true}],sportsData:{storeId:'store',subjects:[{id:'s',name:'項目',category:'分類',active:true,updatedAt:'1'}],fees:[],lessons:[],students:[],customers:[],coaches:[],rooms:[],date:'2026-10-23'},termSessions:[],profitEnabled:false,onPending:()=>{},onSaved:()=>{}};
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'parity:sports'},React.createElement(CoursePlanDraftForm,props))));
 const sports=host.innerHTML;
 await act(async()=>root.render(React.createElement(OperationScope,{scope:'parity:beauty'},React.createElement(CoursePlanDraftForm,{...props,catalog:{save:m.save}}))));
 expect(host.innerHTML).toBe(sports);expect(m.course).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
