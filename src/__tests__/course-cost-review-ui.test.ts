// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({confirm:vi.fn()}));
vi.mock('@/server/actions/course-cost-review',()=>({confirmCourseFeeCosts:m.confirm}));
import {CourseCostReviewView} from '@/app/(dashboard)/dashboard/courses/cost-review/cost-review-view';
const data={month:'2026-10',catalog:[{id:'fee',name:'待核對收費',active:true,price:600,cost:0,trial:null,version:'v1',confirmedAt:null,issue:'零成本待確認'}],purchases:[{id:'old',name:'歷史收費',date:'2026-10-25',received:600,refunds:0,cost:null,difference:null,issue:'缺少交易當下成本'}],receipts:[],fees:null};
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('requires an exact receipt to confirm a zero cost and distinguishes unknown cost from zero',async()=>{
 m.confirm.mockResolvedValue({success:true,id:'fee',version:'other-version'});
 await act(async()=>root.render(createElement(CourseCostReviewView,{data,canConfirm:true})));
 expect(host.textContent).toContain('缺少交易當下成本');expect(host.textContent).toContain('已知一般差額（未扣教師費）待核對');
 const button=()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='確認此筆成本')!;
 await act(async()=>button().click());expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(button()).toBeTruthy();
 m.confirm.mockResolvedValue({success:true,id:'fee',version:'v1'});await act(async()=>button().click());
 expect(host.textContent).toContain('已確認零成本');expect(host.querySelector('[role="status"]')).not.toBeNull();expect(button()).toBeUndefined();
 expect(m.confirm).toHaveBeenCalledWith({id:'fee',expectedVersion:'v1'});
});
it('hides confirmation controls in a readonly view',async()=>{
 await act(async()=>root.render(createElement(CourseCostReviewView,{data,canConfirm:false})));expect(host.querySelector('button')).toBeNull();expect(m.confirm).not.toHaveBeenCalled();
});
