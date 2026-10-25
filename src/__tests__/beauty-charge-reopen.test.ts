// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {BeautyChargeDraft} from '@/lib/beauty/charge-editor';
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock('@/server/actions/beauty-charge',()=>({saveBeautyCharge:m.save}));
vi.mock('@/components/beauty/catalog-adapter',()=>({BeautyCourseCatalog:()=>null}));
vi.mock('@/components/beauty/opening-guide',()=>({BeautyOpeningGuide:()=>null}));
vi.mock('@/components/desktop',()=>({DataTable:({rows}:{rows:{id:string;edit:()=>void}[]})=>h('div',{},rows.map(r=>h('button',{key:r.id,'data-row':r.id,onClick:r.edit},'設定')))}));
vi.mock('@/components/beauty/charge-editor',()=>({BeautyChargeEditor:({initialDraft,port,onSaved,onClose}:{initialDraft:BeautyChargeDraft;port:{save:(draft:BeautyChargeDraft)=>Promise<{success:boolean}>};onSaved:()=>void;onClose:()=>void})=>h('div',{'data-editor':true},
 h('output',{'data-cost':true},String(initialDraft.storeCost??'')),
 h('button',{onClick:async()=>{const r=await port.save({...initialDraft,storeCost:1500});if(r.success){onSaved();onClose();}}},'儲存測試'),
 h('button',{onClick:onClose},'關閉測試'))}));
import {BeautyChargeWorkspace} from '@/components/beauty/charge-workspace';
let root:Root,host:HTMLDivElement;
function data(revision=3,cost:number|null=null,storeId='store'){
 return {storeId,chargeRulesActive:true,services:[{id:'s',active:true,revision:3,name:'做臉',price:1000,trialPrice:500,trialDuration:null}],plans:[{id:'p',name:'五次方案',sessions:5,price:5000,validDays:90,allowShared:false,serviceIds:['s'],revision}],chargeCatalog:{enabled:true,editingEnabled:true,singles:[],plans:[{id:'p',storeCost:cost,rule:{mode:'SELECTED',technicianIds:['t']}}]}} as unknown as BeautyDashboardData;
}
function render(value=data()){act(()=>root.render(h(BeautyChargeWorkspace,{data:value,canEdit:true})));}
function open(kind:'single'|'plan'='plan'){act(()=>host.querySelector<HTMLButtonElement>(`[data-row="${kind==='plan'?'plan:p':'service:s'}"]`)!.click());}
function click(text:string){return [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;}
async function save(){await act(async()=>click('儲存測試').click());}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.save.mockReset().mockResolvedValue({success:true,data:{id:'p',kind:'plan',revision:4}});m.refresh.mockReset();});
afterEach(()=>{act(()=>root.unmount());host.remove();});
it.each(['single','plan'] as const)('reopens the confirmed %s fee and revision while route refresh still has the old row',async kind=>{
 m.save.mockResolvedValue({success:true,data:{id:kind==='plan'?'p':'s',kind,revision:4}});
 render();open(kind);await save();expect(m.refresh).toHaveBeenCalled();open(kind);
 expect(host.querySelector('[data-cost]')?.textContent).toBe('1500');
 await save();expect(m.save.mock.calls[1][0]).toMatchObject({expectedRevision:4,draft:{storeCost:1500}});
});
it('uses a newer server revision instead of retaining an earlier save',async()=>{
 render();open();await save();render(data(5,1800));open();
 expect(host.querySelector('[data-cost]')?.textContent).toBe('1800');
 await save();expect(m.save.mock.calls[1][0].expectedRevision).toBe(5);
});
it('does not carry a confirmed fee to another store with the same local IDs',async()=>{
 render();open();await save();render(data(3,700,'other'));open();
 expect(host.querySelector('[data-cost]')?.textContent).toBe('700');
});
it('does not publish a rejected edit as the saved fee',async()=>{
 m.save.mockResolvedValue({success:false,error:'版本衝突'});render(data(3,500));open();await save();act(()=>click('關閉測試').click());open();
 expect(host.querySelector('[data-cost]')?.textContent).toBe('500');expect(m.refresh).not.toHaveBeenCalled();
});
