// @vitest-environment jsdom
import {act} from 'react';
import {jsx} from 'react/jsx-runtime';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {nextCustomerLabelRevision, type LabelSnapshot} from '@/lib/customer-labels';
const m=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),error:vi.fn()}));
vi.mock('@/server/actions/customer-labels',()=>({loadCustomerLabels:m.load,setCustomerLabel:m.save}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard/customers',useRouter:()=>({replace:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:()=>null}));
vi.mock('sonner',()=>({toast:{error:m.error}}));
import {CustomerLabelsProvider,CustomerLabels,CustomerLabelsSeed,CustomerLabelPicker,useCustomerLabelSnapshot,useSeedCustomerLabels} from '@/components/customer-labels';
const data:LabelSnapshot={available:true,enabled:true,canEdit:true,canManage:true,categories:[{id:'cat',name:'需求',number:1,position:0,active:true}],labels:[{id:'a',name:'初次',categoryId:'cat',active:true},{id:'b',name:'常客',categoryId:'cat',active:true},{id:'c',name:'重點',categoryId:'cat',active:true}],assignments:{customer:['a','b','c']}};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.load.mockResolvedValue(data);m.save.mockResolvedValue({success:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(initial=data,readOnly=false){await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial,children:jsx(CustomerLabels,{customerId:"customer",readOnly})},String(initial.enabled))));}
async function click(label:string){const button=document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);expect(button).toBeTruthy();await act(async()=>button!.click());}
it('shares the controlled picker and loads assignments even when a customer row is filtered out',async()=>{
 vi.useFakeTimers();
 const change=vi.fn();
 function Workspace(){const snapshot=useCustomerLabelSnapshot(['customer','hidden']);return jsx('div',{children:[jsx(CustomerLabelPicker,{value:'a',onChange:change}),jsx('output',{children:snapshot.assignments.hidden?.join(',')??'loading'})]});}
 try {
  m.load.mockResolvedValue({...data,assignments:{customer:['a'],hidden:['b']}});
  await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:data,children:jsx(Workspace,{})})));
  expect(host.querySelector('select')?.value).toBe('a');
  await act(async()=>vi.advanceTimersByTimeAsync(40));
  expect(m.load).toHaveBeenCalledWith(['hidden']);
  expect(host.querySelector('output')?.textContent).toBe('b');
  const picker=host.querySelector('select')!;
  await act(async()=>{picker.value='b';picker.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(change).toHaveBeenCalledWith('b');
 } finally {vi.useRealTimers();}
});
it('shows two labels and remaining count, and portals the dialog outside a clipped row',async()=>{await render();expect(host.textContent).toContain('＋1');expect(host.textContent).toContain('＋標籤');expect(host.textContent).not.toContain('重點');await click('查看或修改顧客標籤');expect(document.querySelector('[role="dialog"]')).toBeTruthy();expect(host.querySelector('[role="dialog"]')).toBeNull();});
it('updates immediately, retains the dialog, and rolls back failed saves',async()=>{await render();await click('查看或修改顧客標籤');let finish!:(v:{success:boolean,error:string})=>void;m.save.mockReturnValue(new Promise(resolve=>finish=resolve));const button=[...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find(b=>b.textContent?.includes('重點'))!;await act(async()=>button.click());expect(host.textContent).not.toContain('＋1');expect(document.querySelector('[role="dialog"]')).toBeTruthy();await act(async()=>finish({success:false,error:'失敗'}));expect(host.textContent).toContain('＋1');expect(m.error).toHaveBeenCalledWith('失敗');expect(m.save).toHaveBeenCalledWith({customerId:'customer',labelId:'c',selected:false});});
it('hides disabled tags without deleting and exposes no writable buttons to readonly users',async()=>{await render({...data,enabled:false});expect(host.textContent).toBe('');expect(m.save).not.toHaveBeenCalled();await render(data,true);await click('查看或修改顧客標籤');expect([...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].every(b=>b.disabled)).toBe(true);});

it("keeps the menu open while scrolling its labels, but closes when the surrounding list scrolls",async()=>{await render();await click("查看或修改顧客標籤");const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;expect(dialog.className).toContain("z-[200]");expect(dialog.querySelector("input")?.autofocus).toBe(false);await act(async()=>dialog.querySelector("span")!.dispatchEvent(new Event("scroll")));expect(document.querySelector('[role="dialog"]')).toBeTruthy();await act(async()=>host.dispatchEvent(new Event("scroll")));expect(document.querySelector('[role="dialog"]')).toBeNull();});
it('uses quiet dot labels without an add button and opens all labels on touch',async()=>{
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:data,children:jsx(CustomerLabels,{customerId:'customer',variant:'dots'})})));
 expect(host.textContent).toContain('＋標籤');expect(host.textContent).toContain('＋1');
 expect(host.querySelector('.bg-orange-500')).toBeTruthy();
 await click('查看或修改顧客標籤');expect(document.querySelector('[role="dialog"]')?.textContent).toContain('重點');
});
it('keeps an add entry for editable empty labels and hides it in display-only lists',async()=>{
 const empty={...data,assignments:{customer:[]}};m.load.mockResolvedValue(empty);
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:empty,children:jsx(CustomerLabels,{customerId:'customer',variant:'dots'})})));
 expect(host.textContent).toBe('＋標籤');expect(host.querySelector('button')).toBeTruthy();
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:empty,children:jsx(CustomerLabels,{customerId:'customer',variant:'dots',displayOnly:true})})));
 expect(host.textContent).toBe('');expect(host.querySelector('button')).toBeNull();
});

