import {expect,it} from 'vitest';
import {beautyBusinessMetrics} from '@/lib/beauty/business-metrics';
const d=(date:string)=>new Date(date+'T01:00:00Z');
it('counts plan purchases per buyer and return/trial cohorts using completed services',()=>{
 const range={startDate:'2026-10-01',endDate:'2026-10-31'};
 const visits=[{customerId:'old',startsAt:d('2026-09-01'),status:'COMPLETED',isTrial:false},{customerId:'old',startsAt:d('2026-10-03'),status:'COMPLETED',isTrial:false},{customerId:'no-return',startsAt:d('2026-09-02'),status:'COMPLETED',isTrial:false},{customerId:'trial',startsAt:d('2026-10-02'),status:'COMPLETED',isTrial:true},{customerId:'trial',startsAt:d('2026-10-03'),status:'COMPLETED',isTrial:true},{customerId:'cancelled',startsAt:d('2026-10-01'),status:'CANCELLED',isTrial:true}];
 const cards=[{id:'first',customerId:'old',createdAt:d('2026-09-01')},{id:'second',customerId:'old',createdAt:d('2026-10-02')},{id:'third',customerId:'trial',createdAt:d('2026-10-04')}];
 expect(beautyBusinessMetrics(visits,cards,range)).toMatchObject({newCard:1,renewal:1,eligibleTrials:1,converted:1,conversionRate:100,returned:1,notReturned:1,retentionBase:2,retentionRate:50});
});
it('does not count a plan bought before a trial as conversion and leaves empty rates unknown',()=>{
 const range={startDate:'2026-10-01',endDate:'2026-10-31'};
 expect(beautyBusinessMetrics([],[],range)).toMatchObject({conversionRate:null,retentionRate:null});
 expect(beautyBusinessMetrics([{customerId:'a',status:'COMPLETED',isTrial:true,startsAt:d('2026-10-03')}],[{id:'c',customerId:'a',createdAt:d('2026-10-01')}],range).converted).toBe(0);
});
