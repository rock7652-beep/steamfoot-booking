import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({overview:vi.fn(),cards:vi.fn(),periods:vi.fn(),purchases:vi.fn()}));
vi.mock('@/server/actions/music-periods',()=>({loadMusicPeriods:m.periods}));
vi.mock('@/server/actions/course-customer-history',()=>({loadCourseCustomerPurchases:m.purchases}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/queries/music-student-workspace',()=>({readMusicStudentWorkspace:m.overview}));
vi.mock('@/server/queries/course-card-browser',()=>({readCourseCards:m.cards}));
import {readMusicPurchaseSnapshot} from '@/server/queries/music-purchase-snapshot';
import {createPurchaseSnapshotSeeds,purchaseSnapshotKey,type MusicPurchaseSnapshot} from '@/lib/music-purchase-snapshot';
const snapshot={customerId:'learner',overview:{success:true,data:{balance:{remaining:19}}},cards:{success:true,rows:[{id:'new'}],hasMore:false}} as MusicPurchaseSnapshot;
beforeEach(()=>{vi.clearAllMocks();m.periods.mockResolvedValue({success:false});m.purchases.mockResolvedValue({success:false});m.overview.mockResolvedValue(snapshot.overview);m.cards.mockResolvedValue(snapshot.cards);});
afterEach(()=>vi.useRealTimers());
it('runs the authorized readers for exactly the purchase learner',async()=>{expect(await readMusicPurchaseSnapshot({customerId:'learner',storeId:'untrusted'})).toEqual(snapshot);expect(m.overview).toHaveBeenCalledWith('learner',true,undefined,false);expect(m.cards).toHaveBeenCalledWith({customerId:'learner'},true,undefined,true);});
it('never returns partial denied data or throws into a committed purchase',async()=>{m.cards.mockResolvedValue({success:false,error:'denied'});expect(await readMusicPurchaseSnapshot({customerId:'learner'})).toBeNull();m.cards.mockRejectedValue(new Error('offline'));expect(await readMusicPurchaseSnapshot({customerId:'learner'})).toBeNull();expect(await readMusicPurchaseSnapshot({})).toBeNull();});
it('hands exact authorized state to each reader once and never to another learner or filter',()=>{const seeds=createPurchaseSnapshotSeeds();seeds.install(snapshot);expect(seeds.take('course-card',[{customerId:'other'}])).toBeUndefined();for(const extra of [{search:'x'},{history:true},{page:1},{dataScope:'legacy'},{cardId:'new'}])expect(seeds.take('course-card',[{customerId:'learner',...extra}])).toBeUndefined();expect(seeds.take('music-student-workspace',['learner',true])).toBeUndefined();expect(seeds.take('music-student-workspace',['learner',false])).toEqual(snapshot.overview);expect(seeds.take('course-card',[{page:0,history:false,search:'',customerId:'learner',dataScope:undefined}])).toEqual(snapshot.cards);expect(seeds.take('course-card',[{customerId:'learner'}])).toBeUndefined();});
it('expires unused data, clears on invalidation, and isolates providers',()=>{vi.useFakeTimers();const a=createPurchaseSnapshotSeeds(),b=createPurchaseSnapshotSeeds();a.install(snapshot);expect(b.take('course-card',[{customerId:'learner'}])).toBeUndefined();vi.advanceTimersByTime(1501);expect(a.take('course-card',[{customerId:'learner'}])).toBeUndefined();a.install(snapshot);a.clear();expect(a.take('course-card',[{customerId:'learner'}])).toBeUndefined();expect(purchaseSnapshotKey('other',[])).toBeNull();});

it('seeds only exact current period and first-page history reads and keeps denied sections absent',async()=>{
 m.periods.mockResolvedValue({success:true,data:[{id:'period'}]});m.purchases.mockResolvedValue({success:true,data:[{id:'sale'}],hasMore:false});
 const result=await readMusicPurchaseSnapshot({customerId:'learner'});expect(result).toMatchObject({periods:{success:true},purchases:{success:true}});
 const seeds=createPurchaseSnapshotSeeds();seeds.install(result!);
 expect(seeds.take('music-periods',['foreign'])).toBeUndefined();expect(seeds.take('purchases',['learner',20])).toBeUndefined();expect(seeds.take('purchases',['learner',0,{from:'2026-01-01'}])).toBeUndefined();
 expect(seeds.take('music-periods',['learner'])).toMatchObject({data:[{id:'period'}]});expect(seeds.take('purchases',['learner',0])).toMatchObject({data:[{id:'sale'}]});expect(seeds.take('course-card-browse',[{customerId:'learner'}])).toEqual(snapshot.cards);
});

it('reads only the visible period/history sections for the native student courses view',async()=>{
 m.periods.mockResolvedValue({success:true,data:[]});m.purchases.mockResolvedValue({success:true,data:[],hasMore:false});
 expect(await readMusicPurchaseSnapshot({customerId:'learner',musicSnapshotView:'periods'})).toMatchObject({customerId:'learner',periods:{success:true},purchases:{success:true}});
 expect(m.overview).not.toHaveBeenCalled();expect(m.cards).not.toHaveBeenCalled();
 m.periods.mockResolvedValue({success:false});m.purchases.mockResolvedValue({success:false});expect(await readMusicPurchaseSnapshot({customerId:'learner',musicSnapshotView:'periods'})).toBeNull();
});
