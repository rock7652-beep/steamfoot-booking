import {assertMusicOpeningPreviewEnvironment,isMusicOpeningDatabase} from './music-opening-preview-scope.mjs';
export const MUSIC_RELEASE_BRANCH='release/music-production-20261023';
const PRODUCTION_REF='qijlnhtpbintanzpxkvf';
function isProductionConnection(value){
 try{
  const u=new URL(value??'');
  const allowed=new Set(['schema','pgbouncer','sslmode','connection_limit','pool_timeout','connect_timeout','socket_timeout','statement_cache_size']);
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.pathname!=='/postgres'||u.hash||!['','5432','6543'].includes(u.port))return false;
  for(const key of u.searchParams.keys())if(!allowed.has(key)||u.searchParams.getAll(key).length!==1)return false;
  if(u.searchParams.has('schema')&&u.searchParams.get('schema')!=='public')return false;
  return u.hostname===`db.${PRODUCTION_REF}.supabase.co`&&u.username==='postgres'||/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&u.username===`postgres.${PRODUCTION_REF}`;
 }catch{return false;}
}
export function assertMusicNativeReleaseEnvironment(env){
 if(env.VERCEL!=='1'||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH)throw Error('Music native release scope invalid');
 if(env.VERCEL_ENV==='production'&&env.VERCEL_GIT_COMMIT_REF==='main'){
  if(![env.DATABASE_URL,env.DIRECT_URL].every(isProductionConnection))throw Error('Production music connections must match the reviewed database');
  return 'production';
 }
 if(env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===MUSIC_RELEASE_BRANCH){
  if(![env.DATABASE_URL,env.DIRECT_URL].every(isMusicOpeningDatabase))throw Error('Music release preview requires both isolated connections');
  return 'preview';
 }
 throw Error('Music native release environment not authorized');
}
/** Capability only. Every caller must retain store/feature/permission authorization. */
export function musicNativeWorkflowEnabled(storeId,env=process.env){
 if(!storeId)return false;
 if(storeId==='store-lubymusic'&&env.VERCEL==='1'){
  try{assertMusicOpeningPreviewEnvironment(env);return true;}catch{}
 }
 const configured=(env.MUSIC_NATIVE_WORKFLOW_STORE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!configured.includes(storeId))return false;
 try{return !!assertMusicNativeReleaseEnvironment(env);}catch{return false;}
}
/** Read/filter sealed preview data on either reviewed branch; never authorizes an importer. */
export function assertMusicPreviewDataReviewEnvironment(env){
 if(env.VERCEL_GIT_COMMIT_REF===MUSIC_RELEASE_BRANCH){
  if(assertMusicNativeReleaseEnvironment(env)!=='preview')throw Error('Music data review requires isolated preview');
  return;
 }
 assertMusicOpeningPreviewEnvironment(env);
}
