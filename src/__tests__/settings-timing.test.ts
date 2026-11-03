import {expect,it} from 'vitest';
import {settingsStep,settingsSyncStep,traceSettingsSave,settingsServerTiming} from '@/server/services/settings-timing';
it('isolates concurrent requests and records failures without raw error text',async()=>{
 const [a,b]=await Promise.all([
  traceSettingsSave(()=>settingsStep('authorization',async()=>{await Promise.resolve();return 'a'})),
  traceSettingsSave(()=>settingsStep('db_lock',async()=>{throw Error('private payload')})),
 ]);
 expect(a.result).toBe('a');expect(a.spans.map(x=>x.name)).toEqual(['authorization']);
 expect(b.failed).toBe(true);expect(b.spans).toMatchObject([{name:'db_lock',ok:false}]);
 expect(a.traceId).not.toBe(b.traceId);expect(JSON.stringify(b)).not.toContain('private payload');
});
it('keeps untraced work unchanged and reports fixed server timing labels',async()=>{
 expect(await settingsStep('transaction',async()=>42)).toBe(42);
 const trace=await traceSettingsSave(async()=>settingsSyncStep('cache',()=>true));
 expect(trace.result).toBe(true);expect(settingsServerTiming(trace.totalMs,trace.spans)).toMatch(/^handler;dur=[\d.]+, cache;dur=[\d.]+$/);
});
