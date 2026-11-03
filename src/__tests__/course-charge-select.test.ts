// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {CourseChargeSelect} from '@/components/admin/course-charge-select';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/course-charge',()=>({loadCourseChargeOptions:vi.fn()}));
vi.mock('@/components/operations/panel-read-cache',()=>({usePanelReader:()=>m}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>;
afterEach(()=>{act(()=>root?.unmount());document.body.replaceChildren();vi.clearAllMocks();});
it('uses the store default and limits sports open selection to open fees',async()=>{
 const settings={kind:'single',durationMinutes:60,trialPrice:0,trialDuration:20,providerIds:['teacher']};
 m.read.mockResolvedValue({success:true,enabled:true,defaultTrialPrice:499,rows:[{id:'assigned',name:'指定課',open:false,price:800,settings},{id:'open',name:'通用單次',open:true,price:900,settings:{...settings,trialPrice:null,trialDuration:null}}]});
 const onChange=vi.fn(),onReady=vi.fn(),onDefaultPrice=vi.fn();const host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(h(CourseChargeSelect,{templateId:'t',trial:true,open:true,sports:true,onChange,onReady,onDefaultPrice})));
 expect(host.textContent).toContain('沿用店家預設體驗費 $499');expect(host.textContent).not.toContain('指定課');
 expect(onDefaultPrice).toHaveBeenCalledWith(499);expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({id:'open',trialPrice:499}));expect(onReady).toHaveBeenLastCalledWith(true);
});
it('does not expose a previous mode quote while a new mode is loading',async()=>{
 const settings={kind:'single',durationMinutes:60,trialPrice:0,trialDuration:20,providerIds:['teacher']};
 m.read.mockResolvedValueOnce({success:true,enabled:true,defaultTrialPrice:499,rows:[{id:'fee',name:'單次',open:false,price:800,settings}]}).mockImplementationOnce(()=>new Promise(()=>{}));
 const onChange=vi.fn(),onReady=vi.fn();const host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(h(CourseChargeSelect,{templateId:'t',trial:false,onChange,onReady})));
 expect(onReady).toHaveBeenLastCalledWith(true);
 await act(async()=>root.render(h(CourseChargeSelect,{templateId:'t',trial:true,onChange,onReady})));
 expect(host.textContent).toContain('讀取收費方式');expect(host.querySelector('select')).toBeNull();expect(onReady).toHaveBeenLastCalledWith(false);expect(onChange).toHaveBeenLastCalledWith(null);
});
