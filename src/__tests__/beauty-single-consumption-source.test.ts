// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({props:null as unknown}));
vi.mock('@/server/actions/beauty',()=>({readBeautySlots:vi.fn(),bookBeautyParty:vi.fn()}));
vi.mock('@/server/actions/beauty-native-schedule',()=>({scheduleNativeBeautyService:vi.fn()}));
vi.mock('@/server/actions/course-rental',()=>({createRentalCustomer:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/sports-schedule-dialog',()=>({SportsScheduleDialog:()=>null}));
vi.mock('@/app/(dashboard)/dashboard/courses/sports-schedule-fields',()=>({SportsScheduleFields:(props:unknown)=>{m.props=props;return null;}}));
import {BeautyNativeScheduleFields} from '@/components/beauty/native-schedule-source';
it('single consumption retains general/trial prices and never auto-selects a stored card',async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div'),root=createRoot(host);const data={storeId:'store',date:'2099-01-01',services:[{id:'s',name:'按摩',active:true,revision:1,price:1100,trialPrice:750,trialDuration:45,duration:60,buffer:15}],locations:[],techs:[],customers:[],cards:[{id:'c',memberIds:['customer'],serviceIds:['s'],remaining:5,held:0,closedAt:null,expiresAt:'2099-12-31T15:59:59Z'}],policy:{revision:0},manage:{customer:false},access:{customerAccess:true}};await act(async()=>root.render(h(BeautyNativeScheduleFields,{data:data as never,date:data.date,seed:{customerId:'customer'},singlePaymentOnly:true,onGuard:vi.fn(),onCreated:vi.fn()})));const props=m.props as {source:{reservation:{cards:unknown[];services:{price:number;trialPrice:number;trialDuration:number}[]}}};expect(props.source.reservation.cards).toEqual([]);expect(props.source.reservation.services[0]).toMatchObject({price:1100,trialPrice:750,trialDuration:45});expect(data.cards).toHaveLength(1);await act(async()=>root.unmount());});
