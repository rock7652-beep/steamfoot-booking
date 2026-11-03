import 'server-only';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import {AppError} from '@/lib/app-error';
import {buildBeautyDatabaseUrl} from '@/lib/beauty-database-url';
import {readBeautyAddOnsRuntimeEvidence} from './addons-runtime-evidence';

/** An explicit read on the existing HQ page, never a public SQL endpoint. */
export async function readHqBeautyAddOnsReleaseEvidence(){
 const user=await getCurrentUser();
 if(!user||user.role!=='ADMIN'||!await checkPermission(user.role,user.staffId,'staff.manage'))
  throw new AppError('FORBIDDEN','僅總部有權管理人員可核對發布狀態');
 const env=process.env;
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking')
  return {status:'UNAVAILABLE' as const};
 try{
  const effectiveUrl=buildBeautyDatabaseUrl();
  // Load the same application client only after the helper accepts the URL.
  const client:Parameters<typeof readBeautyAddOnsRuntimeEvidence>[0]={
   $transaction:async(work,options)=>{
    const {beautyPrisma}=await import('@/lib/beauty-db');
    return beautyPrisma.$transaction(tx=>work(tx),options);
   },
  };
  return await readBeautyAddOnsRuntimeEvidence(client,effectiveUrl,{
   project:'qijlnhtpbintanzpxkvf',role:'steamfoot_beauty_prod_20261025',
  });
 }catch{return {status:'UNAVAILABLE' as const};}
}
