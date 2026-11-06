// Opt-in review only: no new HTTP endpoint, mutations, migrations, billing or notifications.
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertProductionPackaging} from './production-postgres-packaging.mjs';
export function assertReferralReleaseReview(env,root){
 const requested=env.SUBSCRIPTION_REFERRAL_RELEASE_REVIEW;
 if(!requested||requested==='0')return false;
 if(requested!=='1')throw Error('Referral release review must be explicitly 1 or disabled');
 assertProductionPackaging(env,root);
 if(env.SUBSCRIPTION_REFERRALS_ENABLED!=='false')throw Error('Referral activity must remain explicitly disabled during release review');
 if(env.CONSULTATION_PREVIEW_INTAKE_ENABLED&&env.CONSULTATION_PREVIEW_INTAKE_ENABLED!=='false')throw Error('Preview intake must be disabled on production');
 if(env.PRODUCTION_MIGRATION_TARGET)throw Error('Release review must not select a production migration');
 let db;try{db=new URL(env.DATABASE_URL);}catch{throw Error('Production connection is unavailable for read-only review');}
 if((db.searchParams.has('schema')&&db.searchParams.get('schema')!=='public')||['host','options','hostaddr'].some(k=>db.searchParams.has(k)))throw Error('Production connection overrides require separate review');
 return true;
}
export function validateReferralCatalog(report){
 const names=['StoreSubscriptionReferralCode','StoreSubscriptionReferral','StoreSubscriptionReferralPayment','StoreSubscriptionReferralRefundReview','StoreSubscriptionReferralReward','Store','StoreSubscription','StorePlanChange','ConsultationLead'];
 if(report.project!=='qijlnhtpbintanzpxkvf'||report.verified_tls!==true||report.identity?.read_only!=='on'||report.tables?.length!==names.length)throw Error('Production read-only identity evidence is incomplete');
 for(const name of names){const row=report.tables.find(t=>t.name===name);if(!row?.present||!row.rls_enabled||!row.can_select||(row.needs_insert&&!row.can_insert)||(row.needs_update&&!row.can_update))throw Error('Production catalog permissions require review; do not broaden grants automatically');}
 return {project:report.project,role:report.identity.role,transactionReadOnly:true,catalogReady:true,limitation:'Catalog evidence does not prove row-level or column-level writes. Activity remains disabled pending operational verification.'};
}
export function runReferralReadonlyReview(root,run=(file,args)=>execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']})){
 let report;try{report=JSON.parse(run(process.execPath,[join(root,'scripts/subscription-referral-runtime-preflight.mjs'),'--read-only']));}catch{throw Error('Production read-only review failed; no connection details are exposed');}
 return validateReferralCatalog(report);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv.slice(2).join(' ');if(!['--configuration-only','--read-only'].includes(mode))throw Error('Only configuration or read-only review supported');
 const root=resolve(import.meta.dirname,'..');
 if(!assertReferralReleaseReview(process.env,root))console.log('[referral-release-review] requested=false');
 else if(mode==='--configuration-only')console.log('[referral-release-review] production_main=true activity_disabled=true migrations_not_selected=true');
 else console.log('[referral-release-review]',JSON.stringify(runReferralReadonlyReview(root)));
}
