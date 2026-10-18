import {afterEach,expect,it,vi} from 'vitest';
import {sportsWorkspaceLocationView,sportsWorkspaceRouteQuery} from '@/lib/sports-workspace-location';
import {sportsWorkspacePreviewEnabled} from '@/lib/sports-workspace-preview';
import {sportsWorkspaceTab,sportsWorkspaceView} from '@/lib/sports-workspace-navigation';
const url='postgresql://postgres.ttworfzgwejdeolegkxl:test@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
function preview(){for(const[k,v]of Object.entries({SPORTS_REDESIGN_STAGING:'1',SPORTS_REDESIGN_PREVIEW:'1',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/sports-redesign-staging-20261018',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:url,DIRECT_URL:url}))vi.stubEnv(k,v);}
afterEach(()=>vi.unstubAllEnvs());
it('only enables normal navigation in the exact isolated Preview store',()=>{preview();expect(sportsWorkspacePreviewEnabled('sports-live-flow-store')).toBe(true);expect(sportsWorkspacePreviewEnabled('other-store')).toBe(false);expect(sportsWorkspacePreviewEnabled()).toBe(false);});
it.each(['production','development'])('does not activate in %s even with staging flags',env=>{preview();vi.stubEnv('VERCEL_ENV',env);expect(sportsWorkspacePreviewEnabled('sports-live-flow-store')).toBe(false);});
it.each(['DATABASE_URL','DIRECT_URL'])('rejects a production connection in %s',key=>{preview();vi.stubEnv(key,'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres');expect(()=>sportsWorkspacePreviewEnabled('sports-live-flow-store')).toThrow();});
it('rejects a different source branch',()=>{preview();vi.stubEnv('VERCEL_GIT_COMMIT_REF','main');expect(()=>sportsWorkspacePreviewEnabled('sports-live-flow-store')).toThrow();});
it.each([['schedule','課表'],['catalog','教學項目'],['plans','收費方式']])('maps %s to one workspace tab and back',(view,tab)=>{expect(sportsWorkspaceTab(view)).toBe(tab);expect(sportsWorkspaceView(tab)).toBe(view);});

it('native tab fragments override the initial server view and keep unrelated queries',()=>{
 expect(sportsWorkspaceLocationView('?view=catalog','#sports-plans')).toBe('plans');
 expect(sportsWorkspaceLocationView('?view=plans','')).toBe('plans');
 expect(sportsWorkspaceLocationView('?view=plans','#sports-schedule')).toBe('schedule');
 expect(sportsWorkspaceRouteQuery('view=catalog&devicePreview=1','plans')).toBe('view=plans&devicePreview=1');
 expect(sportsWorkspaceRouteQuery('view=plans&devicePreview=1','schedule')).toBe('devicePreview=1');
});
