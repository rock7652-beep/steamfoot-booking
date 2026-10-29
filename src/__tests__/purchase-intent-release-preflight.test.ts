import {describe,expect,it,vi} from 'vitest';
import {BEAUTY_BASE_TABLES,BEAUTY_INTENT_COLUMNS,validateBeautySchema,purchaseIntentAccessPreflight} from '../../scripts/purchase-intent-release-preflight.mjs';
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
