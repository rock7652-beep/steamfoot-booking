import {describe,expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {BEAUTY_BASE_TABLES,BEAUTY_INTENT_COLUMNS,validateBeautySchema,purchaseIntentAccessPreflight,inactiveBeautyAdditionsPreflight} from '../../scripts/purchase-intent-release-preflight.mjs';
const base=BEAUTY_BASE_TABLES.map((relname:string)=>({relname,relrowsecurity:true}));
const installed=[...base,...Object.keys(BEAUTY_INTENT_COLUMNS).map(relname=>({relname,relrowsecurity:true}))];
describe('read-only purchase intent release gates',()=>{
 it('accepts the legacy schema while disabled and the fully installed staged schema',()=>{
  expect(validateBeautySchema(base,{})).toEqual({schemaTables:14,intentsInstalled:false});
  expect(validateBeautySchema(installed,{})).toEqual({schemaTables:19,intentsInstalled:true});
  expect(validateBeautySchema(installed,{BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED:'1'}).schemaTables).toBe(19);
 });
 it('rejects a same-count substitution, missing RLS and a partial staged installation',()=>{
  expect(()=>validateBeautySchema([...base.slice(1),{relname:'BeautyUnexpected',relrowsecurity:true}],{})).toThrow('schema/RLS');
  expect(()=>validateBeautySchema(installed.map((r,i)=>i===0?{...r,relrowsecurity:false}:r),{})).toThrow('schema/RLS');
  expect(()=>validateBeautySchema(installed.slice(0,-1),{})).toThrow('intent schema');
 });
 it.each(['BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED','BEAUTY_COLLECTION_INTENTS_ENABLED'])('requires intent tables before enabling %s',key=>{
  expect(()=>validateBeautySchema(base,{[key]:'1'})).toThrow('intent schema');
 });
 function client(patch:Record<string,unknown>={}){
  return {query:vi.fn(async(sql:string,params?:string[])=>({rows:sql.includes('has_table_privilege')?[{
   relrowsecurity:true,readable:true,insertable:true,updatable:params?.[0]!=='public."BeautyOnlineConfirmIntent"',destructive:false,browser_access:false,...patch,
  }]:[]}))};
 }
 it('checks actual login access to every installed table without reading rows or writing',async()=>{
  const db=client();await expect(purchaseIntentAccessPreflight(db,'beauty')).resolves.toEqual({tablesChecked:5,readonly:true});
  expect(db.query).toHaveBeenCalledTimes(10);
  expect(db.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  expect(db.query.mock.calls.filter(([sql])=>sql.includes('LIMIT 0'))).toHaveLength(5);
 });
 it.each([{relrowsecurity:false},{readable:false},{insertable:false},{updatable:false},{destructive:true},{browser_access:true}])('blocks an unsafe restricted role boundary %j',async patch=>{
  await expect(purchaseIntentAccessPreflight(client(patch),'beauty')).rejects.toThrow('runtime privileges');
 });
 it('propagates real column privilege failures and rejects absent tables',async()=>{
  const db=client();db.query.mockImplementationOnce(async()=>({rows:[]}));
  await expect(purchaseIntentAccessPreflight(db,'beauty')).rejects.toThrow('runtime privileges');
  const denied=client();denied.query.mockImplementation(async(sql:string)=>{if(sql.includes('LIMIT 0'))throw Error('permission denied');return {rows:[{relrowsecurity:true,readable:true,insertable:true,updatable:true,destructive:false,browser_access:false}]};});
  await expect(purchaseIntentAccessPreflight(denied,'beauty')).rejects.toThrow('permission denied');
 });
 it('checks the course owner connection without requiring revocation of its owner privileges',async()=>{
  await expect(purchaseIntentAccessPreflight(client({destructive:true}),'course')).resolves.toMatchObject({tablesChecked:1});
  await expect(purchaseIntentAccessPreflight(client({browser_access:true}),'course')).rejects.toThrow('runtime privileges');
 });
});

const additions=['BeautyServiceImage','BeautySharedGoodsOrder'].map(relname=>({relname,relrowsecurity:true}));
it('permits only the exact complete additive tables alongside the required schema',()=>{
 expect(validateBeautySchema([...installed,...additions],{}).schemaTables).toBe(21);
 expect(()=>validateBeautySchema([...installed,additions[0]],{})).toThrow('incomplete');
 expect(()=>validateBeautySchema([...installed,...additions,{relname:'BeautyOther',relrowsecurity:true}],{})).toThrow('schema/RLS');
 expect(()=>validateBeautySchema([...installed,...additions.map(r=>({...r,relrowsecurity:false}))],{})).toThrow('schema/RLS');
});
function additiveClient(patch:Record<string,unknown>={},access:Record<string,unknown>={}){return {query:vi.fn(async(sql:string)=>({rows:sql.includes('aclexplode')?[{relrowsecurity:true,browser_access:false,...access}]:[{enabled:false,services_used:false,appointments_used:false,images_used:false,goods_used:false,...patch}]}))};}
it('checks unused closed additions using only read queries and skips absent additions',async()=>{
 const db=additiveClient();await inactiveBeautyAdditionsPreflight(db,installed);expect(db.query).not.toHaveBeenCalled();
 await inactiveBeautyAdditionsPreflight(db,[...installed,...additions]);expect(db.query).toHaveBeenCalledTimes(3);
 expect(db.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['enabled','services_used','appointments_used','images_used','goods_used'])('rejects active or used additive data: %s',async key=>{await expect(inactiveBeautyAdditionsPreflight(additiveClient({[key]:true}),[...installed,...additions])).rejects.toThrow('compatible application');});
it.each([{relrowsecurity:false},{browser_access:true},{browser_access:null}])('retains strict additive access boundaries %j',async access=>{await expect(inactiveBeautyAdditionsPreflight(additiveClient({},access),[...installed,...additions])).rejects.toThrow('privileges');});
it('propagates missing columns and permission errors instead of allowing an unverified release',async()=>{const db=additiveClient();db.query.mockRejectedValueOnce(Error('permission denied'));await expect(inactiveBeautyAdditionsPreflight(db,[...installed,...additions])).rejects.toThrow('permission denied');});

it('accepts real ordinary duration snapshots while rejecting extensions, add-ons and images',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "BeautySetting"("serviceAddOnsEnabled" boolean);
   CREATE TABLE "BeautyService"("addOnGroups" jsonb,"imageId" text);
   CREATE TABLE "BeautyAppointment"("addOnItems" jsonb,"serviceImageId" text,"baseServiceDuration" integer,duration integer);
   CREATE TABLE "BeautyServiceImage"(id text); ALTER TABLE "BeautyServiceImage" ENABLE ROW LEVEL SECURITY;
   CREATE TABLE "BeautySharedGoodsOrder"(id text); ALTER TABLE "BeautySharedGoodsOrder" ENABLE ROW LEVEL SECURITY;
   INSERT INTO "BeautyAppointment" VALUES('[]',NULL,60,60),('[]',NULL,30,30);`);
  const client={query:(sql:string,params?:string[])=>db.query(sql,params)};
  await expect(inactiveBeautyAdditionsPreflight(client,[...installed,...additions])).resolves.toBeUndefined();
  await db.exec(`UPDATE "BeautyAppointment" SET duration=75 WHERE "baseServiceDuration"=60;`);
  await expect(inactiveBeautyAdditionsPreflight(client,[...installed,...additions])).rejects.toThrow('compatible application');
  await db.exec(`UPDATE "BeautyAppointment" SET duration="baseServiceDuration","addOnItems"='[{"id":"head"}]';`);
  await expect(inactiveBeautyAdditionsPreflight(client,[...installed,...additions])).rejects.toThrow('compatible application');
  await db.exec(`UPDATE "BeautyAppointment" SET "addOnItems"='[]',"serviceImageId"='image';`);
  await expect(inactiveBeautyAdditionsPreflight(client,[...installed,...additions])).rejects.toThrow('compatible application');
 }finally{await db.close();}
});