it('fits up to five labels and reserves the overflow count when the column narrows',async()=>{
 const many={...data,labels:Array.from({length:6},(_,i)=>({id:String(i),name:`標籤${i}`,categoryId:'cat',active:true})),assignments:{customer:['0','1','2','3','4','5']}};
 m.load.mockResolvedValue(many);
 let width=320,resize=()=>{};
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resize=callback;}observe(){}disconnect(){}});
 const rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return {width:this.classList.contains('overflow-hidden')?width:this.textContent?.startsWith('＋')?22:40,height:20,x:0,y:0,top:0,left:0,right:40,bottom:20,toJSON(){}};});
 try {
  await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:many,children:jsx(CustomerLabels,{customerId:'customer',maxVisible:5})})));
  const visible=()=>host.querySelector('button > span')!;
  expect(visible().querySelectorAll(':scope > span:not([aria-hidden])').length).toBe(6);
  expect(visible().children[5].textContent).toBe('＋1');
  width=140;await act(async()=>resize());
  expect(visible().children[2].textContent).toBe('＋4');
  await click('查看或修改顧客標籤');expect(document.querySelector('[role="dialog"]')?.textContent).toContain('標籤5');
 } finally {rect.mockRestore();vi.unstubAllGlobals();}
});

it('uses server-supplied row assignments immediately without a second client request',async()=>{
 vi.useFakeTimers();
 try {
  await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:{...data,assignments:{}},children:jsx(CustomerLabelsSeed,{initial:data,children:jsx(CustomerLabels,{customerId:'customer'})})})));
  expect(host.textContent).toContain('初次');expect(host.querySelector('[aria-label="標籤載入中"]')).toBeNull();
  await act(async()=>vi.advanceTimersByTimeAsync(50));expect(m.load).not.toHaveBeenCalled();
 } finally {vi.useRealTimers();}
});
it('retains cached labels when remounting a roster and refreshes in place after expiry',async()=>{
 vi.useFakeTimers();
 try {
  await render();await act(async()=>vi.advanceTimersByTimeAsync(40));expect(m.load).not.toHaveBeenCalled();
  await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:data,children:null})));
  await render();expect(host.textContent).toContain('初次');await act(async()=>vi.advanceTimersByTimeAsync(40));expect(m.load).not.toHaveBeenCalled();
  let finish!:(value:LabelSnapshot)=>void;m.load.mockReturnValue(new Promise(resolve=>finish=resolve));
  await act(async()=>{vi.advanceTimersByTime(60_001);window.dispatchEvent(new Event('focus'));});
  expect(m.load).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('初次');
  await act(async()=>finish({...data,assignments:{customer:['b']}}));expect(host.textContent).toBe('常客＋標籤');
 } finally {vi.useRealTimers();}
});
it('batches new rows and preserves previously loaded customers while fetching another',async()=>{
 vi.useFakeTimers();
 try {
  let finish!:(value:LabelSnapshot)=>void;m.load.mockReturnValue(new Promise(resolve=>finish=resolve));
  const rows=(second:boolean)=>jsx(CustomerLabelsProvider,{initial:data,children:[jsx(CustomerLabels,{customerId:'customer'},'first'),second?jsx(CustomerLabels,{customerId:'other'},'second'):null]});
  await act(async()=>root.render(rows(true)));expect(host.querySelector('[aria-label="標籤載入中"]')).toBeTruthy();
  await act(async()=>vi.advanceTimersByTimeAsync(40));expect(m.load).toHaveBeenCalledWith(['other']);
  expect(host.textContent).toContain('初次');
  await act(async()=>finish({...data,assignments:{other:['b']}}));expect(host.textContent).toContain('初次');expect(host.textContent).toContain('常客');
  await act(async()=>root.render(rows(false)));await act(async()=>root.render(rows(true)));
  await act(async()=>vi.advanceTimersByTimeAsync(40));expect(m.load).toHaveBeenCalledTimes(1);
 } finally {vi.useRealTimers();}
});
it('does not let a late refresh overwrite an optimistic label edit',async()=>{
 vi.useFakeTimers();
 try {
  await render();let finish!:(value:LabelSnapshot)=>void;m.load.mockReturnValue(new Promise(resolve=>finish=resolve));
  await act(async()=>window.dispatchEvent(new Event('customer-labels:refresh')));
  await click('查看或修改顧客標籤');
  let save!:(value:{success:boolean})=>void;m.save.mockReturnValue(new Promise(resolve=>save=resolve));
  const target=[...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find(b=>b.textContent?.includes('重點'))!;
  await act(async()=>target.click());expect(host.textContent).not.toContain('＋1');
  await act(async()=>finish(data));expect(host.textContent).not.toContain('＋1');
  await act(async()=>save({success:true}));expect(host.textContent).not.toContain('＋1');
 } finally {vi.useRealTimers();}
});

it('synchronizes saved metadata without refetching and ignores older in-flight reads',async()=>{
 await render();let finish!:(value:LabelSnapshot)=>void;m.load.mockReturnValue(new Promise(resolve=>finish=resolve));
 await act(async()=>window.dispatchEvent(new Event('customer-labels:refresh')));
 const labels=data.labels.map(l=>l.id==='a'?{...l,name:'已改名'}:l);
 await act(async()=>window.dispatchEvent(new CustomEvent('customer-labels:refresh',{detail:{enabled:true,categories:data.categories,labels}})));
 expect(host.textContent).toContain('已改名');expect(m.load).toHaveBeenCalledTimes(1);
 await act(async()=>finish(data));expect(host.textContent).toContain('已改名');expect(host.textContent).not.toContain('初次');
});

it('renders metadata and assignments with the very first server roster markup',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server');
 const html=renderToStaticMarkup(jsx(CustomerLabelsProvider,{children:jsx(CustomerLabelsSeed,{initial:data,children:jsx(CustomerLabels,{customerId:'customer'})})}));
 expect(html).toContain('初次');expect(html).not.toContain('標籤載入中');
});
it('does not replace a recently edited assignment with an older cached roster',async()=>{
 const recent={...data,fetchedAt:2000,assignments:{customer:['b']}};
 const cached={...data,fetchedAt:1000,assignments:{customer:['a']}};
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:recent,children:jsx(CustomerLabelsSeed,{initial:cached,children:jsx(CustomerLabels,{customerId:'customer'})})})));
 expect(host.textContent).toContain('常客');expect(host.textContent).not.toContain('初次');
});

