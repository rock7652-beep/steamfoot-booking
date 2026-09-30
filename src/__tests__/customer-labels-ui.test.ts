// @vitest-environment jsdom
import {act} from 'react';
import {jsx} from 'react/jsx-runtime';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {LabelSnapshot} from '@/lib/customer-labels';
const m=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),error:vi.fn()}));
vi.mock('@/server/actions/customer-labels',()=>({loadCustomerLabels:m.load,setCustomerLabel:m.save}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard/customers',useRouter:()=>({replace:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/components/dashboard-link',()=>({DashboardLink:()=>null}));
vi.mock('sonner',()=>({toast:{error:m.error}}));
import {CustomerLabelsProvider,CustomerLabels} from '@/components/customer-labels';
const data:LabelSnapshot={available:true,enabled:true,canEdit:true,canManage:true,categories:[{id:'cat',name:'需求',number:1,position:0,active:true}],labels:[{id:'a',name:'初次',categoryId:'cat',active:true},{id:'b',name:'常客',categoryId:'cat',active:true},{id:'c',name:'重點',categoryId:'cat',active:true}],assignments:{customer:['a','b','c']}};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.load.mockResolvedValue(data);m.save.mockResolvedValue({success:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(initial=data,readOnly=false){await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial,children:jsx(CustomerLabels,{customerId:"customer",readOnly})},String(initial.enabled))));}
async function click(label:string){const button=document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);expect(button).toBeTruthy();await act(async()=>button!.click());}
it('shows two labels and remaining count, and portals the dialog outside a clipped row',async()=>{await render();expect(host.textContent).toContain('＋1');expect(host.textContent).toContain('＋標籤');expect(host.textContent).not.toContain('重點');await click('查看或修改顧客標籤');expect(document.querySelector('[role="dialog"]')).toBeTruthy();expect(host.querySelector('[role="dialog"]')).toBeNull();});
it('updates immediately, retains the dialog, and rolls back failed saves',async()=>{await render();await click('查看或修改顧客標籤');let finish!:(v:{success:boolean,error:string})=>void;m.save.mockReturnValue(new Promise(resolve=>finish=resolve));const button=[...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find(b=>b.textContent?.includes('重點'))!;await act(async()=>button.click());expect(host.textContent).not.toContain('＋1');expect(document.querySelector('[role="dialog"]')).toBeTruthy();await act(async()=>finish({success:false,error:'失敗'}));expect(host.textContent).toContain('＋1');expect(m.error).toHaveBeenCalledWith('失敗');expect(m.save).toHaveBeenCalledWith({customerId:'customer',labelId:'c',selected:false});});
it('hides disabled tags without deleting and exposes no writable buttons to readonly users',async()=>{await render({...data,enabled:false});expect(host.textContent).toBe('');expect(m.save).not.toHaveBeenCalled();await render(data,true);await click('查看或修改顧客標籤');expect([...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].every(b=>b.disabled)).toBe(true);});

it("keeps the menu open while scrolling its labels, but closes when the surrounding list scrolls",async()=>{await render();await click("查看或修改顧客標籤");const dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;expect(dialog.className).toContain("z-[200]");expect(dialog.querySelector("input")?.autofocus).toBe(false);await act(async()=>dialog.querySelector("span")!.dispatchEvent(new Event("scroll")));expect(document.querySelector('[role="dialog"]')).toBeTruthy();await act(async()=>host.dispatchEvent(new Event("scroll")));expect(document.querySelector('[role="dialog"]')).toBeNull();});
it('uses quiet dot labels without an add button and opens all labels on touch',async()=>{
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:data,children:jsx(CustomerLabels,{customerId:'customer',variant:'dots'})})));
 expect(host.textContent).not.toContain('＋標籤');expect(host.textContent).toContain('＋1');
 expect(host.querySelector('.bg-orange-500')).toBeTruthy();
 await click('查看或修改顧客標籤');expect(document.querySelector('[role="dialog"]')?.textContent).toContain('重點');
});
it('does not reserve a dot-label row when there are no labels',async()=>{
 const empty={...data,assignments:{customer:[]}};m.load.mockResolvedValue(empty);
 await act(async()=>root.render(jsx(CustomerLabelsProvider,{initial:empty,children:jsx(CustomerLabels,{customerId:'customer',variant:'dots'})})));
 expect(host.textContent).toBe('');expect(host.querySelector('button')).toBeNull();
});
