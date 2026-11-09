import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {noticeReadStep,traceNoticeRead,withNoticeDiagnostics,noticeDiagnosticsEnabled} from '@/server/services/notice-read-timing';
describe('notice request diagnostics',()=>{
 it('keeps concurrent request spans and results isolated',async()=>{
  const [a,b]=await Promise.all([traceNoticeRead(()=>noticeReadStep('access',async()=>{await Promise.resolve();return 'a';})),traceNoticeRead(()=>noticeReadStep('count_query',async()=>3))]);
  expect(a.value).toBe('a');expect(a.timing.spans.map(s=>s.name)).toEqual(['access']);expect(b.value).toBe(3);expect(b.timing.spans.map(s=>s.name)).toEqual(['count_query']);expect(b.timing.spans[0].ok).toBe(true);
 });
 it('does not change the regular action payload or swallow errors',async()=>{
  const value={success:false,error:'denied'};expect(await withNoticeDiagnostics(async()=>value)).toBe(value);
  await expect(traceNoticeRead(()=>noticeReadStep('access',async()=>{throw Error('denied');}))).rejects.toThrow('denied');
 });
 it('allows diagnostic payloads only on the exact opt-in isolated Preview branch',()=>{
  const env={NOTICE_READ_PERF_QA:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'perf/digital-manager-initial-count-20261031'};
  expect(noticeDiagnosticsEnabled(env)).toBe(true);expect(noticeDiagnosticsEnabled({...env,VERCEL_ENV:'production'})).toBe(false);expect(noticeDiagnosticsEnabled({...env,VERCEL_GIT_COMMIT_REF:'main'})).toBe(false);expect(noticeDiagnosticsEnabled({...env,NOTICE_READ_PERF_QA:'0'})).toBe(false);
 });
});
