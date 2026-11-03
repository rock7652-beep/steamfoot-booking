// @vitest-environment jsdom
import {act,createElement as h,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TimeOfDayField} from '@/components/admin/time-of-day-field';
let host:HTMLDivElement,root:Root;
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});afterEach(()=>{act(()=>root.unmount());host.remove();});
it('keeps other modules on the original native field, step and disabled state',()=>{act(()=>root.render(h(TimeOfDayField,{value:'09:00',onChange:vi.fn(),step:60,disabled:true,'aria-label':'開始'})));const input=host.querySelector('input')!;expect(input.type).toBe('time');expect(input.step).toBe('60');expect(input.disabled).toBe(true);expect(host.querySelector('select')).toBeNull();});
it('selects stable times, preserves off-grid values and allows typed custom minutes',()=>{
 const changed=vi.fn();function Form(){const [value,setValue]=useState('09:15');return h(TimeOfDayField,{selectTimes:true,value,'aria-label':'開始',onChange:e=>{setValue(e.target.value);changed(e.target.value);}});}
 act(()=>root.render(h(Form)));const select=host.querySelector('select')!;expect(select.value).toBe('09:15');expect([...select.options].filter(o=>o.value==='09:15')).toHaveLength(1);
 act(()=>{select.value='10:30';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(changed).toHaveBeenLastCalledWith('10:30');
 act(()=>{select.value='__custom__';select.dispatchEvent(new Event('change',{bubbles:true}));});const input=host.querySelector('input')!;expect(input.type).toBe('text');expect(input.value).toBe('10:30');
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'10:17');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(changed).toHaveBeenLastCalledWith('10:17');
 act(()=>host.querySelector('button')!.click());expect(host.querySelector('select')!.value).toBe('10:17');
});
