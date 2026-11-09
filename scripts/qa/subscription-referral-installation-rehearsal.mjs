// Local disposable Docker PostgreSQL 17 only. No DATABASE_URL input, dotenv or published ports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { stageSubscriptionReferralMigration } from '../stage-subscription-referral-migration.mjs';

if (process.argv.slice(2).join(' ') !== '--rehearse') throw new Error('Requires --rehearse; local Docker only');
const root = resolve(import.meta.dirname, '../..');
const image = 'postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b';
const socket = mkdtempSync(join(tmpdir(), 'referral-pg17-'));
chmodSync(socket, 0o777);
const container = `referral-install-qa-${randomUUID()}`;
const database = 'subscription_referral_installation_qa';
const manifest = JSON.parse(readFileSync(join(root, 'scripts/sql/subscription-referral-release-review/manifest.json'), 'utf8'));
const fixture = readFileSync(join(root, 'scripts/sql/subscription-referral-release-review/rehearsal-fixture.sql'), 'utf8');
const stage = stageSubscriptionReferralMigration(root);
const checks = [];
let pool, failedPool, started = false;
function docker(args) { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
function deploy(name) {
  const localUrl = `postgresql://postgres@localhost:5432/${name}?host=${encodeURIComponent(socket)}`;
  const args = [join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',stage.schema];
  try {
    execFileSync(process.execPath, args, { cwd: stage.directory, encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: localUrl, DIRECT_URL: localUrl, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
      stdio: ['ignore','pipe','pipe'], timeout: 30000 });
    return { ok: true };
  } catch (error) { return { ok: false, status: error.status, output: `${error.stdout??''}${error.stderr??''}` }; }
}
function adapter(client) { return { query: async (sql, values = []) => (await client.query(sql, values)).rows }; }
try {
  docker(['run','--detach','--name',container,'--network','none','--memory','512m','--cpus','1',
    '--tmpfs','/var/lib/postgresql/data:rw,size=256m','--mount',`type=bind,source=${socket},target=/qa`,
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e',`POSTGRES_DB=${database}`,image,
    'postgres','-c','listen_addresses=','-c','unix_socket_directories=/var/run/postgresql,/qa']);
  started = true;
  let ready = false;
  for (let attempt=0;attempt<60;attempt++) {
    try { docker(['exec',container,'pg_isready','-h','/qa','-U','postgres','-d',database]); ready=true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.equal(ready, true, 'Disposable PostgreSQL failed to start');
  pool = new pg.Pool({ host: socket, user: 'postgres', database, max: 4, connectionTimeoutMillis: 3000 });
  const identity = (await pool.query(`SELECT current_database() AS name,inet_server_addr() IS NULL AS unix_only,current_setting('server_version_num')::int AS version`)).rows[0];
  assert.equal(identity.name,database);assert.equal(identity.unix_only,true);assert.equal(Math.floor(identity.version/10000),17);
  await pool.query(fixture);
  await pool.query(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  const baseline = (await pool.query(`SELECT jsonb_agg(to_jsonb(s) ORDER BY id) AS rows FROM "Store" s`)).rows[0].rows;
  const existingLedger = (await pool.query(`SELECT id,checksum,migration_name,finished_at FROM "_prisma_migrations" ORDER BY id`)).rows;
  async function report(file,field) {
    const client=await pool.connect();
    try { await client.query('BEGIN READ ONLY');
      return (await client.query(readFileSync(join(root,'scripts/sql/subscription-referral-release-review',file),'utf8'))).rows[0][field];
    }finally{await client.query('ROLLBACK');client.release();}
  }
  const before=await report('preflight.sql','preflight');
  for(const key of ['readOnly','newTablesAllAbsent','requiredColumnsMatch','canCreateInPublic','canReferenceParents'])assert.equal(before[key],true,key);
  assert.equal(Number(before.unresolvedMigrations),0);
  checks.push('read_only_preflight_matches_required_parent_columns_and_empty_target');
  let deployed=deploy(database);assert.equal(deployed.ok,true,deployed.output);
  assert.deepEqual((await pool.query(`SELECT jsonb_agg(to_jsonb(s) ORDER BY id) AS rows FROM "Store" s`)).rows[0].rows,baseline);
  assert.deepEqual((await pool.query(`SELECT id,checksum,migration_name,finished_at FROM "_prisma_migrations" WHERE migration_name<>$1 ORDER BY id`,[stage.migrationName])).rows,existingLedger);
  assert.equal((await pool.query(`SELECT checksum FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL`,[stage.migrationName])).rows[0].checksum,stage.checksum);
  checks.push('single_migration_applied_existing_business_rows_and_history_unchanged');
  const after=await report('postflight.sql','postflight');
  for(const key of ['readOnly','allFivePresent','allFiveRls','apiRolesHaveNoPrivileges','publicHasNoPrivileges'])assert.equal(after[key],true,key);
  assert.equal(after.constraints.f,11);assert.equal(after.constraints.p,5);assert.equal(after.constraints.u,9);
  assert.equal(after.migration.checksum,stage.checksum);assert.equal(after.migration.finished,true);
  checks.push('read_only_postflight_verifies_all_tables_constraints_private_access_and_ledger_checksum');
  assert.equal(deploy(database).ok,true);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "_prisma_migrations"`)).rows[0].n,3);
  checks.push('second_deploy_did_not_repeat_or_reconcile_history');
  const tables=(await pool.query(`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname=ANY($1::text[])`,[manifest.newTables])).rows;
  assert.equal(tables.length,5);assert.equal(tables.every(t=>t.relrowsecurity),true);
  for (const role of manifest.blockedApiRoles) {
    for (const table of manifest.newTables) {
      assert.equal((await pool.query(`SELECT has_table_privilege($1,format('public.%I',$2::text),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed`,[role,table])).rows[0].allowed,false);
    }
    const client=await pool.connect();
    try { await client.query(`SET ROLE ${role}`);
      await assert.rejects(client.query('SELECT * FROM "StoreSubscriptionReferralReward"'),e=>e.code==='42501');
    } finally { await client.query('RESET ROLE');client.release(); }
  }
  checks.push('five_tables_rls_and_all_api_role_grants_revoked_even_with_default_grants');
  const { ensureReferralCode, bindReferralLead, verifyReferralPayment, applyReferralReward } =
    await import('../../src/server/services/subscription-referral/repository.ts');
  const db={...adapter(pool),transaction:async work=>{
    const client=await pool.connect();
    try { await client.query('BEGIN');const result=await work(adapter(client));await client.query('COMMIT');return result; }
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }};
  const codes=await Promise.all([ensureReferralCode(db,'a','owner'),ensureReferralCode(db,'a','owner')]);
  assert.equal(codes[0],codes[1]);
  await pool.query('INSERT INTO "ConsultationLead" VALUES ($1,$2::jsonb,$3,$4)',
    ['lead',JSON.stringify({subscriptionReferralCode:codes[0],subscriptionReferralConfirmed:true}),'2026-09-30 02:00','synthetic-application']);
  const relations=await Promise.all([bindReferralLead(db,'hq','lead','b'),bindReferralLead(db,'hq','lead','b')]);
  assert.equal(relations[0].id,relations[1].id);
  const mature=new Date('2026-11-01T10:00:00+08:00');
  const review={commandId:'synthetic-review',referralId:relations[0].id,subscriptionId:'sub-b',receiptRef:'synthetic-receipt',
    settledAt:new Date('2026-10-01T10:00:00+08:00'),distinctOperator:true,firstPaymentConfirmed:true,refunded:false,verificationRef:'synthetic-bank-check'};
  await Promise.all([verifyReferralPayment(db,'hq',review,mature),verifyReferralPayment(db,'hq',review,mature)]);
  const rewards=(await pool.query('SELECT id,"beneficiaryStoreId" FROM "StoreSubscriptionReferralReward" ORDER BY "beneficiaryStoreId"')).rows;
  assert.equal(rewards.length,2);
  const trial={rewardId:rewards[0].id,expectedExpiresOn:'2026-11-20',billingConfirmed:false};
  const applied=await Promise.all([applyReferralReward(db,'hq',trial,mature),applyReferralReward(db,'hq',trial,mature)]);
  assert.equal(applied.filter(r=>r.replayed).length,1);
  assert.equal((await pool.query(`SELECT to_char("planExpiresAt",'YYYY-MM-DD') AS end FROM "Store" WHERE id='a'`)).rows[0].end,'2026-12-20');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM "StorePlanChange"')).rows[0].n,1);
  checks.push('two_connections_code_binding_award_and_application_retries_do_not_duplicate');
  const monthly={rewardId:rewards[1].id,expectedExpiresOn:'2026-11-30',billingConfirmed:false};
  await assert.rejects(applyReferralReward(db,'hq',monthly,mature),/扣款安排/);
  await pool.query(`CREATE FUNCTION qa_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure';END $$;
    CREATE TRIGGER qa_audit_failure BEFORE INSERT ON "StorePlanChange" FOR EACH ROW EXECUTE FUNCTION qa_audit_failure();`);
  await assert.rejects(applyReferralReward(db,'hq',{...monthly,billingConfirmed:true,billingReference:'synthetic-billing'},mature),/synthetic audit failure/);
  assert.equal((await pool.query(`SELECT to_char("planExpiresAt",'YYYY-MM-DD') AS end FROM "Store" WHERE id='b'`)).rows[0].end,'2026-11-30');
  assert.equal((await pool.query(`SELECT to_char("expiresAt",'YYYY-MM-DD') AS end FROM "StoreSubscription" WHERE id='sub-b'`)).rows[0].end,'2026-11-30');
  assert.equal((await pool.query(`SELECT state FROM "StoreSubscriptionReferralReward" WHERE id=$1`,[monthly.rewardId])).rows[0].state,'READY');
  checks.push('monthly_without_evidence_denied_and_audit_failure_rolls_back_all_subscription_changes');
  await pool.query(`CREATE DATABASE subscription_referral_failed_install_qa`);
  failedPool=new pg.Pool({host:socket,user:'postgres',database:'subscription_referral_failed_install_qa'});
  await failedPool.query(fixture);
  await failedPool.query('CREATE TABLE "StoreSubscriptionReferralPayment" (id text)');
  assert.equal(deploy('subscription_referral_failed_install_qa').ok,false);
  const failed=(await failedPool.query(`SELECT to_regclass('public."StoreSubscriptionReferralCode"') IS NULL AS code_absent,
    to_regclass('public."StoreSubscriptionReferral"') IS NULL AS relation_absent,
    (SELECT count(*)::int FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed_ledger`)).rows[0];
  assert.deepEqual(failed,{code_absent:true,relation_absent:true,failed_ledger:1});
  checks.push('mid_install_name_collision_rolls_back_ddl_and_preserves_failed_migration_for_review');
  const evidence={image,postgresVersion:identity.version,migrationName:stage.migrationName,checksum:stage.checksum,
    isolation:'new disposable Docker cluster; --network none; Unix socket only; synthetic parents; no production connection',
    checks,limitations:['Synthetic parent tables reproduce used columns, not the complete live schema or triggers.',
      'Two-session retry coverage is not a stress or complete production UI acceptance test.']};
  writeFileSync(join(root,'artifacts/subscription-referral-management/installation-rehearsal.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} finally {
  await failedPool?.end();await pool?.end();
  if(started)docker(['rm','--force',container]);
  rmSync(socket,{recursive:true,force:true});rmSync(stage.directory,{recursive:true,force:true});
}
