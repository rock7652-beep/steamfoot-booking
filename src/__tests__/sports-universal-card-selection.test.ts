import {beforeEach,expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {findSportsCard} from '@/server/services/sports-card-selection';

const chargeSettings={kind:'plan',durationMinutes:60,trialPrice:null,trialDuration:null,providerIds:['coach']};
const card={id:'twenty',storeId:'store',planId:'universal',sportsMode:'OPEN',sportsSubjectId:null,sportsCost:null,unit:'SESSION',templateIds:[],termSessionIds:[],requestKey:'purchase',remaining:20,bookings:[{pointCost:2}],plan:{storeId:'store',templateIds:['regular','basic','special-old'],chargeSettings}};
const reader={courseTemplate:{findFirst:vi.fn(),findMany:vi.fn()},coursePointCard:{findMany:vi.fn()},coursePurchase:{findMany:vi.fn()}};
const tx=reader as unknown as Prisma.TransactionClient;
const sessions=[{id:'session',templateId:'special-current',startsAt:new Date('2099-11-12'),pointCost:9,coachId:'coach'}];

beforeEach(()=>{
 vi.clearAllMocks();
 reader.courseTemplate.findFirst.mockResolvedValue({musicSubjectId:'special'});
 reader.courseTemplate.findMany.mockResolvedValue([{id:'special-old'},{id:'special-current'}]);
 reader.coursePointCard.findMany.mockResolvedValue([card]);
 reader.coursePurchase.findMany.mockResolvedValue([]);
});

it.each(['ASSIGNED','OPEN'])('selects an old universal card for a checked item in %s mode without changing its balance',async enrollment=>{
 const before=JSON.stringify(card);
 expect(await findSportsCard(tx,'store','learner',sessions,{enrollment,planId:'trial-fee'})).toMatchObject({card:{id:'twenty',remaining:20},cost:1});
 expect(reader.coursePointCard.findMany.mock.calls[0][0]).toMatchObject({where:{storeId:'store',expiresAt:{gte:sessions[0].startsAt}},include:{plan:{select:{storeId:true,templateIds:true,chargeSettings:true}}}});
 expect(JSON.stringify(card)).toBe(before);
});

it('rechecks the current configured items rather than retaining stale plan eligibility',async()=>{
 const rule={enrollment:'ASSIGNED',planId:null};
 expect(await findSportsCard(tx,'store','learner',sessions,rule)).not.toBeNull();
 reader.coursePointCard.findMany.mockResolvedValue([{...card,plan:{...card.plan,templateIds:['one-to-one']}}]);
 expect(await findSportsCard(tx,'store','learner',sessions,rule)).toBeNull();
});

it('keeps shared reservations, teacher and term restrictions authoritative',async()=>{
 for(const patch of [
  {remaining:2},
  {plan:{...card.plan,chargeSettings:{...chargeSettings,providerIds:['other-coach']}}},
  {termSessionIds:['other-session']},
  {plan:{...card.plan,storeId:'other-store'}},
  {templateIds:['original'],requestKey:'no-show-makeup:booking'},
 ]){
  reader.coursePointCard.findMany.mockResolvedValue([{...card,...patch}]);
  expect(await findSportsCard(tx,'store','learner',sessions,{enrollment:'ASSIGNED',planId:null})).toBeNull();
 }
});
