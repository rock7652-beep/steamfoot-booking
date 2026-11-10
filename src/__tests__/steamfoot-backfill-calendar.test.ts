// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({booked:vi.fn().mockResolvedValue([])}));
vi.mock('@/server/actions/customer-booked-dates',()=>({fetchCustomerBookedDates:m.booked}));
import {SteamfootBookingCalendar} from '@/components/steamfoot-booking-calendar';
it('permits past dates and month navigation only for an opted-in backend calendar',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div'),root=createRoot(host),change=vi.fn();
 const props={days:['2026-11-10','2026-11-11'],value:'2026-11-10',onChange:change,customerId:'student'};
 try{
  await act(async()=>root.render(React.createElement(SteamfootBookingCalendar,props)));
  expect(host.querySelector<HTMLButtonElement>('[aria-label="2026-11-09"]')!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="上個月"]')!.disabled).toBe(true);
  await act(async()=>root.render(React.createElement(SteamfootBookingCalendar,{...props,allowPast:true})));
  expect(host.querySelector<HTMLButtonElement>('[aria-label="2026-11-09"]')!.disabled).toBe(false);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="上個月"]')!.click());
  expect(m.booked).toHaveBeenLastCalledWith('student','2026-10-01','2026-10-31');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="2026-10-03"]')!.click());
  expect(change).toHaveBeenLastCalledWith('2026-10-03');
 }finally{await act(async()=>root.unmount());}
});
