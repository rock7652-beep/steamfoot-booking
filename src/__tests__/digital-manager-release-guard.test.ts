import {describe,expect,it,vi} from 'vitest';
import {DIGITAL_MANAGER_REVIEW_TARGET,runDigitalManagerLocalRehearsal,runDigitalManagerProductionCandidate,verifyReviewFiles} from '../../scripts/digital-manager-migration-review.mjs';
import {checkDigitalManagerBuildReadiness} from '../../scripts/digital-manager-build-readiness.mjs';

describe('digital manager release review guards',()=>{
 it('pins both reviewed SQL inputs',()=>{
  expect(verifyReviewFiles().sql).toContain('SET LOCAL beauty_migration.app_role');
  expect(verifyReviewFiles().preflight).toContain('fingerprint');
 });
 it('rejects incomplete or untrusted production provenance before querying',async()=>{
  const db={$transaction:vi.fn()},run=vi.fn();
  const base={NODE_ENV:'production' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',PRODUCTION_MIGRATION_TARGET:DIGITAL_MANAGER_REVIEW_TARGET};
  await expect(runDigitalManagerProductionCandidate(db,run,{...base,VERCEL_GIT_COMMIT_REF:'preview'})).rejects.toThrow('production_provenance_rejected');
  await expect(runDigitalManagerProductionCandidate(db,run,{...base,DATABASE_URL:'postgresql://postgres@localhost:6543/postgres',DIRECT_URL:'postgresql://postgres@localhost:5432/postgres'})).rejects.toThrow('production_connection_rejected');
  expect(db.$transaction).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled();
 });
 it('rejects production metadata in local rehearsal before querying',async()=>{
  const db={$queryRawUnsafe:vi.fn()},run=vi.fn(),url='postgresql://postgres@127.0.0.1:55438/digital_manager_release_handler_test';
  await expect(runDigitalManagerLocalRehearsal(db,run,{NODE_ENV:'test',DIGITAL_MANAGER_MIGRATION_QA:'1',DATABASE_URL:url,DIRECT_URL:url,VERCEL:'1'})).rejects.toThrow('local_scope_rejected');
  expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
 });
 it('checks the database only for the exact production environment and disconnects on rejection',async()=>{
  const create=vi.fn();
  expect(await checkDigitalManagerBuildReadiness({NODE_ENV:'test',VERCEL_ENV:'preview'},create)).toBe('skipped');
  expect(create).not.toHaveBeenCalled();
  await expect(checkDigitalManagerBuildReadiness({VERCEL_ENV:'production',NODE_ENV:'production'},create)).rejects.toThrow('production_provenance_rejected');
  expect(create).not.toHaveBeenCalled();
  const disconnect=vi.fn(),db={$queryRawUnsafe:vi.fn().mockResolvedValue([]),$disconnect:disconnect};
  create.mockResolvedValue(db);
  const env={NODE_ENV:'production' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres.qijlnhtpbintanzpxkvf:placeholder@safe.pooler.supabase.com:6543/postgres',DIRECT_URL:'postgresql://postgres:placeholder@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'};
  await expect(checkDigitalManagerBuildReadiness(env,create)).rejects.toThrow('readiness_ledger_rejected');
  expect(create).toHaveBeenCalledWith(env.DIRECT_URL);expect(disconnect).toHaveBeenCalledOnce();
 });
});
