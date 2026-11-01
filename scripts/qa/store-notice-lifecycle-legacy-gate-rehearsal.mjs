// Isolated proof that lifecycle filtering preserves every legacy metadata field.
// PGlite's constraint catalog can differ from production PG17; never allowlist it.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {verifyDigitalManagerPostflight} from '../digital-manager-migration-review.mjs';
const db=new PGlite();
try{
 const setup=readFileSync('src/__tests__/store-notice-lifecycle.pg.test.ts','utf8').match(/await db.exec\(`(CREATE ROLE[\s\S]*?)`\);/)[1];
 await db.exec(setup);await db.exec('DROP TABLE public."DigitalManagerNotice"');
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 let captured;
 const tx={$queryRawUnsafe:async sql=>{
  const rows=(await db.query(sql)).rows;
  if(sql.includes('AS columns')){captured=rows;return [];}
  return rows;
 }};
 // Capture the real gate query; return no rows so it deliberately stops there.
 await assert.rejects(verifyDigitalManagerPostflight(tx),/tables_rejected/);const before=captured;
 await db.exec(readFileSync('scripts/sql/store-notice-lifecycle-phase1.sql','utf8'));
 await assert.rejects(verifyDigitalManagerPostflight(tx,undefined,{lifecycle:true}),/tables_rejected/);const after=captured;
 assert.deepEqual(after,before);
 await db.exec('ALTER TABLE public."DigitalManagerNotice" ADD COLUMN unexpected text');
 await assert.rejects(verifyDigitalManagerPostflight(tx,undefined,{lifecycle:true}),/tables_rejected/);
 assert.notDeepEqual(captured,before);
 console.log(JSON.stringify({legacyMetadataPreserved:true,unexpectedLegacyColumnStillDetected:true,fullProductionGateAccepted:false}));
}finally{await db.close();}
