import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { emptyCourseAgreement, buildCourseAgreement } from '@/lib/course-agreement';
import { courseAgreementSignSchema } from '@/lib/course-agreement-signing';
import { isCourseAgreementPublicPath } from '@/lib/course-agreement-public-path';
const m=vi.hoisted(()=>({tx:vi.fn(),version:vi.fn(),setting:vi.fn(),receipt:vi.fn(),music:vi.fn(),store:vi.fn(),lock:vi.fn(),count:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{$transaction:m.tx,courseAgreementVersion:{findUnique:m.version},courseAgreementSetting:{findUnique:m.setting},courseAgreementSignature:{findUnique:m.receipt}}}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store}}}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStoreFromEntitlements:m.music}));
vi.mock('@/server/services/course-store-lock',()=>({lockCourseStore:m.lock}));
import { beginPublicCourseAgreement, readPublicCourseAgreement, signPublicCourseAgreement, readCourseAgreementReceipt } from '@/server/services/course-agreement-public';
import { courseAgreementReceiptToken } from '@/server/services/course-agreement-signing-token';
const db=new PGlite(),token='a'.repeat(43),reviewToken='b'.repeat(43);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const snapshot={...emptyCourseAgreement('合成店'),business:'cram',privacyNotice:'合成資料'};
const document=buildCourseAgreement(snapshot as ReturnType<typeof emptyCourseAgreement>);
const version={id:'v',storeId:'a',version:1,settingsSnapshot:snapshot,document,documentHash:hash(JSON.stringify(document)),signingTokenHash:hash(token)};
const input=()=>({requestKey:'61d8b662-f189-4a8b-b636-e679844c5e2c',documentHash:version.documentHash,signer:{name:'測試學員',phone:'0911-000-001',minor:false},strokes:[[{x:.1,y:.2},{x:.5,y:.6}]],readAcknowledged:true,electronicConsent:true});
let failAsset=false;
async function reviews(where:{tokenHash:string}){
 const r=(await db.query<Record<string,unknown>>(`SELECT * FROM "CourseAgreementReview" WHERE "tokenHash"=$1`,[where.tokenHash])).rows[0];
 if(!r)return null;
 return {...r,deliveredAt:new Date(r.deliveredAt as string),expiresAt:new Date(r.expiresAt as string),signatures:(await db.query(`SELECT * FROM "CourseAgreementSignature" WHERE "reviewId"=$1`,[r.id])).rows};
}
const tx={courseAgreementSetting:{findUnique:()=>m.setting()},courseAgreementReview:{
 findUnique:({where}:{where:{tokenHash:string}})=>reviews(where),
 count:m.count,
 create:async({data}:{data:Record<string,unknown>})=>{await db.query(`INSERT INTO "CourseAgreementReview"(id,"storeId","versionId","tokenHash","deliveredAt","expiresAt") VALUES ('new-r',$1,$2,$3,$4,$5)`,[data.storeId,data.versionId,data.tokenHash,data.deliveredAt,data.expiresAt]);return{...data,id:'new-r'};},
 updateMany:async({where,data}:{where:{id:string};data:{consumedAt:Date}})=>{const r=await db.query(`UPDATE "CourseAgreementReview" SET "consumedAt"=$1 WHERE id=$2 AND "consumedAt" IS NULL RETURNING id`,[data.consumedAt,where.id]);return{count:r.rows.length};}
},courseAgreementSignature:{create:async({data}:{data:Record<string,unknown>})=>{
 const fields=Object.keys(data),values=fields.map(k=>k==='signerSnapshot'?JSON.stringify(data[k]):data[k]);
 await db.query(`INSERT INTO "CourseAgreementSignature" (${fields.map(k=>`"${k}"`).join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')})`,values);return data;
}},courseAgreementSignatureAsset:{create:async({data}:{data:{objectKey:string;storeId:string;signatureId:string;content:Uint8Array}})=>{
 if(failAsset)throw Error('simulated asset failure');
 await db.query(`INSERT INTO "CourseAgreementSignatureAsset"("objectKey","storeId","signatureId",content) VALUES ($1,$2,$3,$4)`,[data.objectKey,data.storeId,data.signatureId,data.content]);return data;
}}};
beforeAll(async()=>{
 await db.exec(`CREATE TABLE "Store"(id TEXT PRIMARY KEY);CREATE TABLE "Customer"(id TEXT PRIMARY KEY,"storeId" TEXT,UNIQUE(id,"storeId"));`);
 for(const name of ['20261103153000_course_agreement_core','20261103160000_course_agreement_signature_assets'])await db.exec(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
 await db.exec(`INSERT INTO "Store" VALUES ('a'),('b');INSERT INTO "CourseAgreementSetting"("storeId") VALUES ('a'),('b');`);
 await db.query(`INSERT INTO "CourseAgreementVersion"(id,"storeId",version,"settingsSnapshot",document,"documentHash","signingTokenHash","createdById") VALUES ('v','a',1,$1,$2,$3,$4,'staff')`,[JSON.stringify(snapshot),JSON.stringify(document),version.documentHash,version.signingTokenHash]);
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{
 vi.resetAllMocks();vi.stubEnv('COURSE_AGREEMENTS_ENABLED','1');vi.stubEnv('COURSE_AGREEMENTS_PUBLIC_ENABLED','1');vi.stubEnv('COURSE_AGREEMENT_LINK_SECRET','synthetic-secret-with-more-than-32-bytes');failAsset=false;m.count.mockResolvedValue(0);
 // Evidence stays immutable. Truncate only this isolated fixture between cases.
 await db.exec(`TRUNCATE "CourseAgreementSignatureAsset","CourseAgreementSignature","CourseAgreementReview" CASCADE;`);
 await db.query(`INSERT INTO "CourseAgreementReview"(id,"storeId","versionId","tokenHash","deliveredAt","expiresAt") VALUES ('r','a','v',$1,now()-interval '1 minute',now()+interval '1 day')`,[hash(reviewToken)]);
 m.version.mockResolvedValue(version);m.setting.mockResolvedValue({activeVersionId:'v'});m.music.mockResolvedValue(true);m.store.mockResolvedValue({industryModule:'COURSE',operatingStatus:'ACTIVE'});
 m.tx.mockImplementation(async run=>{await db.exec('BEGIN');try{const result=await run(tx);await db.exec('COMMIT');return result;}catch(error){await db.exec('ROLLBACK');throw error;}});
});
afterEach(()=>vi.unstubAllEnvs());
it('keeps public signing closed unless explicitly enabled',async()=>{vi.stubEnv('COURSE_AGREEMENTS_PUBLIC_ENABLED','');await expect(readPublicCourseAgreement(token)).rejects.toThrow('已失效');expect(m.version).not.toHaveBeenCalled();});
it('does not read settings or issue reviews for invalid tokens',async()=>{await expect(beginPublicCourseAgreement('short')).rejects.toThrow('已失效');expect(m.tx).not.toHaveBeenCalled();});
it('rejects stopped, nonmusic and noncourse stores',async()=>{m.music.mockResolvedValue(false);await expect(readPublicCourseAgreement(token)).rejects.toThrow('已失效');m.music.mockResolvedValue(true);m.store.mockResolvedValue({industryModule:'COURSE',operatingStatus:'SUSPENDED'});await expect(readPublicCourseAgreement(token)).rejects.toThrow('已失效');});
it('rejects old or paused versions for new signatures',async()=>{m.setting.mockResolvedValue({activeVersionId:null});await expect(signPublicCourseAgreement(token,reviewToken,input())).rejects.toThrow('已失效');expect((await db.query('SELECT * FROM "CourseAgreementSignature"')).rows).toHaveLength(0);});
it('reuses the same unconsumed browser review with its real delivery time',async()=>{const result=await beginPublicCourseAgreement(token,reviewToken);expect(result.reviewToken).toBe(reviewToken);expect('deliveredAt' in result.data).toBe(true);expect((await db.query('SELECT * FROM "CourseAgreementReview"')).rows).toHaveLength(1);});
it('rejects a review from a different store/version',async()=>{await expect(signPublicCourseAgreement(token,'c'.repeat(43),input())).rejects.toThrow('重新取得');});
it('requires guardian data and rejects blank or unsafe signature input',()=>{
 expect(()=>courseAgreementSignSchema.parse({...input(),signer:{name:'孩子',phone:'0911000001',minor:true}})).toThrow();
 expect(()=>courseAgreementSignSchema.parse({...input(),strokes:[]})).toThrow();
 expect(()=>courseAgreementSignSchema.parse({...input(),strokes:[[{x:0,y:0},{x:Infinity,y:1}]]})).toThrow();
 expect(()=>courseAgreementSignSchema.parse({...input(),strokes:[[{x:.1,y:.1},{x:.1,y:.1}]]})).toThrow();
});
it('requires the actual reviewed document hash and explicit consent',async()=>{await expect(signPublicCourseAgreement(token,reviewToken,{...input(),documentHash:'f'.repeat(64)})).rejects.toThrow('版本不符');await expect(signPublicCourseAgreement(token,reviewToken,{...input(),electronicConsent:false})).rejects.toThrow();});
it('rejects expired reviews',async()=>{await db.exec(`UPDATE "CourseAgreementReview" SET "deliveredAt"=now()-interval '2 days',"expiresAt"=now()-interval '1 day'`);await expect(signPublicCourseAgreement(token,reviewToken,input())).rejects.toThrow('逾期');});
it('atomically persists private PNG evidence and metadata and never auto-links Customer',async()=>{
 const result=await signPublicCourseAgreement(token,reviewToken,input());expect(result.receiptPath).toMatch(/^\/course-agreements\/receipt\/[\w-]{43}$/);
 const row=(await db.query<Record<string,unknown>>('SELECT * FROM "CourseAgreementSignature"')).rows[0];expect(row.customerId).toBeNull();expect(row.signerSnapshot).toMatchObject({phone:'0911000001'});
 const asset=(await db.query<{content:Uint8Array}>('SELECT content FROM "CourseAgreementSignatureAsset"')).rows[0];expect(Buffer.from(asset.content).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(createHash('sha256').update(asset.content).digest('hex')).toBe(row.signatureHash);
 expect((await db.query<{consumedAt:unknown}>('SELECT "consumedAt" FROM "CourseAgreementReview" WHERE id=\'r\'')).rows[0].consumedAt).not.toBeNull();
});
it('rolls back signature metadata and review consumption when evidence storage fails',async()=>{failAsset=true;await expect(signPublicCourseAgreement(token,reviewToken,input())).rejects.toThrow('simulated asset');expect((await db.query('SELECT * FROM "CourseAgreementSignature"')).rows).toHaveLength(0);expect((await db.query<{consumedAt:unknown}>('SELECT "consumedAt" FROM "CourseAgreementReview" WHERE id=\'r\'')).rows[0].consumedAt).toBeNull();});
it('recovers the same receipt after a lost response even if signing was paused',async()=>{const a=await signPublicCourseAgreement(token,reviewToken,input());m.setting.mockResolvedValue({activeVersionId:null});const b=await signPublicCourseAgreement(token,reviewToken,input());expect(b).toEqual(a);expect((await db.query('SELECT * FROM "CourseAgreementSignature"')).rows).toHaveLength(1);});
it('rejects changed payload on a consumed review',async()=>{await signPublicCourseAgreement(token,reviewToken,input());await expect(signPublicCourseAgreement(token,reviewToken,{...input(),signer:{name:'另一人',phone:'0911000001',minor:false}})).rejects.toThrow('已完成簽署');});
it('retains guardian information as the actual signer snapshot',async()=>{await signPublicCourseAgreement(token,reviewToken,{...input(),signer:{name:'孩子',phone:'0911000001',minor:true,guardian:{name:'家長',phone:'0911000002',relation:'母親'}}});const row=(await db.query<{signerSnapshot:unknown}>('SELECT "signerSnapshot" FROM "CourseAgreementSignature"')).rows[0];expect(row.signerSnapshot).toMatchObject({minor:true,guardian:{name:'家長',relation:'母親'}});});
it('only accepts the exact public capability route shapes',()=>{expect(isCourseAgreementPublicPath(`/course-agreements/${token}`)).toBe(true);expect(isCourseAgreementPublicPath(`/course-agreements/receipt/${token}`)).toBe(true);expect(isCourseAgreementPublicPath('/course-agreements/admin')).toBe(false);expect(isCourseAgreementPublicPath(`/course-agreements/${token}/extra`)).toBe(false);});
it('a private receipt is still readable after pausing new signatures',async()=>{
 const result=await signPublicCourseAgreement(token,reviewToken,input());const row=(await db.query<Record<string,unknown>>('SELECT * FROM "CourseAgreementSignature"')).rows[0];const asset=(await db.query('SELECT * FROM "CourseAgreementSignatureAsset"')).rows[0];
 const review=(await reviews({tokenHash:hash(reviewToken)}))!;
 m.setting.mockResolvedValue({activeVersionId:null});m.receipt.mockResolvedValue({...row,signedAt:new Date(row.signedAt as string),asset,version,review});
 const receipt=await readCourseAgreementReceipt(result.receiptPath.split('/').at(-1)!);expect(receipt.signer.name).toBe('測試學員');expect(receipt.signatureDataUrl).toMatch(/^data:image\/png;base64,/);
 expect(result.receiptPath).toContain(courseAgreementReceiptToken('a',row.id as string));
});

it('caps review issuance consistently for a busy store',async()=>{m.count.mockResolvedValue(100);await expect(beginPublicCourseAgreement(token,undefined,true)).rejects.toThrow('開啟人數較多');expect((await db.query('SELECT * FROM "CourseAgreementReview"')).rows).toHaveLength(1);});
it('can start a new learner review without changing the previous evidence',async()=>{await signPublicCourseAgreement(token,reviewToken,input());const next=await beginPublicCourseAgreement(token,reviewToken,true);expect(next.reviewToken).not.toBe(reviewToken);expect((await db.query('SELECT * FROM "CourseAgreementSignature"')).rows).toHaveLength(1);expect((await db.query('SELECT * FROM "CourseAgreementReview"')).rows).toHaveLength(2);});
it('cannot retrieve a receipt with a different bearer token',async()=>{m.receipt.mockResolvedValue(null);await expect(readCourseAgreementReceipt('c'.repeat(43))).rejects.toThrow('已失效');expect(m.receipt).toHaveBeenCalledWith(expect.objectContaining({where:{receiptTokenHash:hash('c'.repeat(43))}}));});
