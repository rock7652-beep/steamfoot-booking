import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({course:vi.fn(),steam:vi.fn(),beauty:vi.fn()}));
vi.mock('@/server/actions/course-digital-manager-notices',()=>({loadCombinedCourseStoreNotices:m.course}));
vi.mock('@/server/actions/steamfoot-store-notices',()=>({loadSteamfootStoreNotices:m.steam}));
vi.mock('@/server/actions/beauty-store-notices',()=>({loadBeautyStoreNotices:m.beauty}));
import {readInitialStoreNoticeSummary,boundedInitialNoticeSummary,prefetchInitialNoticeSummary} from '@/server/services/initial-store-notice-summary';
import type {StoreNoticeLoadResult} from '@/lib/store-notices';
const good=():StoreNoticeLoadResult=>({success:true,storeId:'a',enabled:true,items:[],count:7,latestAt:'2026-10-31T00:00:00Z',canHandle:true,more:true});
beforeEach(()=>{vi.clearAllMocks();for(const f of Object.values(m))f.mockResolvedValue(good());});afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();});
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
 it('keeps a prefetch that takes over 250ms when other layout work is still running',async()=>{
  vi.useFakeTimers();const read=vi.fn(()=>new Promise<StoreNoticeLoadResult>(resolve=>setTimeout(()=>resolve(good()),350)));
  const consume=prefetchInitialNoticeSummary('a',read);
  await vi.advanceTimersByTimeAsync(500);
  expect(read).toHaveBeenCalledTimes(1);
  expect(await consume()).toMatchObject({storeId:'a',count:7});
  expect(vi.getTimerCount()).toBe(0);
 });
 it('limits only the additional layout wait and never adopts a result after consumption timed out',async()=>{
  vi.useFakeTimers();let resolve!:(value:StoreNoticeLoadResult)=>void;
  const read=vi.fn(()=>new Promise<StoreNoticeLoadResult>(r=>{resolve=r;}));const consume=prefetchInitialNoticeSummary('a',read);
  await vi.advanceTimersByTimeAsync(500);const result=consume();let done=false;void result.then(()=>{done=true;});
  await vi.advanceTimersByTimeAsync(249);expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);expect(await result).toBeNull();resolve(good());await vi.runAllTimersAsync();
  expect(await consume()).toBeNull();expect(read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
 it('can finish an in-flight prefetch within the remaining layout wait without a duplicate read',async()=>{
  vi.useFakeTimers();const read=vi.fn(()=>new Promise<StoreNoticeLoadResult>(resolve=>setTimeout(()=>resolve(good()),600)));
  const consume=prefetchInitialNoticeSummary('a',read);await vi.advanceTimersByTimeAsync(500);
  const a=consume(),b=consume();expect(a).toBe(b);await vi.advanceTimersByTimeAsync(100);
  expect(await a).toMatchObject({count:7});expect(read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
 it('includes module import and the existing reader in opt-in preview timing without identities',async()=>{
  vi.stubEnv('NOTICE_READ_PERF_QA','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','perf/digital-manager-initial-count-20261031');
  const log=vi.spyOn(console,'info').mockImplementation(()=>{});const value=await readInitialStoreNoticeSummary('course','a');
  expect(value?.readTiming?.spans.map(s=>s.name)).toEqual(['reader.import','reader.execute']);
  const records=log.mock.calls.map(call=>JSON.parse(call[1] as string));
  expect(records.map(r=>r.phase)).toEqual(['settled','consumed']);expect(records[1]).toMatchObject({timedOut:false,valid:true});
  expect(JSON.stringify(records)).not.toContain('storeId');expect(JSON.stringify(records)).not.toContain('latestAt');expect(JSON.stringify(records)).not.toContain('count');
 });
});
