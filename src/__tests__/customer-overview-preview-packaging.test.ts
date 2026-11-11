import {expect,it} from 'vitest';
import {assertCustomerOverviewPackaging} from '../../scripts/customer-overview-preview-packaging.mjs';
import {COMPACT_OPERATIONS_PROJECT,COURSE_SUBJECT_PREVIEW_BRANCH} from '../../scripts/compact-operations-preview-scope.mjs';
const url='postgresql://steamfoot_compact_qa_20261103.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:COMPACT_OPERATIONS_PROJECT,VERCEL_GIT_COMMIT_REF:COURSE_SUBJECT_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',COMPACT_OPERATIONS_PREVIEW:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',AUTH_SECRET:'synthetic-only',DATABASE_URL:url,DIRECT_URL:url};
it('permits artifact-only packaging in the exact isolated Vercel sandbox',()=>expect(()=>assertCustomerOverviewPackaging(env,'/vercel/path0')).not.toThrow());
it.each([{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'production-project'},{VERCEL_GIT_COMMIT_REF:'unapproved'},{DIRECT_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic'}])('rejects unsafe packaging metadata: %j',patch=>expect(()=>assertCustomerOverviewPackaging({...env,...patch},'/vercel/path0')).toThrow());
it('rejects local artifact pruning',()=>expect(()=>assertCustomerOverviewPackaging(env,'/workspace')).toThrow());
