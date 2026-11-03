import {expect,it} from 'vitest';
import {assertCompactOperationsPreview,isCompactOperationsConnection,COMPACT_OPERATIONS_BRANCH,COMPACT_OPERATIONS_PROJECT} from '../../scripts/compact-operations-preview-scope.mjs';
const url='postgresql://steamfoot_compact_qa_20261103.ttworfzgwejdeolegkxl:synthetic-password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:COMPACT_OPERATIONS_PROJECT,VERCEL_GIT_COMMIT_REF:COMPACT_OPERATIONS_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',COMPACT_OPERATIONS_PREVIEW:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',AUTH_SECRET:'synthetic-only',DATABASE_URL:url,DIRECT_URL:url};
it('permits only this dedicated preview',()=>expect(assertCompactOperationsPreview(env)).toBe(true));
it('leaves unrelated deployments unchanged',()=>expect(assertCompactOperationsPreview({})).toBe(false));
it.each([{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'production-project'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_GIT_REPO_SLUG:'another-repository'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token'},{PRODUCTION_MIGRATION_TARGET:'anything'}])('rejects unsafe deployment metadata or delivery credentials: %j',patch=>expect(()=>assertCompactOperationsPreview({...env,...patch})).toThrow());
it.each([url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf'),url.replace('steamfoot_compact_qa_20261103','postgres'),url.replace('sslmode=require','sslmode=disable'),url+'&host=production.invalid',url+'&options=unsafe',url+'&schema=private'])('rejects connections outside the reviewed database role and routing',connection=>expect(isCompactOperationsConnection(connection)).toBe(false));

it('accepts the second documented pooler for the same isolated role and project',()=>expect(isCompactOperationsConnection(url.replace('aws-0-','aws-1-'))).toBe(true));
