// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {LessonProgressGrid} from '@/components/admin/lesson-progress-grid';
it('shows void dates as labeled gray slots without counting them as attended, and returns the slot to blank after correction',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host),select=vi.fn();
 const completed=[{id:'lesson',date:'2026-11-03T02:00:00Z'}],voided=[{id:'void',date:'2026-11-10T16:00:00Z'}];
 try{
  await act(async()=>root.render(createElement(LessonProgressGrid,{total:8,completed,voided,onSelect:select,compact:true})));
  expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(8);expect(host.querySelectorAll('[data-completed="true"]')).toHaveLength(1);expect(host.querySelectorAll('[data-voided="true"]')).toHaveLength(1);
  const slot=host.querySelector('[data-voided="true"]')!;expect(slot.textContent).toBe('註銷11/11');expect(slot.getAttribute('aria-label')).toContain('註銷日期：2026-11-11');expect(slot.querySelector('button')).toBeNull();expect(host.textContent).toContain('已上 1／8 堂');
  await act(async()=>root.render(createElement(LessonProgressGrid,{total:8,completed,voided:[],onSelect:select,compact:true})));
  expect(host.querySelectorAll('[data-voided="true"]')).toHaveLength(0);expect([...host.querySelectorAll('[data-lesson-slot]')].filter(row=>!row.textContent)).toHaveLength(7);
 }finally{await act(async()=>root.unmount());host.remove();}
});
