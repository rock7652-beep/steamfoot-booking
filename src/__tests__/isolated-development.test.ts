import { describe, expect, it, vi } from 'vitest';
import { assertIsolatedDevelopment, verifyIsolatedDevelopmentDatabase } from '../../scripts/isolated-dev-scope.mjs';
import { assertReviewedReleaseEnvironment } from '../../scripts/consultation-preview-scope.mjs';
const id='a'.repeat(32), token='b'.repeat(64), name=`steamfoot_dev_${id}`;
const url=`postgresql://${name}:${'c'.repeat(64)}@127.0.0.1:15432/${name}`;
const env={NODE_ENV:'development' as const,STEAMFOOT_ISOLATED_DEV:'1',STEAMFOOT_DEV_ID:id,STEAMFOOT_DEV_TOKEN:token,STEAMFOOT_DEV_SERVER_ADDRESS:'172.17.0.2',DATABASE_URL:url,DIRECT_URL:url};
it('dispatches explicit isolated development without claiming provider identity',()=>{
 expect(assertReviewedReleaseEnvironment(env)).toBe('isolated-development');
 expect(()=>assertReviewedReleaseEnvironment({...env,STEAMFOOT_ISOLATED_DEV:undefined})).toThrow();
});
it.each(['production','test',undefined])('rejects non-development NODE_ENV %s',NODE_ENV=>{
 expect(()=>assertIsolatedDevelopment({...env,NODE_ENV})).toThrow();
});
it.each(['VERCEL','VERCEL_ENV','VERCEL_URL','VERCEL_GIT_COMMIT_REF','WORKERS_CI_BRANCH','CF_PAGES_BRANCH','VITEST','VITEST_WORKER_ID'])('rejects provider or mocked-test claim %s',key=>{
 expect(()=>assertIsolatedDevelopment({...env,[key]:'1'})).toThrow();
});
it.each(['https://127.0.0.1/db',url.replace('127.0.0.1','localhost'),url.replace('127.0.0.1','db.example.invalid'),url.replace('127.0.0.1','127.1'),url.replace(`/${name}`,'/postgres'),url+'?host=remote.invalid',url+'?schema=public',url+'#host=remote',url.replace(':15432',':543'),url.replace(name,'postgres')])('rejects remote, ambiguous or overridden targets without leaking credentials',value=>{
 try { assertIsolatedDevelopment({...env,DATABASE_URL:value,DIRECT_URL:value}); throw new Error('unexpected acceptance'); }
 catch(error){ expect(String(error)).toContain('Isolated development rejected'); expect(String(error)).not.toContain('c'.repeat(64)); }
});
it('rejects mismatching direct connection before any query',async()=>{
 const query=vi.fn();
 await expect(verifyIsolatedDevelopmentDatabase({$queryRawUnsafe:query},{...env,DIRECT_URL:url.replace(':15432',':15433')})).rejects.toThrow();
 expect(query).not.toHaveBeenCalled();
});
describe('actual connected endpoint identity',()=>{
 const row={database:name,role:name,address:'172.17.0.2',port:5432,token};
 it('accepts the provisioned server identity',async()=>{
  await expect(verifyIsolatedDevelopmentDatabase({$queryRawUnsafe:async()=>[row]},env)).resolves.toBeUndefined();
 });
 it.each(['database','role','address','port','token'])('fails closed on changed %s',async field=>{
  await expect(verifyIsolatedDevelopmentDatabase({$queryRawUnsafe:async()=>[{...row,[field]:'wrong'}]},env)).rejects.toThrow('verification failed');
 });
 it('fails closed when marker is absent or connection fails',async()=>{
  await expect(verifyIsolatedDevelopmentDatabase({$queryRawUnsafe:async()=>{throw new Error('private connection details');}},env)).rejects.toThrow('verification failed');
 });
});
it('keeps build and migration entrypoints blocked even in development',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const file of ['scripts/music-opening-preflight.mjs','scripts/ci-migrate.mjs']) {
  const result=spawnSync(process.execPath,[file],{env:{...process.env,...env},encoding:'utf8'});
  expect(result.status).not.toBe(0); expect(result.stderr).toContain('Isolated development cannot');
 }
});
