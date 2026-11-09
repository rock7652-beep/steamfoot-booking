import {describe,it,expect} from 'vitest';
import {beautyJourneySegment} from '@/lib/beauty/journey-label';
import {expandServiceJourney} from '@/lib/beauty/expand-service-journey';
import {allocateParty,type Service,type Technician} from '@/lib/beauty/allocation';
import {journeyIssue} from '@/lib/beauty/service-journey';
import {memberPartyInput} from '@/lib/beauty/member-booking';
import {distributeBeautyPayments} from '@/lib/beauty/payment-splits';
import {paymentInput} from '@/lib/beauty/contracts';
const rate={mode:'FIXED',value:100};
const services:Service[]=[{id:'A',name:'A',duration:60,buffer:10,active:true,price:1200,trialPrice:null,defaultRate:rate,addOnGroups:[{id:'g',title:'加做',required:false,multiple:true,options:[{id:'1',name:'1',price:300,duration:20,active:true}]}]},{id:'B',name:'B',duration:40,buffer:5,active:true,price:900,trialPrice:null,defaultRate:rate}];
const person={serviceId:'A',cardId:'card-A',addOnIds:['1'],isTrial:false,preference:'ANY' as const,specifiedTechnicianId:null,additionalServices:[{serviceId:'B',serviceRevision:0,cardId:'card-B',specifiedTechnicianId:null}]};
const tech=(id:string,serviceIds=['A','B']):Technician=>({id,gender:'FEMALE',serviceIds,sort:0,active:true,weekly:{inheritStore:true},exceptions:{},rates:{A:rate,B:rate}});
const base={date:'2099-10-20',startsAt:new Date('2099-10-20T06:00:00Z'),services,locationIds:['room'],technicians:[tech('t')],occupied:[],hours:[{start:'09:00',end:'20:00'}]};
describe('sequential main services and separate cash add-ons',()=>{
 it('keeps one recipient and distinct plan bindings, with add-on and cleanup time in the correct segment',()=>{
  const people=expandServiceJourney([person],services);expect(people.map(p=>p.cardId)).toEqual(['card-A','card-B']);expect(people.map(p=>p.startOffsetMinutes)).toEqual([0,90]);
  const rows=allocateParty({...base,people})!;expect(rows).toHaveLength(2);expect(rows[0].endsAt.toISOString()).toBe('2099-10-20T07:20:00.000Z');expect(rows[1].startsAt!.toISOString()).toBe('2099-10-20T07:30:00.000Z');expect(rows[1].endsAt.toISOString()).toBe('2099-10-20T08:10:00.000Z');
 });
 it('uses a common qualified technician by default and only splits when requested',()=>{
  const technicians=[tech('a',['A']),tech('b',['B'])];
  expect(allocateParty({...base,technicians,people:expandServiceJourney([person],services)})).toBeNull();
  const split=allocateParty({...base,technicians,people:expandServiceJourney([{...person,separateTechnicians:true}],services)})!;
  expect(split.map(s=>s.technicianId)).toEqual(['a','b']);
 });
 it('backtracks to a common technician instead of greedily taking the first A specialist',()=>{
  const rows=allocateParty({...base,technicians:[tech('a',['A']),tech('z')],people:expandServiceJourney([person],services)})!;
  expect(rows.map(s=>s.technicianId)).toEqual(['z','z']);
 });
 it('rejects the whole allocation if the second segment conflicts or crosses closing',()=>{
  const people=expandServiceJourney([person],services);
  expect(allocateParty({...base,people,occupied:[{start:+base.startsAt+100*60000,end:+base.startsAt+110*60000,technicianId:'t',locationId:'room',duration:10,status:'RESERVED'}]})).toBeNull();
  expect(allocateParty({...base,people,hours:[{start:'09:00',end:'16:00'}]})).toBeNull();
 });
 it('does not turn a simultaneous companion into a sequential service',()=>{
  const people=expandServiceJourney([person,{...person,additionalServices:undefined}],services);
  expect(allocateParty({...base,people})).toBeNull();
 });
 it('rejects duplicate service, shared plan, trial and pending recipient combinations',()=>{
  expect(journeyIssue({...person,additionalServices:[{...person.additionalServices[0],serviceId:'A'}]})).toContain('重複');
  expect(journeyIssue({...person,additionalServices:[{...person.additionalServices[0],cardId:'card-A'}]})).toContain('不同');
  expect(journeyIssue({...person,isTrial:true})).toContain('體驗');expect(journeyIssue({...person,pendingIdentity:true})).toContain('資料後補');
 });
 it('preserves the one-service contract and rejects extra services on unnamed companions',()=>{
  const input={requestKey:crypto.randomUUID(),date:'2099-10-20',time:'14:00',policyRevision:0,people:[person]};
  expect(memberPartyInput.safeParse(input).success).toBe(true);expect(memberPartyInput.safeParse({...input,people:[{...person,additionalServices:undefined},person]}).success).toBe(false);
 });
});
describe('mixed service/add-on payments',()=>{
 it('distributes actual methods across service rows without charging twice',()=>{
  expect(distributeBeautyPayments([300,500],'CASH',[{method:'CASH',amount:200},{method:'CARD',amount:600}])).toEqual([[{method:'CASH',amount:200},{method:'CARD',amount:100}],[{method:'CARD',amount:500}]]);
 });
 it('requires exact totals and different methods before any writes',()=>{
  const input={requestKey:crypto.randomUUID(),ids:['a'],amounts:[500],method:'CASH',note:'',splits:[{method:'CASH',amount:200},{method:'CARD',amount:300}]};
  expect(paymentInput.safeParse(input).success).toBe(true);expect(paymentInput.safeParse({...input,amounts:[501]}).success).toBe(false);
  expect(paymentInput.safeParse({...input,splits:[{method:'CASH',amount:200},{method:'CASH',amount:300}]}).success).toBe(false);
 });
});

it('labels only non-overlapping sequential services as a journey and preserves companion actions',()=>{
 const a={id:'a',groupId:'g',customerId:'c',startsAt:'2099-10-20T01:00:00Z',endsAt:'2099-10-20T02:00:00Z'};
 const b={...a,id:'b',startsAt:'2099-10-20T02:15:00Z',endsAt:'2099-10-20T03:00:00Z'};
 expect(beautyJourneySegment([a,b],b)).toEqual({index:2,total:2});
 expect(beautyJourneySegment([a,{...a,id:'companion'}],a)).toBeNull();
 expect(beautyJourneySegment([a,{...b,startsAt:'2099-10-20T01:30:00Z'}],a)).toBeNull();
});
