import {AppError} from '@/lib/errors';
import {BEAUTY_PURCHASE_QA_PROJECT_REF,BEAUTY_PURCHASE_QA_BRANCH,BEAUTY_PURCHASE_QA_STORE,isValidBeautyPurchaseQaRef,isValidBeautyPurchaseQaConnection} from './isolated-purchase-config.mjs';

/** Acceptance-only runtime isolation. The hosted build guard independently
 * verifies that this fixed store is the only store in the dedicated database. */
export function validateBeautyIsolatedPurchaseStore(storeId:string,env:NodeJS.ProcessEnv,projectRef:string|null){
  if((env.BEAUTY_ISOLATED_PURCHASE_QA==='1'||env.VERCEL_GIT_COMMIT_REF===BEAUTY_PURCHASE_QA_BRANCH)&&
    (env.BEAUTY_ISOLATED_PURCHASE_QA!=='1'||!isValidBeautyPurchaseQaRef(projectRef)||env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BEAUTY_PURCHASE_QA_BRANCH||
     env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||
     env.BEAUTY_MODULE_ENABLED!=='1'||env.BEAUTY_DATABASE_MODE!=='legacy'||!!env.BEAUTY_DATABASE_URL||env.BEAUTY_NOTIFICATIONS_ENABLED!=='0'||
     env.BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED!=='1'||env.BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED!=='1'||env.BEAUTY_COLLECTION_INTENTS_ENABLED==='1'||
     env.COURSE_PURCHASE_INTENTS_ENABLED==='1'||!!env.PRODUCTION_MIGRATION_TARGET||!env.AUTH_SECRET||
     Object.entries(env).some(([key,value])=>!!value&&/^(LINE_.*(?:TOKEN|SECRET)|WEB_LINE_.*(?:TOKEN|SECRET)|MESSENGER_.*(?:TOKEN|SECRET)|RESEND_API_KEY|SMTP_)/.test(key))||
     !isValidBeautyPurchaseQaConnection(env.DATABASE_URL,projectRef)||!isValidBeautyPurchaseQaConnection(env.DIRECT_URL,projectRef)||
     env.BEAUTY_ISOLATED_QA_STORE_ID!==BEAUTY_PURCHASE_QA_STORE||storeId!==BEAUTY_PURCHASE_QA_STORE))
    throw new AppError('FORBIDDEN','此測試環境僅開放指定測試門市');
}
export function assertBeautyIsolatedPurchaseStore(storeId:string,env:NodeJS.ProcessEnv=process.env){
  return validateBeautyIsolatedPurchaseStore(storeId,env,BEAUTY_PURCHASE_QA_PROJECT_REF);
}
