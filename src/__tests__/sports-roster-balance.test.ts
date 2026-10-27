import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({session:vi.fn(),cards:vi.fn(),rule:vi.fn(),templates:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseSession:{findFirst:m.session},coursePointCard:{findMany:m.cards},courseTemplate:{findMany:m.templates}}}));
vi.mock('@/server/services/sports-staging-schedule',()=>({readSportsSessionRule:m.rule}));
import {readSportsRosterBalances} from '@/server/services/sports-roster-balance';
const card=(id:string,remaining:number,held=0)=>({id,remaining,storeId:'store',sportsMode:'ASSIGNED',sportsSubjectId:'dance',sportsCost:1,unit:'SESSION',planId:'plan',templateIds:['old'],nameSnapshot:'十堂舞蹈',requestKey:'normal',termSessionIds:[],members:[{customerId:'a'},{customerId:'b'}],bookings:[{pointCost:held}]});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({id:'session',templateId:'current',startsAt:new Date('2099-10-28'),pointCost:1,template:{musicSubjectId:'dance'}});m.rule.mockResolvedValue({enrollment:'ASSIGNED',planId:null});m.cards.mockResolvedValue([]);m.templates.mockResolvedValue([{id:'current'},{id:'old'}]);});
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
