import {describe,expect,it,vi} from 'vitest';
import {DIGITAL_MANAGER_REVIEW_TARGET,runDigitalManagerLocalRehearsal,runDigitalManagerProductionCandidate,verifyReviewFiles} from '../../scripts/digital-manager-migration-review.mjs';

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
});
