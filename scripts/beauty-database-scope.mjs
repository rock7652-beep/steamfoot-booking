/** Server configuration only. Errors deliberately omit URLs and credentials. */
export function beautyDatabaseSelection(env) {
  const mode = env.BEAUTY_DATABASE_MODE ?? 'legacy';
  if (!['legacy', 'dedicated'].includes(mode)) throw Error('Invalid BEAUTY_DATABASE_MODE.');
  if (mode === 'legacy') {
    if (env.BEAUTY_DATABASE_URL !== undefined) throw Error('BEAUTY_DATABASE_URL requires dedicated mode.');
    return undefined;
  }
  const value = env.BEAUTY_DATABASE_URL;
  const invalid = () => { throw Error('Dedicated Beauty database configuration is missing or invalid.'); };
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
