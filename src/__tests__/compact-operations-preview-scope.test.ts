import {expect,it} from 'vitest';
import {assertCompactOperationsPreview,isCompactOperationsConnection,COMPACT_OPERATIONS_BRANCH,MUSIC_FITNESS_COMPACT_BRANCH,UNIFIED_CUSTOMER_FILTERS_BRANCH,BOOKING_CALENDAR_PREVIEW_BRANCH,BEAUTY_SERVICE_JOURNEY_BRANCH,calendarPerformanceSportsPreview,COMPACT_OPERATIONS_PROJECT} from '../../scripts/compact-operations-preview-scope.mjs';
const url='postgresql://steamfoot_compact_qa_20261103.ttworfzgwejdeolegkxl:synthetic-password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:COMPACT_OPERATIONS_PROJECT,VERCEL_GIT_COMMIT_REF:COMPACT_OPERATIONS_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',COMPACT_OPERATIONS_PREVIEW:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',AUTH_SECRET:'synthetic-only',DATABASE_URL:url,DIRECT_URL:url};
it('permits only this dedicated preview',()=>expect(assertCompactOperationsPreview(env)).toBe(true));
it('leaves unrelated deployments unchanged',()=>expect(assertCompactOperationsPreview({})).toBe(false));
it.each([{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'production-project'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_GIT_REPO_SLUG:'another-repository'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token'},{PRODUCTION_MIGRATION_TARGET:'anything'}])('rejects unsafe deployment metadata or delivery credentials: %j',patch=>expect(()=>assertCompactOperationsPreview({...env,...patch})).toThrow());
it.each([url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf'),url.replace('steamfoot_compact_qa_20261103','postgres'),url.replace('sslmode=require','sslmode=disable'),url+'&host=production.invalid',url+'&options=unsafe',url+'&schema=private'])('rejects connections outside the reviewed database role and routing',connection=>expect(isCompactOperationsConnection(connection)).toBe(false));

it('accepts the second documented pooler for the same isolated role and project',()=>expect(isCompactOperationsConnection(url.replace('aws-0-','aws-1-'))).toBe(true));

it('permits the Music/Fitness UI follow-up only in the same restricted preview',()=>expect(assertCompactOperationsPreview({...env,VERCEL_GIT_COMMIT_REF:MUSIC_FITNESS_COMPACT_BRANCH})).toBe(true));

it('permits unified customer filters only in the same restricted preview',()=>expect(assertCompactOperationsPreview({...env,VERCEL_GIT_COMMIT_REF:UNIFIED_CUSTOMER_FILTERS_BRANCH})).toBe(true));
it('permits this calendar candidate only in the existing isolated QA project',()=>expect(assertCompactOperationsPreview({...env,VERCEL_GIT_COMMIT_REF:BOOKING_CALENDAR_PREVIEW_BRANCH})).toBe(true));
it('enables native sports only for the approved synthetic store and candidate',()=>{
 const candidate={...env,VERCEL_GIT_COMMIT_REF:BOOKING_CALENDAR_PREVIEW_BRANCH};
 expect(calendarPerformanceSportsPreview('sports-live-flow-store',candidate)).toBe(true);
 expect(calendarPerformanceSportsPreview('other-store',candidate)).toBe(false);
 expect(calendarPerformanceSportsPreview('sports-live-flow-store',env)).toBe(false);
 expect(()=>calendarPerformanceSportsPreview('sports-live-flow-store',{...candidate,VERCEL_ENV:'production'})).toThrow();
 expect(()=>calendarPerformanceSportsPreview('sports-live-flow-store',{...candidate,VERCEL_PROJECT_ID:'production-project'})).toThrow();
 expect(()=>calendarPerformanceSportsPreview('sports-live-flow-store',{...candidate,DATABASE_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')})).toThrow();
});

it('permits the service journey candidate only under the same QA project, database role and disabled delivery checks',()=>{
 const candidate={...env,VERCEL_GIT_COMMIT_REF:BEAUTY_SERVICE_JOURNEY_BRANCH};
 expect(assertCompactOperationsPreview(candidate)).toBe(true);
 for(const patch of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'production-project'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{DATABASE_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{DIRECT_URL:url.replace('steamfoot_compact_qa_20261103','postgres')},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token'}])expect(()=>assertCompactOperationsPreview({...candidate,...patch})).toThrow();
});

it('keeps subject entitlement preview confined to its synthetic store, project, role and disabled delivery configuration',async()=>{
 const {COURSE_SUBJECT_PREVIEW_BRANCH,courseSubjectSportsPreview}=await import('../../scripts/compact-operations-preview-scope.mjs');
 const candidate={...env,VERCEL_GIT_COMMIT_REF:COURSE_SUBJECT_PREVIEW_BRANCH};
 expect(courseSubjectSportsPreview('addons-qa-fitness',candidate)).toBe(true);
 expect(courseSubjectSportsPreview('real-store',candidate)).toBe(false);
 for(const patch of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'production-project'},{DATABASE_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{DIRECT_URL:url.replace('steamfoot_compact_qa_20261103','postgres')},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'}])expect(()=>courseSubjectSportsPreview('addons-qa-fitness',{...candidate,...patch})).toThrow();
});
