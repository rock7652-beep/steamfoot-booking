// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PublicBookingCalendar } from '@/components/public-trial/public-booking-calendar';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T01:00:00Z'));host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()});
it('sports permits only known future dates and reports real class counts',()=>{
 const change=vi.fn();act(()=>root.render(h(PublicBookingCalendar,{value:'',onChange:change,availableDates:new Map([['2026-10-28',2],['2026-10-30',1]])})));
 const open=host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-28 2 堂體驗課"]')!;
 expect(open.disabled).toBe(false);expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-29 未開放"]')!.disabled).toBe(true);
 act(()=>open.click());expect(change).toHaveBeenCalledWith('2026-10-28');
 expect(host.querySelector<HTMLButtonElement>('button[aria-label="下個月"]')!.disabled).toBe(true);
});
it('beauty does not claim availability before its server query and rejects past dates',()=>{
 act(()=>root.render(h(PublicBookingCalendar,{value:'2026-10-27',onChange:vi.fn()})));
 expect(host.textContent).toContain('實際可約時間依服務與技師安排確認');expect(host.textContent).not.toContain('堂');
 expect(host.querySelector<HTMLButtonElement>('button[aria-label^="2026-10-26 "]')!.disabled).toBe(true);
 expect(host.querySelector<HTMLButtonElement>('button[aria-label^="2026-10-28 "]')!.disabled).toBe(false);
});
it('month navigation preserves the selected date and every button avoids form submission',()=>{
 const change=vi.fn();act(()=>root.render(h(PublicBookingCalendar,{value:'2026-10-28',onChange:change})));
 act(()=>host.querySelector<HTMLButtonElement>('button[aria-label="下個月"]')!.click());
 expect(host.textContent).toContain('2026 年 11 月');expect(change).not.toHaveBeenCalled();
 act(()=>host.querySelector<HTMLButtonElement>('button[aria-label="上個月"]')!.click());
 expect(host.querySelector('button[aria-label^="2026-10-28 "]')!.getAttribute('aria-pressed')).toBe('true');
 expect([...host.querySelectorAll('button')].every(b=>b.type==='button')).toBe(true);
});
it('an in-flight booking disables month navigation and date changes',()=>{
 const change=vi.fn();act(()=>root.render(h(PublicBookingCalendar,{value:'2026-10-27',onChange:change,disabled:true})));
 expect([...host.querySelectorAll('button')].every(b=>b.disabled)).toBe(true);
});
