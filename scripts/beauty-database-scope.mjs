import {beautyProductionCaPath} from './beauty-production-ca.mjs';
/** Server configuration only. Errors deliberately omit URLs and credentials. */
export function beautyDatabaseSelection(env) {
  const mode = env.BEAUTY_DATABASE_MODE ?? 'legacy';
  if (!['legacy', 'dedicated'].includes(mode)) throw Error('Invalid BEAUTY_DATABASE_MODE.');
  if (mode === 'legacy') {
    if ([env.BEAUTY_DATABASE_URL,env.BEAUTY_DATABASE_PASSWORD,env.BEAUTY_DATABASE_ROLE].some(v=>v!==undefined)) throw Error('BEAUTY_DATABASE_URL requires dedicated mode.');
    return undefined;
  }
  const invalid = () => { throw Error('Dedicated Beauty database configuration is missing or invalid.'); };
  let value = env.BEAUTY_DATABASE_URL;
  if (env.BEAUTY_DATABASE_PASSWORD!==undefined||env.BEAUTY_DATABASE_ROLE!==undefined) {
    // Reuse only the verified main endpoint; never read back or overwrite its secret.
    // Separate credentials remain server-only deployment Secrets. No fallback on partial configuration.
    if(value!==undefined||env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_GIT_COMMIT_REF!=='main'||
       env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||
       env.BEAUTY_DATABASE_ROLE!=='steamfoot_beauty_prod_20261025'||!/^[-_A-Za-z0-9]{32,128}$/.test(env.BEAUTY_DATABASE_PASSWORD??''))return invalid();
    let endpoint;try{endpoint=new URL(env.DATABASE_URL);}catch{return invalid();}
    const project='qijlnhtpbintanzpxkvf',user=decodeURIComponent(endpoint.username);
    const direct=endpoint.hostname===`db.${project}.supabase.co`&&user==='postgres';
    const pooled=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(endpoint.hostname)&&user===`postgres.${project}`;
    if(!['postgres:','postgresql:'].includes(endpoint.protocol)||endpoint.pathname!=='/postgres'||endpoint.hash||!['','5432','6543'].includes(endpoint.port)||(!direct&&!pooled))return invalid();
    endpoint.username=env.BEAUTY_DATABASE_ROLE+(pooled?'.'+project:'');
    endpoint.password=env.BEAUTY_DATABASE_PASSWORD;
    endpoint.search='';endpoint.searchParams.set('schema','public');endpoint.searchParams.set('sslmode','require');endpoint.searchParams.set('sslaccept','strict');endpoint.searchParams.set('sslrootcert',beautyProductionCaPath());
    endpoint.searchParams.set('connection_limit','1');endpoint.searchParams.set('pool_timeout','10');endpoint.searchParams.set('connect_timeout','10');
    if(pooled){endpoint.searchParams.set('pgbouncer','true');endpoint.searchParams.set('statement_cache_size','0');}
    value=endpoint.toString();
  }
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return invalid();
  let url;
  try { url = new URL(value); } catch { return invalid(); }
  let user, database;
  try { user = decodeURIComponent(url.username); database = decodeURIComponent(url.pathname); } catch { return invalid(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.password ||
      !/^steamfoot_beauty_[a-z][a-z0-9_]{0,39}(?:\.[a-z0-9]+)?$/.test(user) ||
      !/^\/[^/\s\\\u0000-\u001f\u007f]+$/.test(database) || url.hash) return invalid();
  const allowed = new Set(['schema','sslmode','sslaccept','sslrootcert','connection_limit','pool_timeout','connect_timeout','pgbouncer','statement_cache_size']);
  const seen = new Set();
  for (const [key, val] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || !val || /[\u0000-\u001f\u007f]/.test(val)) return invalid();
    seen.add(key);
    if (key === 'schema' && val !== 'public') return invalid();
    if (key === 'pgbouncer' && !['true','false'].includes(val)) return invalid();
    if (['connection_limit','pool_timeout','connect_timeout','statement_cache_size'].includes(key) && !/^\d+$/.test(val)) return invalid();
  }
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) &&
      (!['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode')) ||
       url.searchParams.get('sslaccept') === 'accept_invalid_certs')) return invalid();
  if (env.BEAUTY_NOTIFICATIONS_ENABLED === '1') {
    throw Error('Dedicated Beauty notifications require a separately reviewed worker connection.');
  }
  let main;
  try { main = new URL(env.DATABASE_URL); } catch { return invalid(); }
  if (main.pathname !== url.pathname || decodeURIComponent(main.username).split('.')[0] === user.split('.')[0]) return invalid();
  // A secondary secret must not bypass any existing task-owned preview scope.
  if (env.VERCEL_ENV === 'preview' || (env.BEAUTY_RELEASE_QA !== '1' &&
      Object.keys(env).some(key => /(?:_QA|_ACCEPTANCE)$/.test(key) && env[key] === '1'))) {
    throw Error('Dedicated Beauty database is not authorized in this preview scope.');
  }
  return value;
}
