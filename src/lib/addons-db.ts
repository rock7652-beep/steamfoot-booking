import 'server-only';
import {Prisma} from '@prisma/client';
import {addOnsDatabaseSelection} from './addons-database-url';
import {createAddOnsClient} from './addons-client-factory';

/** Construct lazily, so disabled add-ons cannot prevent ordinary pages loading.
 * Validate before cache lookup; never reuse a client for changed credentials. */
export function lazyAddOnsClient<T extends object>(factory:(url:string)=>T):T{
 let client:T|undefined,selection:string|undefined,verified:Promise<void>|undefined;
 const delegates=new Map<PropertyKey,object>();
 function current(){
  const config=addOnsDatabaseSelection();
  if(selection!==undefined&&selection!==config.url)throw new Error('附加項目連線設定已變更，請重新啟動服務');
  if(!client){client=factory(config.url);selection=config.url;}
  return {client,role:config.role};
 }
 async function ready(){
  const {client,role}=current();
  verified??=(async()=>{
   const rows=await (Reflect.get(client,"$queryRaw") as (sql:Prisma.Sql)=>Promise<Array<{valid:boolean}>>).call(client,Prisma.sql`SELECT current_database()='postgres' AND current_user=${role} AND EXISTS (
    SELECT FROM pg_roles r WHERE r.rolname=current_user AND r.rolcanlogin
    AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
    AND NOT EXISTS(SELECT FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls OR elevated.rolcreaterole OR elevated.rolcreatedb OR elevated.rolreplication) AND pg_has_role(r.oid,elevated.oid,'MEMBER'))
   ) AS valid`) as Array<{valid:boolean}>;
   const [row]=rows;
   if(row?.valid!==true)throw new Error('invalid add-ons role');
  })().catch(()=>{verified=undefined;throw new Error('附加項目專用連線驗證失敗');});
  await verified;return client;
 }
 return new Proxy({} as T,{
  get(_target,key){
   // Promise inspection must not create a connection.
   if(key==='then')return undefined;
   if(typeof key!=='string')return undefined;
   if(key.startsWith('$'))return async(...args:unknown[])=>{
    const c=await ready();const method=Reflect.get(c,key) as (...a:unknown[])=>unknown;
    return method.apply(c,args);
   };
   if(!delegates.has(key))delegates.set(key,new Proxy({}, {get(_delegate,operation){
    if(operation==='then')return undefined;
    return async(...args:unknown[])=>{const c=await ready();const model=Reflect.get(c,key) as object;return (Reflect.get(model,operation) as (...a:unknown[])=>unknown).apply(model,args);};
   }}));
   return delegates.get(key);
  },
 });
}
export const addonsPrisma=lazyAddOnsClient(createAddOnsClient);