it('keeps server labels after hydration even when the surrounding provider starts empty',async()=>{
 vi.useFakeTimers();try{
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{children:jsx(CustomerLabelsSeed,{initial:data,children:jsx(CustomerLabels,{customerId:'customer'})})})));
 expect(host.textContent).toContain('初次');await act(async()=>vi.advanceTimersByTimeAsync(50));expect(m.load).not.toHaveBeenCalled();expect(host.textContent).toContain('初次');
 }finally{vi.useRealTimers();}
});

it.each([1,9999999999999])('accepts newer requests and rejects stale snapshots regardless of browser clock %s',async(clock)=>{
 const now=vi.spyOn(Date,'now').mockReturnValue(clock);
 const stale={...data,clientRevision:nextCustomerLabelRevision(),fetchedAt:9999999999999,assignments:{customer:['a']}};
 const current={...data,clientRevision:nextCustomerLabelRevision(),fetchedAt:1000,assignments:{customer:['b']}};
 const fresh={...data,clientRevision:nextCustomerLabelRevision(),fetchedAt:2000,assignments:{customer:['c']}};
 function SeedButton({value}:{value:LabelSnapshot}){const seed=useSeedCustomerLabels();return jsx('button',{onClick:()=>seed?.(value),children:'同步'});}
 const paint=async(value:LabelSnapshot)=>act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:current,children:jsx('div',{children:[jsx(SeedButton,{value}),jsx(CustomerLabels,{customerId:'customer'})]})})));
 try{await paint(fresh);await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('重點');expect(host.textContent).not.toContain('常客');await paint(stale);await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('重點');expect(host.textContent).not.toContain('初次');}finally{now.mockRestore();}
});

it('accepts newly navigated server data after previous client reads',async()=>{const prior={...data,fetchedAt:1000,clientRevision:nextCustomerLabelRevision(),assignments:{customer:['a']}};const navigated={...data,fetchedAt:2000,assignments:{customer:['b']}};await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:prior,children:jsx(CustomerLabelsSeed,{initial:navigated,children:jsx(CustomerLabels,{customerId:'customer'})})})));expect(host.textContent).toContain('常客');expect(host.textContent).not.toContain('初次');});

it('retains the add control for an editable empty customer even when hideEmpty is requested',async()=>{
 const empty={...data,assignments:{customer:[]}};
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:empty,children:jsx(CustomerLabels,{customerId:'customer',hideEmpty:true})})));
 expect(host.textContent).toContain('＋標籤');
 await click('查看或修改顧客標籤');
 const tag=[...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find(b=>b.textContent?.includes('初次'))!;
 await act(async()=>tag.click());
 expect(m.save).toHaveBeenCalledWith({customerId:'customer',labelId:'a',selected:true});
 expect(host.textContent).toContain('初次');
});

it('shows every selected badge in a work-order customer summary',async()=>{
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:data,children:jsx(CustomerLabels,{customerId:'customer',variant:'badge',displayOnly:true,readOnly:true,maxVisible:99})})));
 expect(host.textContent).toContain('初次');expect(host.textContent).toContain('常客');expect(host.textContent).toContain('重點');expect(host.textContent).not.toContain('＋1');
 expect(host.querySelector('.text-sm')).not.toBeNull();expect(host.querySelector('button')).toBeNull();
});
