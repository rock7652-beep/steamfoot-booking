// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CalendarMonthBoundary,calendarMonthReady} from '@/components/admin/calendar-month-boundary';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const retry=vi.fn();
async function render(month:string,dates:string[],loading=true,error=''){
 await act(async()=>root.render(h(CalendarMonthBoundary,{ready:calendarMonthReady(true,'2026-11-04',month),date:'2026-11-04',loading,error,onRetry:retry,children:h('section',{'aria-label':'本月課表'},dates.map(date=>h('button',{key:date},date)))})));
}
it('never presents October spillover dates as a complete November calendar, then reveals 4/5/12 together',async()=>{
 await render('2026-10',['2026-11-04','2026-11-05']);
 expect(host.querySelector('[role=status]')?.textContent).toContain('2026/11');expect(host.querySelector('[aria-label=本月課表]')).toBeNull();expect(host.textContent).not.toContain('2026-11-04');
 await render('2026-11',['2026-11-04','2026-11-05','2026-11-12'],false);
 expect([...host.querySelectorAll('button')].map(b=>b.textContent)).toEqual(['2026-11-04','2026-11-05','2026-11-12']);expect(host.querySelector('[aria-label=課表載入]')).toBeNull();
});
it('keeps incomplete data hidden on failure, allows retry and accepts an authoritative empty month',async()=>{
 await render('2026-10',['2026-11-04'],false,'課表讀取失敗');expect(host.querySelector('[role=alert]')?.textContent).toBe('課表讀取失敗');
 await act(async()=>host.querySelector('button')!.click());expect(retry).toHaveBeenCalledOnce();
 await render('2026-11',[],false);expect(host.querySelector('[aria-label=本月課表]')).not.toBeNull();expect(host.textContent).not.toContain('讀取');
});
it('matches month and year and leaves non-native calendar behavior unchanged',()=>{
 expect(calendarMonthReady(true,'2027-01-04','2026-01')).toBe(false);expect(calendarMonthReady(true,'2026-11-30','2026-11')).toBe(true);expect(calendarMonthReady(false,'2026-11-04','2026-10')).toBe(true);
});
