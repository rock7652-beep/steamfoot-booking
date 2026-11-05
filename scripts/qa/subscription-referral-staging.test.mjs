import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { stageSubscriptionReferralMigration } from '../stage-subscription-referral-migration.mjs';

const root=resolve(import.meta.dirname,'../..');
test('stages exactly one checksum-matched migration, without the repository history',()=>{
  const staged=stageSubscriptionReferralMigration(root);
  try {
    assert.equal(staged.databaseWorkPerformed,false);
    assert.deepEqual(readdirSync(join(staged.directory,'migrations')).sort(),[staged.migrationName,'migration_lock.toml'].sort());
    const sql=readFileSync(join(staged.directory,'migrations',staged.migrationName,'migration.sql'));
    assert.equal(createHash('sha256').update(sql).digest('hex'),staged.checksum);
    assert.equal(sql.equals(readFileSync(join(root,'docs/marketing/subscription-referral-schema.sql'))),true);
    assert.ok(readFileSync(staged.schema,'utf8').includes('directUrl = env("DIRECT_URL")'));
  }finally{rmSync(staged.directory,{recursive:true,force:true});}
});
test('refuses SQL that differs from the reviewed checksum',()=>{
  const fake=mkdtempSync(join(tmpdir(),'referral-stage-tamper-'));
  try {
    mkdirSync(join(fake,'scripts/sql/subscription-referral-release-review'),{recursive:true});
    mkdirSync(join(fake,'docs/marketing'),{recursive:true});
    writeFileSync(join(fake,'scripts/sql/subscription-referral-release-review/manifest.json'),
      readFileSync(join(root,'scripts/sql/subscription-referral-release-review/manifest.json')));
    writeFileSync(join(fake,'docs/marketing/subscription-referral-schema.sql'),'SELECT 1;');
    assert.throws(()=>stageSubscriptionReferralMigration(fake),/checksum mismatch/);
  }finally{rmSync(fake,{recursive:true,force:true});}
});
test('refuses a manifest pointing outside the approved SQL path',()=>{
  const fake=mkdtempSync(join(tmpdir(),'referral-stage-path-'));
  try {
    mkdirSync(join(fake,'scripts/sql/subscription-referral-release-review'),{recursive:true});
    writeFileSync(join(fake,'scripts/sql/subscription-referral-release-review/manifest.json'),JSON.stringify({
      sqlFile:'../../outside.sql',migrationName:'20261104235300_subscription_referral_private_core'}));
    assert.throws(()=>stageSubscriptionReferralMigration(fake),/Unexpected referral migration manifest/);
  }finally{rmSync(fake,{recursive:true,force:true});}
});
