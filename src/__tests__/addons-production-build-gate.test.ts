import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({exec:vi.fn(),archive:vi.fn()}));
vi.mock('node:child_process',()=>({execFileSync:m.exec}));
vi.mock('../../scripts/production-postgres-packaging.mjs',()=>({archiveProductionReviewInputs:m.archive}));
import {musicBuildPreflight} from '../../scripts/music-release-preflight.mjs';
beforeEach(()=>vi.resetAllMocks());
it('does not run the production credential probe in Preview',async()=>{
 await musicBuildPreflight({NODE_ENV:'test',VERCEL_ENV:'preview',ADDONS_DATABASE_URL:'preview-only'});expect(m.exec).not.toHaveBeenCalled();
});
it('stops the production release before later preflights when dedicated readiness fails',async()=>{
 m.exec.mockImplementation(()=>{throw Error('readiness failed');});
 const env:NodeJS.ProcessEnv={NODE_ENV:'production',VERCEL_ENV:'production',ADDONS_DATABASE_URL:'present-secret-not-logged'};
 await expect(musicBuildPreflight(env)).rejects.toThrow('readiness failed');
 expect(m.exec).toHaveBeenCalledOnce();expect(m.exec).toHaveBeenCalledWith(process.execPath,expect.arrayContaining(['--conditions=react-server','--import','tsx']),{env,stdio:'inherit'});
});

it('archives review inputs in the first build command before downstream probes or compilation',async()=>{
 m.archive.mockReturnValue({count:2,archive:'/tmp/synthetic-review-archive'});m.exec.mockImplementation(()=>{throw Error('stop before downstream DB probes');});
 const env={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'main',ADDONS_DATABASE_URL:'synthetic-marker'};
 await expect(musicBuildPreflight(env)).rejects.toThrow('stop before downstream DB probes');
 expect(m.archive).toHaveBeenCalledWith(env,process.cwd());expect(m.archive.mock.invocationCallOrder[0]).toBeLessThan(m.exec.mock.invocationCallOrder[0]);
});
