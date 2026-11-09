import {expect,it,vi} from 'vitest';
import {readBeautyAddOnsRuntimeEvidence} from '@/server/services/addons-runtime-evidence';
const expected={project:'qijlnhtpbintanzpxkvf',role:'steamfoot_beauty_prod_20261025'};
const url=`postgresql://${expected.role}:secret@db.${expected.project}.supabase.co/postgres?sslmode=verify-full`;
function fixture(row={databaseMatches:true,roleMatches:true,restrictedRole:true,schemaReady:true,historyProtected:true}){
 const read=vi.fn().mockResolvedValue([row]),execute=vi.fn().mockResolvedValue(0);
 const transaction=vi.fn(async(work:(tx:{$executeRawUnsafe:typeof execute;$queryRawUnsafe:typeof read})=>Promise<unknown>)=>work({$executeRawUnsafe:execute,$queryRawUnsafe:read}));
 return {read,execute,transaction,client:{$transaction:transaction} as unknown as Parameters<typeof readBeautyAddOnsRuntimeEvidence>[0]};
}
it('uses the supplied application client in a read-only bounded transaction and returns no identities or secrets',async()=>{
 const f=fixture(),r=await readBeautyAddOnsRuntimeEvidence(f.client,url,expected);
 expect(r.status).toBe('PASS');expect(f.execute.mock.calls.map(c=>c[0])).toEqual(['SET TRANSACTION READ ONLY',"SET LOCAL statement_timeout='5s'"]);
 expect(f.read.mock.calls[0].slice(1)).toEqual(['postgres',expected.role]);expect(JSON.stringify(r)).not.toMatch(/secret|supabase|postgres|steamfoot/);
 expect(f.transaction.mock.calls).toHaveLength(1);
});
it.each(['roleMatches','databaseMatches','restrictedRole','schemaReady','historyProtected'] as const)('blocks incomplete or unsafe runtime evidence: %s',async field=>{
 const row={databaseMatches:true,roleMatches:true,restrictedRole:true,schemaReady:true,historyProtected:true};row[field]=false;
 expect((await readBeautyAddOnsRuntimeEvidence(fixture(row).client,url,expected)).status).toBe('BLOCKED');
});
it.each([url.replace(expected.project,'anotherproject1234567'),url.replace(expected.role,'postgres'),url.replace('/postgres','/other'),url.replace('postgresql:','https:')])('rejects an unreviewed target before opening a transaction',async value=>{
 const f=fixture();expect((await readBeautyAddOnsRuntimeEvidence(f.client,value,expected)).status).toBe('UNAVAILABLE');expect(f.transaction).not.toHaveBeenCalled();
});
it('redacts connection errors and never retries with an administrator',async()=>{
 const f=fixture();f.read.mockRejectedValue(Error(url));const r=await readBeautyAddOnsRuntimeEvidence(f.client,url,expected);
 expect(r.status).toBe('UNAVAILABLE');expect(JSON.stringify(r)).not.toContain('secret');expect(f.transaction).toHaveBeenCalledOnce();
});
