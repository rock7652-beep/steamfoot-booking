// Acceptance remains impossible until the newly provisioned disposable
// project ref is reviewed and pinned in source; environment values cannot
// select or replace this ref.
export const BEAUTY_PURCHASE_QA_PROJECT_REF = null;
export const BEAUTY_PURCHASE_QA_BRANCH = 'preview/beauty-purchase-isolated-20261028';
export const BEAUTY_PURCHASE_QA_STORE = 'qa-beauty-purchase-isolated-20261028';
const forbidden = new Set(['qijlnhtpbintanzpxkvf','ttworfzgwejdeolegkxl']);
const hosts = new Set(['aws-0-ap-northeast-1.pooler.supabase.com','aws-1-ap-northeast-1.pooler.supabase.com']);
const parameters = new Set(['schema','sslmode','sslaccept','pgbouncer','connection_limit','pool_timeout','connect_timeout','statement_cache_size','socket_timeout']);
export function isValidBeautyPurchaseQaRef(ref){return typeof ref==='string'&&/^[a-z]{20}$/.test(ref)&&!forbidden.has(ref);}
export function isValidBeautyPurchaseQaConnection(value,ref){
  if(!isValidBeautyPurchaseQaRef(ref)||!value||/[\s\\\u0000-\u001f\u007f]/.test(value))return false;
  try{
    const u=new URL(value),user=decodeURIComponent(u.username);
    if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||u.pathname!=='/postgres'||u.hash)return false;
    const direct=u.hostname===`db.${ref}.supabase.co`&&user==='postgres'&&['','5432'].includes(u.port);
    const pool=hosts.has(u.hostname)&&user===`postgres.${ref}`&&['','5432','6543'].includes(u.port);
    if(!direct&&!pool)return false;
    const seen=new Set();
    for(const [key,value] of u.searchParams){
      if(!parameters.has(key)||seen.has(key)||!value)return false;seen.add(key);
      if(key==='schema'&&value!=='public')return false;
      if(key==='sslmode'&&!['require','verify-ca','verify-full'].includes(value))return false;
      if(key==='sslaccept'&&value!=='strict')return false;
      if(key==='pgbouncer'&&!['true','false'].includes(value))return false;
      if(['connection_limit','pool_timeout','connect_timeout','statement_cache_size','socket_timeout'].includes(key)&&!/^\d{1,4}$/.test(value))return false;
    }
    return ['require','verify-ca','verify-full'].includes(u.searchParams.get('sslmode'));
  }catch{return false;}
}
