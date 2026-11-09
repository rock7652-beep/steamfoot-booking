// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),params:new URLSearchParams(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh}),useSearchParams:()=>m.params}));
vi.mock('@/server/actions/course-display-order',()=>({saveCourseDisplayOrder:vi.fn()}));
vi.mock('@/server/actions/beauty-display-order',()=>({saveBeautyDisplayOrder:m.save}));
vi.mock('@/server/actions/beauty-charge',()=>({saveBeautyCharge:vi.fn()}));
vi.mock('@/components/beauty/catalog-adapter',()=>({BeautyCourseCatalog:()=>null}));
vi.mock('@/components/beauty/opening-guide',()=>({BeautyOpeningGuide:()=>null}));
vi.mock('@/components/beauty/charge-editor',()=>({BeautyChargeEditor:()=>null}));
import {BeautyChargeWorkspace} from '@/components/beauty/charge-workspace';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const data={storeId:'store',services:[{id:'s1',name:'按摩60',category:'按摩',active:true,price:1100,revision:1},{id:'s2',name:'做臉',category:'美容',active:true,price:0,revision:1}],plans:[{id:'p5',name:'按摩五次',sessions:5,price:5000,serviceIds:['s1'],revision:1},{id:'p10',name:'按摩十次',sessions:10,price:9000,serviceIds:['s1'],revision:1}],techs:[],chargeCatalog:{enabled:true,editingEnabled:true,singles:[{id:'s2',configured:false}],plans:[]},displayOrders:{plan:{ids:[],revision:2}}} as unknown as BeautyDashboardData;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.params=new URLSearchParams();m.save.mockReset().mockResolvedValue({success:true,revision:3});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(canEdit=true){await act(async()=>root.render(h(BeautyChargeWorkspace,{data,canEdit})));}
it('groups charges under their service and distinguishes unset pricing from free pricing',async()=>{await mount();const massage=host.querySelector('[aria-label="按摩60收費方式"]')!;expect(massage.textContent).toContain('按摩五次');expect(massage.textContent).toContain('按摩十次');expect(massage.textContent).not.toContain('做臉');expect(host.querySelector('[aria-label="做臉收費方式"]')!.textContent).toContain('未設定');});
it('opens the service linked from the catalog and can clear the filter',async()=>{m.params=new URLSearchParams('serviceId=s1');await mount();expect(host.querySelector('[aria-label="做臉收費方式"]')).toBeNull();await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='清除篩選')!.click());expect(host.querySelector('[aria-label="做臉收費方式"]')).not.toBeNull();});
it('persists keyboard/touch-accessible order within the same service and retains all identities',async()=>{await mount();const handle=host.querySelector<HTMLButtonElement>('[aria-label="拖曳排序 按摩五次"]')!;await act(async()=>handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));expect(m.save).toHaveBeenCalledWith({kind:'plan',ids:['plan:p5','service:s1','service:s2','plan:p10'],revision:2});expect(host.querySelector('[aria-label="按摩60收費方式"] tbody tr')?.textContent).toContain('按摩五次');});
it('does not move a charge into another service or expose order controls to readonly users',async()=>{await mount();await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="拖曳排序 做臉"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true})));expect(m.save).not.toHaveBeenCalled();await mount(false);expect(host.querySelector('[aria-label^="拖曳排序"]')).toBeNull();});
