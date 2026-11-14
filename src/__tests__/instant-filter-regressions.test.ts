// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {beforeEach, afterEach, it, expect, vi} from "vitest";
const m=vi.hoisted(()=>({replace:vi.fn(),navigate:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:m.replace}),usePathname:()=>"/s/fixture/admin/dashboard/customers/customer/records"}));
vi.mock("@/components/dashboard-link",()=>({resolveDashboardHref:(href:string,path:string)=>href.replace(/^\/dashboard/,path.startsWith('/s/')?'/s/fixture/admin/dashboard':'/dashboard'),DashboardLink:({children,...props}:React.ComponentProps<'a'>)=>React.createElement('a',props,children)}));
import {CourseAgreementRecordsWorkspace} from "@/components/course-agreements/records";
import {courseAgreementRecordsFilterSchema} from "@/lib/course-agreement-records";
import {InstantFilterForm} from "@/components/instant-filter-form";
import {SettingsPanelContext} from "@/components/admin/settings-panel-context";
import {CustomerConsumptionFilters} from "@/app/(dashboard)/dashboard/customers/[id]/records/customer-consumption-filters";
import {CashbookRecordFilters} from "@/app/(dashboard)/dashboard/cashbook/_components/cashbook-record-filters";
import {ConsumptionSortSelect, ConsumptionFiltersForm} from "@/app/(dashboard)/dashboard/growth/consumption/consumption-filters";
import {parseConsumptionFilters} from "@/lib/customer-consumption";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();vi.clearAllMocks();window.history.replaceState({},'', '/s/fixture/admin/dashboard/customers/customer/records?type=transactions&page=8&scope=fixture');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(node:React.ReactNode){await act(async()=>root.render(node));}
async function change(selector:string,value:string){await act(async()=>{const input=document.querySelector(selector) as HTMLInputElement;const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function tick(ms=350){await act(async()=>vi.advanceTimersByTime(ms));}
function params(){return new URL(String(m.replace.mock.lastCall![0]),window.location.origin).searchParams;}
function basic(){return React.createElement(InstantFilterForm,{preserveQuery:true},React.createElement('input',{name:'q'}),React.createElement('a',{href:'?scope=fixture',onClick:(event:React.MouseEvent)=>event.preventDefault()},'清除'));}
it('waits for Chinese composition and sends the completed query once',async()=>{await mount(basic());const input=host.querySelector('input')!;await act(async()=>input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await change('input','注音');await tick(1000);expect(m.replace).not.toHaveBeenCalled();await act(async()=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await tick();expect(m.replace).toHaveBeenCalledTimes(1);expect(params().get('q')).toBe('注音');expect(params().get('scope')).toBe('fixture');expect(params().has('page')).toBe(false);});
it('clearing navigation cancels a queued keyword and resets to new server defaults',async()=>{await mount(basic());await change('input','舊字');await act(async()=>host.querySelector('a')!.click());await tick();expect(m.replace).not.toHaveBeenCalled();await mount(basic());expect(host.querySelector('input')!.value).toBe('');});
it('does not erase a newer draft when an earlier server response renders',async()=>{await mount(basic());await change('input','王');await tick();await change('input','王小姐');await mount(basic());await tick();expect(params().get('q')).toBe('王小姐');});
it('uses the embedded settings panel destination and keeps hidden tab scope',async()=>{await mount(React.createElement(SettingsPanelContext.Provider,{value:{navigate:m.navigate,report:()=>{}}},React.createElement(InstantFilterForm,{action:'/dashboard/reminders',panelAware:true},React.createElement('input',{name:'tab',type:'hidden',value:'logs'}),React.createElement('input',{name:'q'}))));await change('input[name=q]','通知');await tick();expect(m.replace).not.toHaveBeenCalled();expect(m.navigate).toHaveBeenCalledWith(expect.stringContaining('/s/fixture/admin/dashboard/reminders?'));expect(new URL(m.navigate.mock.lastCall![0],location.origin).searchParams.get('tab')).toBe('logs');});
it('merges customer keyword and type in one request, including the explicit all-time option',async()=>{await mount(React.createElement(CustomerConsumptionFilters,{initial:{range:'3m',kind:'all',payment:'all',keyword:'',from:'',to:''},typeOptions:[{value:'PLAN',label:'方案'}]}));await change('input[name=q]','課程');await change('select[name=kind]','PLAN');await change('select[name=range]','all');await tick();expect(params().get('q')).toBe('課程');expect(params().get('kind')).toBe('PLAN');expect(params().get('range')).toBe('all');expect(params().get('type')).toBe('transactions');expect(params().get('scope')).toBe('fixture');});
it('retains queued keyword and cashbook category through rapid month changes',async()=>{await mount(React.createElement(CashbookRecordFilters,{month:'2026-11',kind:'',keyword:''}));await change('input:not([type=month])','王');await change('select','retail');await change('input[type=month]','2026-10');await tick();expect(params().get('q')).toBe('王');expect(params().get('categoryGroup')).toBe('retail');expect(params().get('type')).toBe('INCOME');expect(params().get('month')).toBe('2026-10');expect(String(m.replace.mock.lastCall![0])).toContain('#cashbook-records');});
it('auto-updates advanced consumption filters without closing the dialog, removes a condition, and blocks reversed ranges',async()=>{
 const filters=parseConsumptionFilters({},'2026-11-14');const node=()=>React.createElement(ConsumptionFiltersForm,{filters,params:{},options:[],staffOptions:[],metrics:['count','paid']});await mount(node());await change('input[name=q]','學員');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='篩選')!.click());await change('input[aria-label="消耗次數最低值"]','3');await tick();expect(params().get('count_min')).toBe('3');expect(params().get('q')).toBe('學員');expect(document.querySelector('[role=dialog]')).not.toBeNull();await mount(node());expect(document.querySelector('[role=dialog]')).not.toBeNull();m.replace.mockClear();await change('input[aria-label="消耗次數最高值"]','2');await tick();expect(m.replace).not.toHaveBeenCalled();expect(document.querySelector('[role=dialog]')!.textContent).toContain('最高值不能小於最低值');await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="移除條件 1"]')!.click());await tick();expect(params().has('count_min')).toBe(false);expect(params().get('q')).toBe('學員');
});
it('changing sort includes the pending keyword and does not let its old timer restore the old sort',async()=>{const filters=parseConsumptionFilters({},'2026-11-14');await mount(React.createElement(React.Fragment,null,React.createElement(ConsumptionFiltersForm,{filters,params:{},options:[],staffOptions:[],metrics:['count','paid']}),React.createElement(ConsumptionSortSelect,{filters,metrics:['count','paid']})));await change('input[name=q]','最新學員');await change('select[aria-label="排序方式"]','paid:asc');await tick();expect(m.replace).toHaveBeenCalledTimes(1);expect(params().get('q')).toBe('最新學員');expect(params().get('sort')).toBe('paid');expect(params().get('direction')).toBe('asc');expect(params().has('sortDirection')).toBe(false);});
it.each(['COURSE','BEAUTY'] as const)('preserves the authorized store and module route for %s agreement searching',async module=>{await mount(React.createElement(CourseAgreementRecordsWorkspace,{data:null,filters:courseAgreementRecordsFilterSchema.parse({storeId:'authorized-store'}),canExport:false,module}));await change('input[name=q]','合成顧客');await tick();expect(params().get('storeId')).toBe('authorized-store');expect(params().get('q')).toBe('合成顧客');expect(String(m.replace.mock.lastCall![0])).toContain(module==='BEAUTY'?'/beauty/agreements/records?':'/courses/agreements/records?');});
it('clear removes hidden advanced conditions after an intermediate render and a subsequent search',async()=>{
 const oldParams={q:'舊關鍵字',staffId:'__unassigned__',count_min:'3',top:'10',includeAbsent:'0',preset:'90',sort:'paid',direction:'asc'};
 const initial=parseConsumptionFilters(oldParams,'2026-11-14'),cleared=parseConsumptionFilters({},'2026-11-14');
 const node=(filters:typeof initial,raw:typeof oldParams|Record<string,string>)=>React.createElement(React.Fragment,null,React.createElement(ConsumptionFiltersForm,{filters,params:raw,options:[],staffOptions:[],metrics:['count','paid']}),React.createElement(ConsumptionSortSelect,{filters,metrics:['count','paid']}));
 await mount(node(initial,oldParams));
 const clear=host.querySelector<HTMLAnchorElement>('a')!;clear.addEventListener('click',e=>e.preventDefault());
 await act(async()=>clear.click());
 await mount(node(initial,{...oldParams}));
 await mount(node(cleared,{}));
 m.replace.mockClear();await change('input[name=q]','新關鍵字');await tick();
 expect(params().get('q')).toBe('新關鍵字');expect(params().has('staffId')).toBe(false);expect(params().has('count_min')).toBe(false);expect(params().has('top')).toBe(false);expect(params().get('includeAbsent')).toBe('1');expect(params().get('preset')).toBe('month');expect(params().get('sort')).toBe('count');expect(params().get('direction')).toBe('desc');
});
it('clear also discards local advanced edits before their server response has arrived',async()=>{
 const filters=parseConsumptionFilters({},'2026-11-14');const node=()=>React.createElement(ConsumptionFiltersForm,{filters,params:{},options:[],staffOptions:[],metrics:['count','paid']});await mount(node());
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-haspopup=dialog]')!.click());await change('input[aria-label="消耗次數最低值"]','3');await tick();
 const clear=host.querySelector<HTMLAnchorElement>('a')!;clear.addEventListener('click',e=>e.preventDefault());await act(async()=>clear.click());await mount(node());m.replace.mockClear();await change('input[name=q]','再次查詢');await tick();
 expect(params().has('count_min')).toBe(false);expect(params().get('q')).toBe('再次查詢');
});
it('repeating the same pasted query after native reset still triggers automatic searching',async()=>{
 const node=(query:string)=>React.createElement(InstantFilterForm,null,React.createElement('input',{name:'q',defaultValue:query}),React.createElement('a',{href:'?clear=1',onClick:(e:React.MouseEvent)=>e.preventDefault()},'清除'));
 await mount(node(''));await change('input[name=q]','同一關鍵字');await tick();await act(async()=>host.querySelector('a')!.click());await mount(node(''));m.replace.mockClear();await change('input[name=q]','同一關鍵字');await tick();expect(m.replace).toHaveBeenCalledTimes(1);expect(params().get('q')).toBe('同一關鍵字');
});
