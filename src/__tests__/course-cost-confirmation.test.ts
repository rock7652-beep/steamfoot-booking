import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({actor:vi.fn(),grants:vi.fn(),feature:vi.fn(),find:vi.fn(),raw:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.actor,courseTransaction:async(_store:string,work:(tx:unknown)=>unknown)=>work({coursePointPlan:{findFirst:m.find},$executeRaw:m.raw})}));
vi.mock('@/lib/permissions',()=>({checkPermission:m.grants}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
import {confirmCourseFeeCosts} from '@/server/actions/course-cost-review';
import {courseFeeCostVersion} from '@/lib/course-cost-review';
const plan={id:'fee',name:'課程',price:600,storeCost:0,points:1,unit:'SESSION',isActive:true,chargeSettings:null};
beforeEach(()=>{vi.clearAllMocks();m.actor.mockResolvedValue({storeId:'store-a',user:{id:'owner',role:'OWNER',staffId:'staff'}});m.grants.mockResolvedValue(true);m.feature.mockResolvedValue(true);m.find.mockResolvedValue(plan);});
it('records only the exact current store/version and replays with the same audit identity',async()=>{
 const data={id:'fee',expectedVersion:courseFeeCostVersion(plan),storeId:'forged-store'};
 expect(await confirmCourseFeeCosts(data)).toMatchObject({success:true,id:'fee',version:data.expectedVersion});
 await confirmCourseFeeCosts(data);
 expect(m.find).toHaveBeenCalledWith({where:{id:'fee',storeId:'store-a'}});
 expect(m.raw.mock.calls[0][1]).toBe(m.raw.mock.calls[1][1]);
 expect((m.raw.mock.calls[0][0] as string[]).join('')).toContain('ON CONFLICT(id) DO NOTHING');
});
it('rejects missing store ownership, stale costs and insufficient grants before recording confirmation',async()=>{
 m.find.mockResolvedValue(null);expect(await confirmCourseFeeCosts({id:'other-store',expectedVersion:courseFeeCostVersion(plan)})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.find.mockResolvedValue({...plan,storeCost:100});expect(await confirmCourseFeeCosts({id:'fee',expectedVersion:courseFeeCostVersion(plan)})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.actor.mockResolvedValue({storeId:'store-a',user:{id:'staff',role:'STAFF',staffId:'staff'}});expect(await confirmCourseFeeCosts({id:'fee',expectedVersion:courseFeeCostVersion(plan)})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.actor.mockResolvedValue({storeId:'store-a',user:{id:'owner',role:'OWNER',staffId:'staff'}});m.grants.mockResolvedValue(false);expect(await confirmCourseFeeCosts({id:'fee',expectedVersion:courseFeeCostVersion(plan)})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
});

it('enforces the report feature on direct confirmation requests',async()=>{m.feature.mockResolvedValue(false);expect(await confirmCourseFeeCosts({id:'fee',expectedVersion:courseFeeCostVersion(plan)})).toMatchObject({success:false});expect(m.find).not.toHaveBeenCalled();expect(m.raw).not.toHaveBeenCalled();});

it('does not mark a missing trial cost as confirmed',async()=>{const missing={...plan,chargeSettings:{kind:'single',durationMinutes:60,trialPrice:300,trialDuration:null,providerIds:['teacher']}};m.find.mockResolvedValue(missing);expect(await confirmCourseFeeCosts({id:'fee',expectedVersion:courseFeeCostVersion(missing)})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();});
