// @vitest-environment jsdom
vi.mock('@/server/actions/beauty-technician-service',()=>({saveBeautyTechnicianService:vi.fn()}));
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import type {CourseRosterSource,NativeRosterBooking} from '@/app/(dashboard)/dashboard/courses/roster-source';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {ServiceCharge} from '@/server/beauty/service-charges';
const m=vi.hoisted(()=>({source:undefined as CourseRosterSource|undefined,row:undefined as NativeRosterBooking|undefined}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/components/beauty/use-customer-sync',()=>({useBeautyCustomerRevision:()=>0}));
vi.mock('@/components/operations/panel-read-cache',()=>({useMusicDataRevision:()=>0,usePanelReadCache:()=>({load:vi.fn(),get:vi.fn()}),usePanelReader:()=>({read:vi.fn(),invalidate:vi.fn()})}));
vi.mock('@/server/actions/beauty-native-roster',()=>({saveBeautyNativeRosterNote:vi.fn()}));
vi.mock('@/lib/beauty/roster-reader',()=>({readBeautyRoster:vi.fn(),syncBeautyRoster:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/roster',()=>({CourseRoster:({source}:{source:CourseRosterSource})=>{m.source=source;return source.row?.(m.row!).cost;}}));
import {BeautyNativeRoster} from '@/components/beauty/native-roster-source';

it('integrates authoritative prefetched collection quotes with plan-covered add-ons and retains both goods and add-on actions',async()=>{
 const quote:ServiceCharge={id:'appointment',revision:3,personName:'合成顧客',serviceName:'服務',price:200,basePrice:1000,baseCovered:true,discount:{kind:'AMOUNT',value:0},reduction:0,netPrice:200,collected:0,due:200};
 m.row={id:'appointment',customerId:'customer',customerName:'合成顧客',status:'RESERVED',bookingKind:'CARD',cardId:'card',service:{revision:3,startsAt:'2026-11-06T02:00:00Z',endsAt:'2026-11-06T03:15:00Z',occupiedEndsAt:'2026-11-06T03:15:00Z',serviceName:'服務',technicianName:'技師',locationName:'床位',price:1000,debit:false,available:2,collectionQuote:quote,payment:{reduction:0,netPrice:200,collected:0,due:200,status:'待收款'},addOnItems:[{id:'addon',groupId:'extras',groupTitle:'加做',quantity:1,name:'頭部放鬆',price:200,duration:15}]}} as unknown as NativeRosterBooking;
 const data={storeId:'store',date:'2026-11-06',items:[{id:'appointment',groupId:'group',startsAt:'2026-11-06T02:00:00Z'}],customers:[],access:{financeAccess:true,customerAccess:false},manage:{update:true,collect:true,card:false},sharedGoodsEnabled:true,addOnsEnabled:true} as unknown as BeautyDashboardData;
 const money=vi.fn();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 try{
  await act(async()=>root.render(createElement(BeautyNativeRoster,{data,readOnly:false,onBusyChange:vi.fn(),onAttendance:vi.fn(),onStatus:vi.fn(),onMoney:money,onCustomer:vi.fn()})));
  const collect=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='收款');expect(collect).toBeDefined();
  await act(async()=>collect!.click());expect(money).toHaveBeenLastCalledWith('collect',['appointment'],[quote]);
  expect(m.source!.batchAction!.selectable(m.row)).toBe(true);m.source!.batchAction!.onSubmit([m.row]);expect(money).toHaveBeenLastCalledWith('collect',['appointment'],[quote]);
  expect(m.source!.actions(m.row).map(action=>action.label)).toEqual(expect.arrayContaining(['共同商品','修改加做服務']));
 }finally{await act(async()=>root.unmount());host.remove();}
});
