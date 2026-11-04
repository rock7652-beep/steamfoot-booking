import { pathToFileURL } from 'node:url';

const project = 'qijlnhtpbintanzpxkvf';
export function validateRuntimeTarget(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('DATABASE_URL missing or invalid'); }
  const user = decodeURIComponent(url.username);
  const matches = url.hostname === `db.${project}.supabase.co`
    || (url.hostname.endsWith('.pooler.supabase.com') && user.endsWith(`.${project}`));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !matches
    || url.pathname !== '/postgres' || url.searchParams.get('sslmode') === 'disable') {
    throw new Error('Production project guard failed');
  }
  return { project };
}

export async function inspectRuntime(client) {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const identity = await client.query(`SELECT current_user AS role, session_user AS session_role,
      current_database() AS database, current_setting('transaction_read_only') AS read_only,
      r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname=current_user`);
    const tables = await client.query(`WITH required(name,needs_insert,needs_update) AS (VALUES
      ('StoreSubscriptionReferralCode',true,false),('StoreSubscriptionReferral',true,true),
      ('StoreSubscriptionReferralPayment',true,false),('StoreSubscriptionReferralRefundReview',true,false),
      ('StoreSubscriptionReferralReward',true,true),('Store',false,true),
      ('StoreSubscription',false,true),('StorePlanChange',true,false),('ConsultationLead',false,true))
      SELECT q.name, c.oid IS NOT NULL AS present, c.relrowsecurity AS rls_enabled,
        pg_get_userbyid(c.relowner)=current_user AS is_owner,
        CASE WHEN c.oid IS NULL THEN false ELSE has_table_privilege(c.oid,'SELECT') END AS can_select,
        CASE WHEN c.oid IS NULL THEN false ELSE has_table_privilege(c.oid,'INSERT') END AS can_insert,
        CASE WHEN c.oid IS NULL THEN false ELSE has_table_privilege(c.oid,'UPDATE') END AS can_update,
        q.needs_insert,q.needs_update,
        (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid
          AND (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM unnest(p.polroles) role_id
            WHERE pg_has_role(current_user,role_id,'MEMBER')))) AS applicable_policy_count
      FROM required q LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',q.name))
      ORDER BY q.name`);
    // This is a catalog report, not proof of RLS row visibility or permitted writes.
    return { identity: identity.rows[0], tables: tables.rows,
      limitation: 'No writes or row-level data read. Catalog privileges do not prove RLS or column-level write behavior.' };
  } finally { await client.query('ROLLBACK'); }
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--read-only') {
    console.log('Usage: node scripts/subscription-referral-runtime-preflight.mjs --read-only');
    console.log('Run inside the authorized production environment with its existing DATABASE_URL. No dotenv loading or credential output.');
    process.exitCode = process.argv.includes('--help') ? 0 : 1;
    return;
  }
  const target = validateRuntimeTarget(process.env.DATABASE_URL);
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000, application_name: 'subscription-referral-readonly-preflight',
    options: '-c default_transaction_read_only=on' });
  try {
    await client.connect();
    console.log(JSON.stringify({ ...target, ...await inspectRuntime(client) }, null, 2));
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Driver errors can contain hosts, usernames or credentials. Never print raw errors.
    console.error('Read-only runtime preflight failed; no credentials or raw driver errors emitted.');
    process.exitCode = 1;
  });
}
