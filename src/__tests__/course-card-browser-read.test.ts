import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),customer:vi.fn(),people:vi.fn(),music:vi.fn(),cards:vi.fn(),totals:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer,findMany:m.people},storeFeatureEntitlement:{findFirst:m.music}}}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.auth}));
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:m.scope}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({assignedStaffId:'teacher'})}));
vi.mock('@/server/services/music-plan-scope',()=>({musicCardWhere:()=>({classified:true})}));
vi.mock('@/server/queries/course-members',()=>({getCourseCards:m.cards}));
vi.mock('@/server/queries/course-balance-summary',()=>({getCourseBalanceSummary:m.totals}));
import {readCourseCards} from '@/server/queries/course-card-browser';
import {permissionRequestSession} from '@/lib/permission-request-session';
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({user:{id:'actor',role:'STAFF',staffId:'teacher'},storeId:'store-lubymusic'});m.scope.mockReturnValue(true);m.customer.mockResolvedValue({id:'learner'});m.people.mockResolvedValue([{id:'learner'}]);m.music.mockResolvedValue({storeId:'store-lubymusic'});m.cards.mockResolvedValue([]);m.totals.mockResolvedValue([]);});
it('retains both permissions, visibility, classification and paging',async()=>{expect((await readCourseCards({customerId:'learner',page:2,dataScope:'legacy'},true)).success).toBe(true);expect(m.auth.mock.calls.map(x=>x[0])).toEqual(['wallet.read','customer.read']);expect(m.auth.mock.calls.every(x=>x[1].reuseVerifiedStore)).toBe(true);expect(m.customer.mock.calls[0][0].where).toMatchObject({id:'learner',storeId:'store-lubymusic',assignedStaffId:'teacher'});const q=m.cards.mock.calls[0][2];expect(q.skip).toBe(40);expect(q.where.AND).toContainEqual({classified:true});expect(q.where.AND).toContainEqual({members:{some:{customerId:{in:['learner']},storeId:'store-lubymusic'}}});});
it('rejects scope mismatch before any customer or wallet read',async()=>{m.auth.mockResolvedValueOnce({user:{id:'actor'},storeId:'other'});expect((await readCourseCards({},true)).success).toBe(false);expect(m.customer).not.toHaveBeenCalled();expect(m.cards).not.toHaveBeenCalled();});
it('rejects nonpreview and invisible students without reading cards',async()=>{m.scope.mockReturnValue(false);expect((await readCourseCards({},true)).success).toBe(false);m.scope.mockReturnValue(true);m.customer.mockResolvedValue(null);expect((await readCourseCards({customerId:'hidden'},true)).success).toBe(false);expect(m.cards).not.toHaveBeenCalled();});
it('starts independent full totals without waiting for filtered cards',async()=>{let finish!:(v:unknown[])=>void;m.cards.mockImplementation(()=>new Promise(r=>finish=r));const p=readCourseCards({customerId:'learner',search:'A'},true);await vi.waitFor(()=>expect(m.totals).toHaveBeenCalled());finish([]);expect((await p).success).toBe(true);});
it('does not compute full totals for a single card detail',async()=>{expect((await readCourseCards({cardId:'card'},true)).success).toBe(true);expect(m.totals).not.toHaveBeenCalled();expect(m.cards.mock.calls[0][2]).toMatchObject({skip:0,take:1,entries:true});});
const card=(id:string,unit='SESSION',remaining=10,held=1)=>({id,unit,remaining,held,available:remaining-held,expired:false,closed:false});
it('does not expose another shared learner\'s internal adjustment notes to a scoped staff reader',async()=>{
 m.cards.mockResolvedValue([{...card('shared'),sessionAdjustments:[{id:'mine',customerId:'learner',reason:'可見原因'},{id:'hidden',customerId:'other',reason:'其他學員內部原因'}]}]);
 const result=await readCourseCards({cardId:'shared'},true);
 expect(result.success&&result.rows[0].sessionAdjustments).toEqual([{id:'mine',customerId:'learner',reason:'可見原因'}]);
 expect(JSON.stringify(result)).not.toContain('其他學員內部原因');
});
it('uses one authoritative read for all initial customer balances while returning only the first twenty cards',async()=>{
 m.cards.mockResolvedValue(Array.from({length:24},(_,i)=>card('card-'+i)));
 expect(await readCourseCards({customerId:'learner'})).toMatchObject({success:true,hasMore:true,totals:[{unit:'SESSION',count:24,remaining:240,held:24,available:216}]});
 const result=await readCourseCards({customerId:'learner'});expect(result.success&&result.rows).toHaveLength(20);
 expect(m.totals).not.toHaveBeenCalled();expect(m.cards.mock.calls[0][2]).toMatchObject({skip:0,entries:false});
});
it('keeps unlike units separate and preserves blocked availability in the reused projection',async()=>{
 m.cards.mockResolvedValue([card('A1'),card('A2','SESSION',20,0),card('points','POINT',100,2),{...card('blocked','SESSION',7,0),available:0},{...card('expired'),expired:true},{...card('closed'),closed:true}]);
 expect(await readCourseCards({customerId:'learner'})).toMatchObject({success:true,totals:[{unit:'SESSION',count:3,remaining:37,held:1,available:29},{unit:'POINT',count:1,remaining:100,held:2,available:98}]});
 expect(m.totals).not.toHaveBeenCalled();
});
it.each([{page:1},{history:true},{search:'A'}])('retains full totals independent of filtered or later-page rows (%j)',async filter=>{
 m.cards.mockResolvedValue([card('subset')]);m.totals.mockResolvedValue([{unit:'SESSION',count:24,remaining:240,held:24,available:216}]);
 expect(await readCourseCards({customerId:'learner',...filter})).toMatchObject({success:true,totals:[{remaining:240}]});expect(m.totals).toHaveBeenCalledOnce();
});
it.each([false,true])('shares only this read request identity without coupling it to preview eligibility (%s)',async preview=>{
 const authenticate=vi.fn().mockResolvedValue({id:'actor',role:'OWNER',staffId:'owner'});
 m.auth.mockImplementation(async()=>({user:await permissionRequestSession(authenticate),storeId:'store-lubymusic'}));
 await readCourseCards({customerId:'learner'},preview);expect(authenticate).toHaveBeenCalledOnce();expect(m.auth).toHaveBeenCalledTimes(2);
 authenticate.mockRejectedValue(new Error('revoked'));expect((await readCourseCards({customerId:'learner'},preview)).success).toBe(false);expect(authenticate).toHaveBeenCalledTimes(2);
});
