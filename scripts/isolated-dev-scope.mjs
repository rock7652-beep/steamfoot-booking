/** Explicit development scope. This is never a deployment or a mocked-test mode. */
export function assertIsolatedDevelopment(env) {
  const deny = () => { throw new Error('Isolated development rejected: development-only local database and provisioned identity required.'); };
  if (env.STEAMFOOT_ISOLATED_DEV !== '1' || env.NODE_ENV !== 'development' ||
      Object.entries(env).some(([key,value]) => /^(VERCEL(?:_|$)|WORKERS_CI_|CF_PAGES_|VITEST(?:_|$))/.test(key) && Boolean(value))) deny();
  if (!/^[a-f0-9]{32}$/.test(env.STEAMFOOT_DEV_ID ?? '') || !/^[a-f0-9]{64}$/.test(env.STEAMFOOT_DEV_TOKEN ?? '') ||
      !/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(env.STEAMFOOT_DEV_SERVER_ADDRESS ?? '')) deny();
  const name = `steamfoot_dev_${env.STEAMFOOT_DEV_ID}`;
  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) {
    try {
      if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) deny();
      const url = new URL(value);
      if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
          !/^\d+$/.test(url.port) || Number(url.port) < 1024 || Number(url.port) > 65535 ||
          url.pathname !== `/${name}` || url.username !== name || !/^[a-f0-9]{64}$/.test(url.password) || url.hash || url.search) deny();
    } catch { deny(); }
  }
  if (env.DATABASE_URL !== env.DIRECT_URL) deny();
  return 'isolated-development';
}

/** Read the identity from the connected server, not from URL metadata alone. */
/** @param {any} client @param {Readonly<Record<string, string | undefined>>} env */
export async function verifyIsolatedDevelopmentDatabase(client, env = process.env) {
  assertIsolatedDevelopment(env);
  try {
    const rows = await client.$queryRawUnsafe(`SELECT current_database()::text AS database, current_user::text AS role,
      host(inet_server_addr()) AS address, inet_server_port() AS port,
      (SELECT token FROM steamfoot_dev_guard.identity WHERE singleton = true) AS token`);
    const row = rows[0];
    const expected = `steamfoot_dev_${env.STEAMFOOT_DEV_ID}`;
    if (rows.length !== 1 || row.database !== expected || row.role !== expected ||
        row.address !== env.STEAMFOOT_DEV_SERVER_ADDRESS || row.port !== 5432 || row.token !== env.STEAMFOOT_DEV_TOKEN)
      throw new Error('identity mismatch');
  } catch { throw new Error('Isolated development database verification failed; server identity/destination unavailable or mismatched.'); }
}
