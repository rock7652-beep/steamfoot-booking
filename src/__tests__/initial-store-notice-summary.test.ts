import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({course:vi.fn(),steam:vi.fn(),beauty:vi.fn()}));
vi.mock('@/server/actions/course-digital-manager-notices',()=>({loadCombinedCourseStoreNotices:m.course}));
vi.mock('@/server/actions/steamfoot-store-notices',()=>({loadSteamfootStoreNotices:m.steam}));
vi.mock('@/server/actions/beauty-store-notices',()=>({loadBeautyStoreNotices:m.beauty}));
import {readInitialStoreNoticeSummary,boundedInitialNoticeSummary} from '@/server/services/initial-store-notice-summary';
import type {StoreNoticeLoadResult} from '@/lib/store-notices';
const good=():StoreNoticeLoadResult=>({success:true,storeId:'a',enabled:true,items:[],count:7,latestAt:'2026-10-31T00:00:00Z',canHandle:true,more:true});
beforeEach(()=>{vi.clearAllMocks();for(const f of Object.values(m))f.mockResolvedValue(good());});afterEach(()=>vi.useRealTimers());
describe('bounded authoritative initial notice summary',()=>{
 it.each(['course','steamfoot','beauty'])('uses the existing authorized %s reader and only exposes summary fields',async module=>{
  expect(await readInitialStoreNoticeSummary(module,'a')).toEqual({storeId:'a',count:7,latestAt:'2026-10-31T00:00:00Z'});
  const f=module==='course'?m.course:module==='steamfoot'?m.steam:m.beauty;
  expect(f).toHaveBeenCalledWith({storeId:'a',handled:false,offset:0,summaryOnly:true});expect(Object.values(m).reduce((n,f)=>n+f.mock.calls.length,0)).toBe(1);
 });
 it('does not read a platform-wide or retired-module scope',async()=>{
  expect(await readInitialStoreNoticeSummary('course','')).toBeNull();expect(await readInitialStoreNoticeSummary('spa','a')).toBeNull();expect(m.course).not.toHaveBeenCalled();expect(m.beauty).not.toHaveBeenCalled();
 });
 it('keeps the page available on authorization failure and does not retry outside the reader',async()=>{
  m.course.mockResolvedValue({success:false,error:'forbidden'});expect(await readInitialStoreNoticeSummary('course','a')).toBeNull();expect(m.course).toHaveBeenCalledTimes(1);
  m.course.mockRejectedValue(Error('unavailable'));expect(await readInitialStoreNoticeSummary('course','a')).toBeNull();
 });
 it('rejects another store, a disabled source and malformed counts',async()=>{
  for(const change of [{storeId:'b'},{enabled:false},{count:-1},{count:1.5}])expect(await boundedInitialNoticeSummary('a',async()=>({...good(),...change}))).toBeNull();
 });
 it('expires the optional read budget and ignores its late result without retaining data',async()=>{
  vi.useFakeTimers();let resolve!:(v:StoreNoticeLoadResult)=>void;const result=boundedInitialNoticeSummary('a',()=>new Promise(r=>{resolve=r;}));
  await vi.advanceTimersByTimeAsync(250);expect(await result).toBeNull();resolve(good());await vi.runAllTimersAsync();expect(await result).toBeNull();
 });
});
