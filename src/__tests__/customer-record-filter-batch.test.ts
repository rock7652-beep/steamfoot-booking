// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {CourseHistoryList} from '@/app/(dashboard)/dashboard/courses/history-list';
it('keeps all fields when dates and item are filled in one batch, including browser autofill',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),load=vi.fn().mockResolvedValue({success:true,data:[],hasMore:false});
 try{
  await act(async()=>root.render(createElement(CourseHistoryList,{customerId:'customer',label:'紀錄',empty:'尚無紀錄',load,render:()=>null})));
  await act(async()=>{
   for(const [label,value] of [['開始日期','2026-01-01'],['結束日期','2026-01-31'],['方案／項目','QA1565']]){
    const input=host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));
   }
  });
  expect(load).toHaveBeenLastCalledWith('customer',0,{from:'2026-01-01',to:'2026-01-31',item:'QA1565'});
 }finally{await act(async()=>root.unmount());host.remove();}
});
