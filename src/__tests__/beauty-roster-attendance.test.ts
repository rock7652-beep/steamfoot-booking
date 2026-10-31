import {it,expect,vi} from 'vitest';import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import type {CourseRosterSource,NativeRosterBooking} from '@/app/(dashboard)/dashboard/courses/roster-source';import type {BeautyDashboardData} from '@/server/beauty/queries';
const m=vi.hoisted(()=>({source:null as CourseRosterSource|null}));vi.mock('@/app/(dashboard)/dashboard/courses/roster',()=>({CourseRoster:({source}:{source:CourseRosterSource})=>{m.source=source;return null}}));vi.mock('@/server/actions/beauty-native-roster',()=>({readBeautyNativeRoster:vi.fn(),saveBeautyNativeRosterNote:vi.fn()}));
import {BeautyNativeRoster} from '@/components/beauty/native-roster-source';
const row={id:'b',customerId:'c',status:'ATTENDED',bookingKind:'SINGLE',service:{revision:3,price:1000,debit:true,technicianName:'技師',locationName:'床位',serviceName:'做臉',startsAt:'2026-10-24T01:00:00Z',endsAt:'2026-10-24T02:00:00Z'}} as NativeRosterBooking;
function source(readOnly=false,collectionRecoveryEnabled=false){const onAttendance=vi.fn(),onMoney=vi.fn();renderToStaticMarkup(h(BeautyNativeRoster,{data:{storeId:"store",date:"2026-10-24",items:[],manage:{update:true,collect:true,card:true},access:{customerAccess:true}} as BeautyDashboardData,readOnly,collectionRecoveryEnabled,onAttendance,onMoney,onStatus:vi.fn(),onCustomer:vi.fn(),onBusyChange:vi.fn()}));return {source:m.source!,onAttendance,onMoney};}
it('places single-service collection below its price and removes duplicate collection/detail menu entries',()=>{const {source:s}=source();const html=renderToStaticMarkup(h('div',null,s.row!(row).cost));expect(html.indexOf('1,000')).toBeLessThan(html.indexOf('收款'));expect(s.actions(row).map(a=>a.label)).not.toContain('收款');expect(s.hideDetailAction).toBe(true);expect(s.statusMenu).toBe(true);expect(renderToStaticMarkup(h('div',null,s.row!({...row,bookingKind:'CARD',cardId:'card'}).cost))).not.toContain('收款');});
it('offers both attendance corrections for a plan-backed booking after completion',()=>{
 const {source:s,onAttendance}=source();const actions=s.statusActions!({...row,bookingKind:'CARD',cardId:'card'});
 expect(actions.map(a=>a.label)).toEqual(['恢復待服務','未出席扣次','未出席不扣次']);
 actions.find(a=>a.label==='未出席扣次')!.onSelect();expect(onAttendance).toHaveBeenLastCalledWith('b',3,'NO_SHOW_DEDUCT');
 actions.find(a=>a.label==='未出席不扣次')!.onSelect();expect(onAttendance).toHaveBeenLastCalledWith('b',3,'NO_SHOW_KEEP');
 expect(s.actions(row).map(a=>a.label)).not.toContain('未出席扣次');
});
it('only offers manual deduction for a booking with a plan',()=>{
 const {source:s}=source();expect(s.statusActions!(row).map(a=>a.label)).not.toContain('未出席扣次');
 expect(s.statusActions!({...row,bookingKind:'CARD',cardId:null}).map(a=>a.label)).not.toContain('未出席扣次');
 expect(s.statusActions!({...row,status:'CANCELLED'})).toEqual([]);
 expect(source(true).source.statusActions!({...row,bookingKind:'CARD',cardId:'card'})).toEqual([]);
});
it('places purchase directly below customer details and keeps cancellation last',()=>{
 const {source:s,onMoney}=source();const actions=s.actions({...row,status:'RESERVED'});
 expect(actions.map(a=>a.label)).toEqual(['顧客資料','購買方案','換技師／位置','取消預約']);
 actions[1].onSelect();expect(onMoney).toHaveBeenCalledWith('card',['c']);
 expect(s.actions(row).map(a=>a.label)).toEqual(['顧客資料','購買方案','取消預約']);
 expect(source(true).source.actions(row).map(a=>a.label)).toEqual(['顧客資料']);
});
it('does not offer mutable attendance or collection actions in read-only mode',()=>{const {source:s}=source(true);expect(s.actions(row).map(a=>a.label)).not.toContain('出席');expect(renderToStaticMarkup(h('div',null,s.row!(row).cost))).not.toContain('收款');});

it('marks reserved attendance directly and keeps state corrections out of the more menu',()=>{const {source:s,onAttendance}=source();s.row!({...row,status:'RESERVED',bookingKind:'CARD',cardId:'card'}).onStatus!({} as never);expect(onAttendance).toHaveBeenCalledWith('b',3,'ATTENDED');expect(s.actions(row).map(a=>a.label)).not.toContain('未出席不扣次');});

it('retains the collection verification entry after a paid service reload only when recovery is enabled',()=>{
 const paid={...row,status:'RESERVED',service:{...row.service,payment:{due:0,collected:1000,netPrice:1000,reduction:0,status:'已收款'}}} as NativeRosterBooking;
 const render=(readonly:boolean,enabled:boolean)=>renderToStaticMarkup(h('div',null,source(readonly,enabled).source.row!(paid).cost));
 expect(render(false,true)).toContain('核對收款');
 expect(render(false,false)).not.toContain('核對收款');
 expect(renderToStaticMarkup(h('div',null,source(false,true).source.row!({...paid,status:'CANCELLED'}).cost))).toContain('核對收款');
 expect(render(true,true)).not.toContain('核對收款');
 expect(renderToStaticMarkup(h('div',null,source(false,true).source.row!({...paid,bookingKind:'CARD',cardId:'card'}).cost))).not.toContain('核對收款');
});
