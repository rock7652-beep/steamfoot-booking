import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { buildCourseAgreementsMigrationSql } from '../../scripts/course-agreements-migration-bundle.mjs';

async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY); CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,UNIQUE(id,"storeId"));
    CREATE TABLE _prisma_migrations(id text PRIMARY KEY,checksum text,migration_name text,started_at timestamptz,finished_at timestamptz,applied_steps_count integer);
    CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;
    INSERT INTO "Store" VALUES ('existing-store'); INSERT INTO "Customer" VALUES ('existing-customer','existing-store');`);
  return db;
}
it('applies only the reviewed additive bundle and seals inherited browser grants', async () => {
  const db = await fixture();
  try {
    await db.exec(buildCourseAgreementsMigrationSql());
    expect((await db.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows).toEqual([{n:3}]);
    expect((await db.query('SELECT * FROM "Customer"')).rows).toEqual([{id:'existing-customer',storeId:'existing-store'}]);
    expect((await db.query(`SELECT has_function_privilege('anon','course_agreement_immutable()','EXECUTE') AS allowed`)).rows).toEqual([{allowed:false}]);
    await expect(db.exec(buildCourseAgreementsMigrationSql())).rejects.toThrow(/existing state rejected/);
  } finally { await db.close(); }
}, 30000);
it('rolls back schema and ledger together when the final operation fails', async () => {
  const db = await fixture();
  try {
    await expect(db.exec(`BEGIN; ${buildCourseAgreementsMigrationSql()} SELECT 1/0; COMMIT;`)).rejects.toThrow(/division by zero/);
    await db.exec('ROLLBACK');
    expect((await db.query(`SELECT to_regclass('public."CourseAgreementSetting"') AS agreement`)).rows).toEqual([{agreement:null}]);
    expect((await db.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows).toEqual([{n:0}]);
    expect((await db.query('SELECT * FROM "Customer"')).rows).toEqual([{id:'existing-customer',storeId:'existing-store'}]);
  } finally { await db.close(); }
}, 30000);
it('rejects partial schema before recording any migration', async () => {
  const db = await fixture();
  try {
    await db.exec('CREATE TABLE "CourseAgreementSetting"(id text)');
    await expect(db.exec(buildCourseAgreementsMigrationSql())).rejects.toThrow(/existing state rejected/);
    expect((await db.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows).toEqual([{n:0}]);
  } finally { await db.close(); }
}, 30000);
