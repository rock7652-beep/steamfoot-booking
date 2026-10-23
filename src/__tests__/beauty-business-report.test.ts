import {describe,it,expect} from 'vitest';
import {beautyBusinessReport} from '@/lib/beauty/business-report';
const date=(s:string)=>new Date(s+'T01:00:00Z');
const visit=(id:string,customerId:string|null,day:string,technicianId='a',isTrial=false,status='COMPLETED')=>({id,customerId,personName:id,technicianId,isTrial,status,startsAt:date(day),endsAt:new Date(+date(day)+3600000)});
const input={range:{startDate:'2026-10-01',endDate:'2026-10-31'},scope:{view:'store' as const,person:'all'},now:date('2026-10-22'),createdDate:'2026-09-01',canCustomers:true,canPlans:true,finance:true,customers:[{id:'old',name:'舊客'},{id:'new',name:'新客'}],technicians:[{id:'a',name:'技師A'},{id:'b',name:'技師B'}],visits:[visit('prior','old','2026-09-02'),visit('current','old','2026-10-03'),visit('first','new','2026-10-04','a',true),visit('repeat','new','2026-10-05','b',true),visit('guest',null,'2026-10-05'),visit('cancelled','old','2026-10-06','a',true,'CANCELLED'),visit('absent','old','2026-10-07','a',true,'NO_SHOW'),visit('future','new','2026-10-30')],cards:[{id:'card',customerId:'new',createdAt:date('2026-10-06'),paid:4500,revenueStaffId:null,refunds:[]}],rows:[{date:'2026-10-04',technicianId:'a',reserved:1,completed:1,trial:1,revenue:1000},{date:'2026-10-10',technicianId:'a',reserved:0,completed:0,trial:0,revenue:-200}]};
describe('Beauty data into the original analytics workspace',()=>{
 it('counts completed anonymous visits but never invents customers or counts cancelled/no-show/future services',()=>{
  const r=beautyBusinessReport(input);
  expect(r.attendance).toBe(4);expect(r.counts.visitors).toBe(2);expect(r.counts.trial).toBe(1);expect(r.counts.newVisitors).toBe(1);expect(r.counts.oldVisitors).toBe(1);
  expect(r.retentionBase).toBe(1);expect(r.counts.returned).toBe(1);expect(r.counts.converted).toBe(1);expect(r.netRevenue).toBe(800);expect(r.comparison?.attendance).toBe(1);
 });
 it('uses original sports trial credit for the actual last trial technician while retaining service-only receipts',()=>{
  const r=beautyBusinessReport({...input,scope:{view:'coach',person:'b'}});
  expect(r.attendance).toBe(1);expect(r.hours).toBe(1);expect(r.netRevenue).toBe(0);expect(r.counts.newCard).toBe(1);expect(r.fee).toBeNull();
 });
 it('omits customer names, plans and money when their permissions are unavailable',()=>{
  const r=beautyBusinessReport({...input,canCustomers:false,canPlans:false,finance:false,cards:[]});
  expect(r.segments).toBeNull();expect(r.netRevenue).toBeNull();expect(r.counts.newCard).toBe(0);expect(r.trend.every(v=>!('revenue' in v))).toBe(true);
 });
 it('leaves a future-only range empty with no invented comparison',()=>{
  const r=beautyBusinessReport({...input,range:{startDate:'2026-11-01',endDate:'2026-11-30'}});
  expect(r.attendance).toBe(0);expect(r.comparison).toBeNull();expect(r.trend.every(v=>v.attendance===0)).toBe(true);
 });
 it('keeps daily and monthly attendance equal to completed-service KPIs despite future aggregate records',()=>{
  const r=beautyBusinessReport({...input,rows:[...input.rows,{date:'2026-10-30',technicianId:'a',reserved:1,completed:1,trial:0,revenue:2000}]});
  expect(r.trend.reduce((n,d)=>n+d.attendance,0)).toBe(r.attendance);
  expect(r.monthlyTrend.find(d=>d.date==='2026-10')?.attendance).toBe(r.attendance);
  expect(r.trend.find(d=>d.date==='2026-10-30')).toMatchObject({available:false,attendance:0,revenue:0});
  expect(r.netRevenue).toBe(800);
 });
 it('does not count future plan cards as a current purchase or conversion',()=>{
  const r=beautyBusinessReport({...input,cards:[{id:'future-card',customerId:'new',createdAt:date('2026-10-30'),paid:4500,revenueStaffId:null,refunds:[]}]});
  expect(r.counts.newCard).toBe(0);expect(r.counts.converted).toBe(0);expect(r.conversionRate).toBe(0);
 });
});

it('uses current customer assignment for services and immutable purchase assignment for manager sales',()=>{
 const customers=input.customers.map(c=>({...c,assignedStaff:{id:'current-manager'}}));
 const cards=input.cards.map(c=>({...c,revenueStaffId:'sale-manager'}));
 const rows=input.rows.map(r=>({...r,managerId:'sale-manager'}));
 const current=beautyBusinessReport({...input,customers,cards,rows,scope:{view:'manager',person:'current-manager'}});
 expect(current.attendance).toBe(3);expect(current.counts.newCard).toBe(0);expect(current.netRevenue).toBe(0);
 const sale=beautyBusinessReport({...input,customers,cards,rows,scope:{view:'manager',person:'sale-manager'}});
 expect(sale.attendance).toBe(0);expect(sale.counts.newCard).toBe(1);expect(sale.netRevenue).toBe(800);
 const unknown=beautyBusinessReport({...input,customers,scope:{view:'manager',person:'unassigned'}});
 expect(unknown.counts.newCard).toBe(1);expect(unknown.attendance).toBe(1);
});
it('reuses the original paid/refund cutoff rules for conversion and new-card metrics',()=>{
 const refunded=input.cards.map(c=>({...c,refunds:[{amount:4500,createdAt:date('2026-10-08')}]}));
 const report=beautyBusinessReport({...input,cards:refunded});
 expect(report.counts.newCard).toBe(0);expect(report.counts.converted).toBe(0);
 const free=beautyBusinessReport({...input,cards:input.cards.map(c=>({...c,paid:0}))});
 expect(free.counts.newCard).toBe(0);expect(free.counts.converted).toBe(0);
 const future=beautyBusinessReport({...input,cards:refunded.map(c=>({...c,refunds:[{amount:4500,createdAt:date('2026-10-30')}]}))});
 expect(future.counts.newCard).toBe(1);expect(future.counts.converted).toBe(1);
});
