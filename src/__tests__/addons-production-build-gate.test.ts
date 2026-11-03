import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({exec:vi.fn()}));
vi.mock('node:child_process',()=>({execFileSync:m.exec}));
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
