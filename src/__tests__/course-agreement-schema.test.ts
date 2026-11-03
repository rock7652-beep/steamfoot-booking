import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
const db=new PGlite();
const hash='a'.repeat(64);
beforeAll(async()=>{
 await db.exec(`CREATE TABLE "Store"(id TEXT PRIMARY KEY); CREATE TABLE "Customer"(id TEXT PRIMARY KEY,"storeId" TEXT NOT NULL, UNIQUE(id,"storeId")); CREATE ROLE anon; CREATE ROLE authenticated;`);
 await db.exec(readFileSync('prisma/migrations/20261103153000_course_agreement_core/migration.sql','utf8'));
 await db.exec(readFileSync('prisma/migrations/20261103160000_course_agreement_signature_assets/migration.sql','utf8'));
 await db.exec(`INSERT INTO "Store" VALUES ('a'),('b'); INSERT INTO "Customer" VALUES ('ca','a'),('cb','b'); INSERT INTO "CourseAgreementSetting"("storeId") VALUES ('a'),('b');`);
 await db.query(`INSERT INTO "CourseAgreementVersion"(id,"storeId",version,"settingsSnapshot",document,"documentHash","signingTokenHash","createdById") VALUES ('v','a',1,'{}','[]',$1,$1,'staff')`,[hash]);
 await db.query(`INSERT INTO "CourseAgreementReview"(id,"storeId","versionId","tokenHash","expiresAt") VALUES ('r','a','v',$1,now()+interval '1 day')`,[hash]);
 await db.query(`INSERT INTO "CourseAgreementSignature"(id,"storeId","versionId","reviewId","customerId","signerSnapshot","signatureObjectKey","signatureHash","receiptTokenHash","requestKey","reviewAcknowledgedAt","electronicConsentAt") VALUES ('s','a','v','r','ca','{}','a/agreements/s.png',$1,$1,'request',now(),now())`,[hash]);
},30000);
afterAll(async()=>{await db.close();});
it('rejects cross-store active versions',async()=>{await expect(db.exec(`UPDATE "CourseAgreementSetting" SET "activeVersionId"='v' WHERE "storeId"='b'`)).rejects.toThrow(/foreign key/i);});
it('rejects cross-store review references',async()=>{await expect(db.query(`INSERT INTO "CourseAgreementReview"(id,"storeId","versionId","tokenHash","expiresAt") VALUES ('foreign','b','v',$1,now()+interval '1 day')`,['b'.repeat(64)])).rejects.toThrow(/foreign key/i);});
it('keeps published content and signed evidence immutable',async()=>{
 for(const table of ['CourseAgreementVersion','CourseAgreementSignature']){
 await expect(db.exec(`UPDATE "${table}" SET id='changed'`)).rejects.toThrow(/immutable/);
 await expect(db.exec(`DELETE FROM "${table}"`)).rejects.toThrow(/immutable/);
 }
});
it('prevents a second signature using the same review',async()=>{
 await expect(db.exec(`INSERT INTO "CourseAgreementSignature" SELECT 's2',"storeId","versionId","reviewId","customerId","signerSnapshot","signatureObjectKey","signatureHash",repeat('b',64),'request2',"reviewAcknowledgedAt","electronicConsentAt","signedAt","requestHash" FROM "CourseAgreementSignature" WHERE id='s'`)).rejects.toThrow(/unique/i);
});
it('denies direct browser roles access to personal data',async()=>{
 for(const role of ['anon','authenticated']){
 await db.exec(`SET ROLE ${role}`);
 try{await expect(db.exec(`SELECT * FROM "CourseAgreementSignature"`)).rejects.toThrow(/permission denied/i);}finally{await db.exec('RESET ROLE');}
 }
});

it('binds signature bytes to the same store and object key',async()=>{
 await expect(db.exec(`INSERT INTO "CourseAgreementSignatureAsset"("objectKey","signatureId","storeId",content) VALUES ('a/agreements/s.png','s','b',decode('89504e47','hex'))`)).rejects.toThrow(/foreign key/i);
 await db.exec(`INSERT INTO "CourseAgreementSignatureAsset"("objectKey","signatureId","storeId",content) VALUES ('a/agreements/s.png','s','a',decode('89504e47','hex'))`);
 await expect(db.exec(`UPDATE "CourseAgreementSignatureAsset" SET content=decode('00','hex')`)).rejects.toThrow(/immutable/);
 await db.exec('SET ROLE anon');try{await expect(db.exec('SELECT * FROM "CourseAgreementSignatureAsset"')).rejects.toThrow(/permission denied/i);}finally{await db.exec('RESET ROLE');}
});
