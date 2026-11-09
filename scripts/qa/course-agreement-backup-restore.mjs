// Restore only this task's synthetic export into an in-memory PostgreSQL engine.
// No network, production connection, cloud restore, or existing database writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildCourseAgreementsMigrationSql } from '../course-agreements-migration-bundle.mjs';
const require = createRequire(import.meta.url), { PGlite } = require('@electric-sql/pglite');
const input = process.env.COURSE_AGREEMENT_SYNTHETIC_BACKUP;
assert.ok(input, 'Synthetic backup file required');
const backup = JSON.parse(readFileSync(input, 'utf8'));
assert.equal(backup.synthetic, true);
assert.ok(['qa_agreements_1502_20261103','qa_fitness_agreement_20261104','qa_beauty_agreement_20261104'].includes(backup.storeId), 'Only the three isolated synthetic stores may be restored');
const tables = [['settings','CourseAgreementSetting'],['versions','CourseAgreementVersion'],['reviews','CourseAgreementReview'],['signatures','CourseAgreementSignature'],['assets','CourseAgreementSignatureAsset']];
for (const [key] of tables) {
  assert.ok(Array.isArray(backup[key]));
  for (const row of backup[key]) assert.equal(row.storeId, backup.storeId);
}
assert.ok(backup.signatures.length > 0, 'Signed synthetic evidence required');
assert.ok(backup.signatures.every(row => row.customerId === null), 'No real customer references may be restored');
const db = new PGlite();
try {
  await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,UNIQUE(id,"storeId"));
    CREATE TABLE _prisma_migrations(id text PRIMARY KEY,checksum text,migration_name text,started_at timestamptz,finished_at timestamptz,applied_steps_count integer);
    CREATE ROLE anon;CREATE ROLE authenticated;`);
  await db.query('INSERT INTO "Store" VALUES ($1)', [backup.storeId]);
  await db.exec(buildCourseAgreementsMigrationSql());
  for (const [key,table] of tables) for (const original of backup[key]) {
    const row = { ...original };
    if (key === 'settings') row.activeVersionId = null;
    if (key === 'assets') {
      row.content = '\\x' + Buffer.from(row.contentBase64, 'base64').toString('hex');
      delete row.contentBase64;
    }
    await db.query(`INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}",$1::json)`, [JSON.stringify(row)]);
  }
  for (const row of backup.settings) if (row.activeVersionId) await db.query('UPDATE "CourseAgreementSetting" SET "activeVersionId"=$1 WHERE "storeId"=$2', [row.activeVersionId, backup.storeId]);
  const counts = {};
  for (const [key,table] of tables) {
    const result = await db.query(`SELECT count(*)::int AS n FROM "${table}"`);
    assert.equal(result.rows[0].n, backup[key].length);counts[key] = result.rows[0].n;
  }
  const result = await db.query(`SELECT s.id AS "signatureId",v.document,v."settingsSnapshot",v."documentHash",s."signerSnapshot",s."signatureHash",encode(a.content,'base64') AS png
    FROM "CourseAgreementSignature" s JOIN "CourseAgreementVersion" v ON v.id=s."versionId" AND v."storeId"=s."storeId"
    JOIN "CourseAgreementSignatureAsset" a ON a."signatureId"=s.id AND a."storeId"=s."storeId"`);
  assert.equal(result.rows.length, backup.signatures.length);
  // JSONB may reorder keys. Reconstruct the same canonical clause order used
  // by the evidence verifier, including optional persisted emphasis.
  for (const version of backup.versions) {
    const clauses = version.document.map(({title,body,emphasis}) => ({title,body,...(emphasis === undefined ? {} : {emphasis})}));
    assert.equal(createHash('sha256').update(JSON.stringify(clauses)).digest('hex'), version.documentHash);
  }
  for (const restored of result.rows) {
    const signature = backup.signatures.find(row => row.id === restored.signatureId);
    assert.ok(signature);
    const version = backup.versions.find(row => row.id === signature.versionId);
    assert.ok(version);
    assert.deepEqual(restored.document, version.document);assert.deepEqual(restored.settingsSnapshot, version.settingsSnapshot);assert.deepEqual(restored.signerSnapshot, signature.signerSnapshot);
    assert.equal(restored.documentHash, version.documentHash);
    const png = Buffer.from(restored.png, 'base64');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(createHash('sha256').update(png).digest('hex'), restored.signatureHash);
  }
  await assert.rejects(db.exec('DELETE FROM "CourseAgreementSignature"'), /immutable/);
  const summary = { synthetic:true, cloudRestore:false, engine:'PGlite PostgreSQL', counts, documentAndSignerRestored:true, signatureHashVerified:true, immutableEvidenceRetained:true };
  if (process.env.COURSE_AGREEMENT_RESTORE_REPORT) writeFileSync(process.env.COURSE_AGREEMENT_RESTORE_REPORT, JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
} finally { await db.close(); }
