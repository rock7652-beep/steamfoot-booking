import {expect,it,vi} from 'vitest';
import {withCalendarMonthRead,withCalendarRosterRead} from '@/server/services/calendar-month-read-scope';
import {memoizeReadRequest} from '@/server/services/read-request-memo';
import {permissionRequestSession} from '@/lib/permission-request-session';
it('shares only authenticated identity/metadata across nested month and roster reads, not grants',async()=>{
 const auth=vi.fn(async()=>({id:'a'})),data=vi.fn(async()=>1),grant=vi.fn(async()=>true);
 const read=async()=>{await grant();return {user:await permissionRequestSession(auth),value:await memoizeReadRequest('metadata',data)};};
 await withCalendarMonthRead(async()=>{
  const initial=await read();const roster=await withCalendarRosterRead(read);const nested=await withCalendarMonthRead(read);
  expect(roster.user).toBe(initial.user);expect(nested).toEqual(initial);
 });
 expect(auth).toHaveBeenCalledOnce();expect(data).toHaveBeenCalledOnce();expect(grant).toHaveBeenCalledTimes(3);
 await withCalendarMonthRead(read);expect(auth).toHaveBeenCalledTimes(2);expect(data).toHaveBeenCalledTimes(2);
});
it('keeps standalone page/roster reads fresh',async()=>{
 const auth=vi.fn(async()=>({id:'a'}));
 const read=()=>permissionRequestSession(auth);
 await withCalendarRosterRead(read);await withCalendarRosterRead(read);await read();expect(auth).toHaveBeenCalledTimes(3);
});
it('does not reuse rejected authentication in another month or overlap identities',async()=>{
 const revoked=new Error('revoked');const auth=vi.fn().mockRejectedValueOnce(revoked).mockResolvedValue({id:'new'});
 await expect(withCalendarMonthRead(()=>permissionRequestSession(auth))).rejects.toBe(revoked);
 await expect(withCalendarMonthRead(()=>permissionRequestSession(auth))).resolves.toEqual({id:'new'});
 const run=(id:string)=>withCalendarMonthRead(async()=>{await Promise.resolve();const read=()=>permissionRequestSession(async()=>({id}));expect(await withCalendarRosterRead(read)).toEqual({id});});
 await Promise.all([run('a'),run('b')]);
});
it('evaluates a denied independent grant even after identity has been authenticated',async()=>{
 const auth=vi.fn(async()=>({id:'a'}));
 await withCalendarMonthRead(async()=>{await permissionRequestSession(auth);await expect(withCalendarRosterRead(async()=>{await permissionRequestSession(auth);throw new Error('grant denied');})).rejects.toThrow('grant denied');});
 expect(auth).toHaveBeenCalledOnce();
});

import {withCalendarComparison} from '@/server/services/calendar-month-read-scope';
it('uses original fresh scopes in QA baseline comparison and never reuses sync/write state',async()=>{
 const auth=vi.fn(async()=>({id:'a'})),metadata=vi.fn(async()=>1);
 const read=async()=>{await permissionRequestSession(auth);await memoizeReadRequest('m',metadata);};
 await withCalendarComparison('baseline',()=>withCalendarMonthRead(async()=>{await read();await withCalendarRosterRead(read);}));
 expect(auth).toHaveBeenCalledTimes(2);expect(metadata).toHaveBeenCalledTimes(2);
 auth.mockClear();metadata.mockClear();
 await withCalendarComparison('optimized',async()=>{await read();await withCalendarMonthRead(async()=>{await read();await withCalendarRosterRead(read);});});
 expect(auth).toHaveBeenCalledTimes(2);expect(metadata).toHaveBeenCalledTimes(2);
});
