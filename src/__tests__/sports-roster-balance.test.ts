import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({session:vi.fn(),cards:vi.fn(),rule:vi.fn(),templates:vi.fn(),sessionBatch:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseSession:{findFirst:m.session,findMany:m.sessionBatch},coursePointCard:{findMany:m.cards},courseTemplate:{findMany:m.templates}}}));
vi.mock('@/server/services/sports-staging-schedule',()=>({readSportsSessionRule:m.rule}));
import {readSportsRosterBalances} from '@/server/services/sports-roster-balance';
const card=(id:string,remaining:number,held=0)=>({id,remaining,storeId:'store',sportsMode:'ASSIGNED',sportsSubjectId:'dance',sportsCost:1,unit:'SESSION',planId:'plan',templateIds:['old'],nameSnapshot:'十堂舞蹈',requestKey:'normal',termSessionIds:[],members:[{customerId:'a'},{customerId:'b'}],bookings:[{pointCost:held}]});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({id:'session',templateId:'current',startsAt:new Date('2099-10-28'),pointCost:1,template:{musicSubjectId:'dance'}});m.rule.mockResolvedValue({enrollment:'ASSIGNED',planId:null});m.cards.mockResolvedValue([]);m.templates.mockResolvedValue([{id:'current'},{id:'old'}]);});
it('separates fixed and open balances in one class, even for shared-card members',async()=>{
 m.rule.mockResolvedValue({enrollment:'OPEN',planId:null,payload:{students:[{customerId:'a',cardId:null}]}});
 m.cards.mockResolvedValue([card('assigned',10),{...card('open',20),sportsMode:'OPEN',sportsSubjectId:null,sportsCost:null}]);
 const {coursePrisma}=await import('@/lib/course-db');
 const session={id:'session',requestKey:'schedule',requestIndex:0};
 const bookings=[{customerId:'a',requestKey:'sports-fixed:session:a',session},{customerId:'b',requestKey:'self-booking',session}];
 const result=await readSportsRosterBalances('store','session',['a','b'],coursePrisma,undefined,bookings);
 expect(result.get('a')).toMatchObject({remaining:10});expect(result.get('b')).toMatchObject({remaining:20});
});
it('batches learners in the same store and displays remaining separately from shared holds',async()=>{
 m.cards.mockResolvedValue([card('card',10,3)]);
 const result=await readSportsRosterBalances('store','session',['a','b','a']);
 expect(m.cards).toHaveBeenCalledTimes(1);
 expect(m.cards.mock.calls[0][0].where).toMatchObject({storeId:'store',closedAt:null,members:{some:{customerId:{in:['a','b']}}},expiresAt:{gte:new Date('2099-10-28')}});
 expect(result.get('a')).toMatchObject({remaining:10,available:7,cost:1,unit:'SESSION',planName:'同項目方案合計'});expect(result.get('b')).toEqual(result.get('a'));
});
it('sums all eligible cards including an exhausted A1 and remaining A2',async()=>{m.cards.mockResolvedValue([card('empty',2,2),card('usable',8,1)]);expect((await readSportsRosterBalances('store','session',['a'])).get('a')?.remaining).toBe(10);});
it('never treats another subject or restricted term as usable rights',async()=>{m.cards.mockResolvedValue([{...card('wrong',10),sportsSubjectId:'yoga'},{...card('term',10),termSessionIds:['other']}]);expect((await readSportsRosterBalances('store','session',['a'])).size).toBe(0);});
it('shows insufficient remaining without pretending a booking or debit occurred',async()=>{m.cards.mockResolvedValue([card('empty',0)]);expect((await readSportsRosterBalances('store','session',['a'])).get('a')).toMatchObject({remaining:0,available:0});});
it('does no queries for an empty list and returns no inferred rights without a rule',async()=>{expect((await readSportsRosterBalances('store','session',[])).size).toBe(0);expect(m.session).not.toHaveBeenCalled();m.rule.mockResolvedValue(null);m.cards.mockResolvedValue([card('card',10)]);expect((await readSportsRosterBalances('store','session',['a'])).size).toBe(0);});

it('A1兩堂加A2十堂顯示12；其他項目及共用關聯不重複',async()=>{m.cards.mockResolvedValue([card('a1',2),card('a2',10),{...card('b',20),sportsSubjectId:'other'}]);const result=await readSportsRosterBalances('store','session',['a']);expect(result.get('a')).toMatchObject({remaining:12,available:12});});
it('shares only session metadata and always re-reads current cards and held amounts',async()=>{
 const {withReadRequestMemo}=await import('@/server/services/read-request-memo');
 m.cards.mockResolvedValueOnce([card('card',10,3)]).mockResolvedValueOnce([card('card',8,2)]);
 await withReadRequestMemo(async()=>{
  expect((await readSportsRosterBalances('store','session',['a'])).get('a')).toMatchObject({remaining:10,available:7});
  expect((await readSportsRosterBalances('store','session',['a'])).get('a')).toMatchObject({remaining:8,available:6});
 });
 expect(m.session).toHaveBeenCalledTimes(1);expect(m.templates).toHaveBeenCalledTimes(1);expect(m.cards).toHaveBeenCalledTimes(2);
});
it('uses joined member/hold reads only for the ordinary read client, retaining transaction reads',async()=>{
 const {coursePrisma}=await import('@/lib/course-db');
 await readSportsRosterBalances('store','session',['a']);expect(m.cards.mock.calls[0][0].relationLoadStrategy).toBe('join');
 const tx={...coursePrisma} as unknown as Parameters<typeof readSportsRosterBalances>[3];m.cards.mockClear();await readSportsRosterBalances('store','session',['a'],tx);expect(m.cards.mock.calls[0][0]).not.toHaveProperty('relationLoadStrategy');
});

import {withCourseCalendarRead} from '@/server/services/course-calendar-read-scope';
it('uses one month card read but checks each class date and never reuses a transaction balance',async()=>{
 const {coursePrisma}=await import('@/lib/course-db');
 const a={id:'a',templateId:'current',startsAt:new Date('2099-10-28'),pointCost:1,template:{musicSubjectId:'dance'}},b={...a,id:'b',startsAt:new Date('2099-12-28')};m.sessionBatch.mockResolvedValue([a,b]);m.cards.mockResolvedValue([{...card('rights',10,3),expiresAt:new Date('2099-11-01')}]);
 const result=await withCourseCalendarRead('store',['a','b'],()=>Promise.all(['a','b'].map(id=>readSportsRosterBalances('store',id,['a'],coursePrisma,['a','b']))));
 expect(result[0].get('a')).toMatchObject({remaining:10,available:7});expect(result[1].size).toBe(0);expect(result[0].has('b')).toBe(false);expect(m.cards).toHaveBeenCalledOnce();expect(m.sessionBatch).toHaveBeenCalledOnce();
 m.cards.mockClear();const tx={...coursePrisma} as unknown as Parameters<typeof readSportsRosterBalances>[3];
 await withCourseCalendarRead('store',['a'],()=>Promise.all([1,2].map(()=>readSportsRosterBalances('store','a',['a'],tx,['a','b']))));expect(m.cards).toHaveBeenCalledTimes(2);
});
