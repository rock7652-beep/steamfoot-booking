// Local public-page build verification only. Never grants hosted Preview or production access.
export const MARKETING_LOCAL_QA_DATABASE='postgresql://marketing-qa:synthetic@127.0.0.1:9/marketing_publication_qa';
export const MARKETING_LOCAL_QA_ORIGIN='http://127.0.0.1:3117';
export const MARKETING_LOCAL_QA_SECRET='marketing-publication-local-qa-synthetic-secret-only';

/** @param {Record<string,string|undefined>} [env] */
export function isMarketingPublicationLocalQa(env=process.env){
  if(env.MARKETING_PUBLICATION_LOCAL_QA!=='1')return false;
  const hosted=['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'];
  const mixed=Object.entries(env).some(([key,value])=>value&&key!=='MARKETING_PUBLICATION_LOCAL_QA'
    &&(/(?:_QA|_PREVIEW)$/.test(key)||key==='BEAUTY_HOSTED_PREVIEW'));
  const credentials=Object.entries(env).some(([key,value])=>value&&key!=='AUTH_SECRET'&&/(TOKEN|SECRET|PASSWORD|WEBHOOK|API_KEY)/.test(key));
  if(!['development','production'].includes(env.NODE_ENV??'')||hosted.some(key=>env[key])||mixed||credentials
    ||env.AUTH_URL!==MARKETING_LOCAL_QA_ORIGIN||env.NEXTAUTH_URL!==MARKETING_LOCAL_QA_ORIGIN
    ||env.AUTH_SECRET!==MARKETING_LOCAL_QA_SECRET||env.DATABASE_URL!==MARKETING_LOCAL_QA_DATABASE||env.DIRECT_URL!==MARKETING_LOCAL_QA_DATABASE
    ||env.SUBSCRIPTION_REFERRALS_ENABLED==='true'||env.CONSULTATION_HQ_ENABLED==='true'
    ||env.BEAUTY_MODULE_ENABLED==='1'||env.MUSIC_NATIVE_WORKFLOW_ENABLED==='1'){
    throw new Error('Marketing publication QA requires local-only synthetic configuration, disabled data clients and no external credentials');
  }
  return true;
}

export function isMarketingPublicationLocalQaPath(path){
  const pages=['/','/pricing','/pricing/business','/pricing/cases','/cases','/apply','/pricing/apply.html',
    '/pricing/features','/pricing/features/slots','/pricing/features/fitness','/pricing/features/music','/pricing/features/beauty',
    '/privacy','/terms','/refunds','/pricing/terms.html','/pricing/refunds.html','/robots.txt','/sitemap.xml','/favicon.ico',
    '/api/subscription-referrals/availability','/pricing/referral','/guides','/pricing/guides'];
  return pages.includes(path)||/^\/(?:pricing\/)?guides\/[a-z0-9-]+\/?$/.test(path)
    ||path.startsWith('/_next/static/')||/^\/pricing\/(?:brand|images|business-assets)\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp|svg)$/.test(path);
}
