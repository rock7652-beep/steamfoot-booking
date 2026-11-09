import 'server-only';
import {CALENDAR_PHASE_PREVIEW_BRANCH} from '../../scripts/sports-shared-card-preview-scope.mjs';
import {assertSportsRedesignPreviewEnvironment} from '../../scripts/sports-redesign-preview-scope.mjs';
/** QA comparison changes reuse only, never authorization. Unavailable in production. */
export function calendarPerformanceVariant(headers:Pick<Headers,'get'>,env:Readonly<Record<string,string|undefined>>=process.env):'baseline'|'optimized'|undefined{
 const variant=headers.get('x-course-calendar-variant');
 if(variant!=='baseline'&&variant!=='optimized')return;
 if(env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||env.VERCEL_GIT_COMMIT_REF!==CALENDAR_PHASE_PREVIEW_BRANCH)return;
 try{assertSportsRedesignPreviewEnvironment(env);return variant;}catch{return;}
}
