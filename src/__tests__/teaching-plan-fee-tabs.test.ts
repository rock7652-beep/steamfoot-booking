// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {TeachingPlanFeeEditor} from '@/components/admin/teaching-plan-fee-editor';
import type {MusicTeacherSettings} from '@/lib/music-teacher-settings';
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
function Fixture(){const [ids,setIds]=useState<string[]>([]),[settings,setSettings]=useState<MusicTeacherSettings>({defaultRatio:null,subjectRules:{},revision:0});return createElement(TeachingPlanFeeEditor,{templates:[{id:'a',name:'A 類',musicSubjectId:'A',subjectName:'A 類'}],plans:[{id:'A1',name:'A1 方案',subjectIds:['A'],active:true,defaults:{A:{mode:'SHARE',value:60}}}],qualificationIds:ids,settings,fees:{},onSettings:setSettings,onQualification:(id,selected)=>setIds(old=>selected?[...new Set([...old,id])]:old.filter(value=>value!==id))});}
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(createElement(Fixture)));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const tab=(name:string)=>Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button=>button.textContent===name)!;
const panel=(name:string)=>host.querySelector<HTMLElement>(`[data-teaching-pane="${name}"]`)!;
it('shows one pane at a time and keeps qualification and fee drafts across tabs',async()=>{
 expect(panel('qualifications').hidden).toBe(false);expect(panel('fees').hidden).toBe(true);
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 await act(async()=>tab('方案計酬').click());expect(panel('qualifications').hidden).toBe(true);expect(panel('fees').hidden).toBe(false);
 await act(async()=>Array.from(panel('fees').querySelectorAll('button')).find(button=>button.textContent==='修改')!.click());
 const mode=host.querySelector<HTMLSelectElement>('[aria-label="A1 方案計酬方式"]')!;
 await act(async()=>{mode.value='CLASS';mode.dispatchEvent(new Event('change',{bubbles:true}));});
 const value=host.querySelector<HTMLInputElement>('[aria-label="A1 方案計酬數值"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(value,'600');value.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>tab('授課資格').click());expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
 await act(async()=>tab('方案計酬').click());expect(value.value).toBe('600');expect(mode.value).toBe('CLASS');
});
it('supports keyboard tab navigation with focus and selection',async()=>{
 tab('授課資格').focus();await act(async()=>tab('授課資格').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 expect(tab('方案計酬').getAttribute('aria-selected')).toBe('true');expect(document.activeElement).toBe(tab('方案計酬'));
 await act(async()=>tab('方案計酬').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));
 expect(tab('授課資格').getAttribute('aria-selected')).toBe('true');expect(document.activeElement).toBe(tab('授課資格'));
});
