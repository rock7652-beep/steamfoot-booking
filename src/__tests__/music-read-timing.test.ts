import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {measureMusicRead,musicReadTimingScope,withMusicReadTiming} from '@/lib/music-read-timing';
it('isolates concurrent request diagnostics and records errors without swallowing them',async()=>{
 const a:Record<string,number>={},b:Record<string,number>={};
 const error=new Error('denied');
 await Promise.all([
  withMusicReadTiming(a,()=>musicReadTimingScope('overview',()=>measureMusicRead('query',async()=>1))),
  withMusicReadTiming(b,()=>expect(measureMusicRead('auth',async()=>{throw error})).rejects.toBe(error)),
 ]);
 expect(a['overview.query.count']).toBe(1);expect(a.auth).toBeUndefined();
 expect(b['auth.count']).toBe(1);expect(b['overview.query']).toBeUndefined();
 expect(await measureMusicRead('outside',async()=>42)).toBe(42);
 expect(a.outside).toBeUndefined();expect(b.outside).toBeUndefined();
});
