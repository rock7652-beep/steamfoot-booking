// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {CourseOptionSelect} from '@/components/admin/course-option-select';
it('filters immediately and prevents choosing an already joined learner',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const onChange=vi.fn(),onSearchChange=vi.fn();
 try{
 await act(async()=>root.render(React.createElement(CourseOptionSelect,{label:'學員',searchable:true,value:'',onChange,onSearchChange,options:[{id:'a',label:'王甲 可用方案'},{id:'b',label:'李乙 已加入',disabled:true}]})));
 const input=host.querySelector('input')!;
 await act(async()=>input.focus());
 await act(async()=>host.querySelector<HTMLElement>('[aria-disabled="true"]')!.click());
 expect(onChange).not.toHaveBeenCalled();
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'王');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(onSearchChange).toHaveBeenCalledWith('王');
 expect([...host.querySelectorAll('[role="option"]')].map(x=>x.textContent)).toEqual(['王甲 可用方案']);
 await act(async()=>host.querySelector<HTMLElement>('[role="option"]')!.click());
 expect(onChange).toHaveBeenCalledWith('a');expect(input.getAttribute('aria-expanded')).toBe('false');
 }finally{await act(async()=>root.unmount());host.remove();}
});
