// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({options:vi.fn(),create:vi.fn()}));
vi.mock('@/server/actions/course-schedule-enrollment',()=>({loadCourseScheduleEnrollmentOptions:m.options,createScheduleCustomer:m.create}));
import {CourseScheduleLearners,type ScheduleLearner} from '@/components/admin/course-schedule-learners';
it('creates and adds two children with one guardian phone using distinct IDs and request keys',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.options.mockResolvedValue({success:true,customers:[],cards:[],trialSettings:{enabled:false,price:0}});
 m.create.mockImplementation(async(data:{name:string;phone:string})=>({success:true,customer:{id:data.name==='小安'?'child-a':'child-b',name:data.name,phone:data.phone,sharedContactPhone:true,existing:false}}));
 const changed=vi.fn();
 function Harness(){const [rows,setRows]=useState<ScheduleLearner[]>([]);return React.createElement(CourseScheduleLearners,{templateId:'guitar',pointCost:1,capacity:2,itemOnly:true,allowDeferred:true,canCreateCustomer:true,value:rows,onChange:(next:ScheduleLearner[])=>{changed(next);setRows(next);}});}
 const host=document.createElement('div'),root=createRoot(host);
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 const fill=async(selector:string,value:string)=>act(async()=>{const field=host.querySelector<HTMLInputElement>(selector)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});
 try{
  await act(async()=>root.render(React.createElement(Harness)));
  for(const name of ['小安','小晴']){
   await act(async()=>button('＋建立新學員').click());
   await fill('[aria-label="新學員姓名"]',name);await fill('[aria-label="新學員手機"]','0912345678');
   await act(async()=>button('建立並加入').click());
  }
  expect((changed.mock.lastCall![0] as ScheduleLearner[]).map(r=>r.customerId)).toEqual(['child-a','child-b']);
  expect(m.create).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('使用家長聯絡電話');
  expect(m.create.mock.calls.map(([row])=>({name:row.name,phone:row.phone}))).toEqual([{name:'小安',phone:'0912345678'},{name:'小晴',phone:'0912345678'}]);
  expect(m.create.mock.calls[0][0].requestKey).not.toBe(m.create.mock.calls[1][0].requestKey);
  expect(host.textContent).toContain('小安');expect(host.textContent).toContain('小晴');
 }finally{await act(async()=>root.unmount());}
});
