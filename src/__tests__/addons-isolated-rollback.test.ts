import {expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import type {Prisma} from '@prisma/client';
vi.mock('@/lib/addons-client-factory',()=>({createAddOnsClient:vi.fn()}));
import {lazyAddOnsClient} from '@/lib/addons-db';
import {addOnCommand,postAddOnReceipt} from '@/server/services/service-add-ons';

it('a restricted PostgreSQL transaction rolls receipt, cashbook, revision and command back when audit fails; retry commits once',async()=>{
 const db=new PGlite();const role='steamfoot_addons_test',project='ttworfzgwejdeolegkxl';
 vi.stubEnv('ADDONS_DATABASE_URL',`postgresql://${role}.${project}:test@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`);
 vi.stubEnv('ADDONS_DATABASE_ROLE',role);vi.stubEnv('ADDONS_DATABASE_PROJECT_REF',project);vi.stubEnv('VERCEL_ENV','preview');
 try{
 await db.exec(`CREATE ROLE steamfoot_addons_test LOGIN;
 CREATE TABLE catalog(groups jsonb);INSERT INTO catalog VALUES('[]');
 CREATE TABLE orders(id text PRIMARY KEY,revision integer,total integer,items jsonb,cancelled boolean);
 INSERT INTO orders VALUES('o',1,80,'[{"id":"tea","name":"茶","price":80,"duration":0,"quantity":1,"groupId":"g","groupTitle":"加購"}]',false);
 CREATE TABLE receipts(id text PRIMARY KEY,amount integer,"originalId" text,method text,"createdAt" timestamp DEFAULT now());
 CREATE TABLE cashbook(id text PRIMARY KEY,amount integer CHECK(amount>0));
 CREATE TABLE commands("storeId" text,"requestKey" text,hash text,result jsonb,PRIMARY KEY("storeId","requestKey"));
 CREATE TABLE audit(id text PRIMARY KEY);
 GRANT SELECT ON catalog,orders,receipts,commands TO steamfoot_addons_test;
 GRANT INSERT ON receipts,cashbook,commands TO steamfoot_addons_test;
 GRANT UPDATE ON orders TO steamfoot_addons_test;
 SET ROLE steamfoot_addons_test;`);
 const rows=async(q:string,v:unknown[]=[]) => (await db.query(q,v)).rows;
 const factory=()=>({
  $queryRaw:async(sql:Prisma.Sql)=>rows(sql.text,sql.values),
  $transaction:async(work:(tx:Prisma.TransactionClient)=>Promise<unknown>)=>db.transaction(async connection=>{
   const query=async(q:string,v:unknown[]=[]) => (await connection.query<Record<string,unknown>>(q,v)).rows;
   const tx={
    serviceAddOnCatalog:{findUnique:async()=>({groups:(await query('SELECT groups FROM catalog'))[0].groups})},
    serviceAddOnOrder:{findUnique:async()=> (await query('SELECT * FROM orders'))[0],update:async()=>query('UPDATE orders SET revision=revision+1')},
    serviceAddOnReceipt:{findMany:async()=>query('SELECT * FROM receipts'),create:async({data}:{data:Record<string,unknown>})=>{
     await query('INSERT INTO receipts(id,amount,"originalId",method) VALUES($1,$2,$3,$4)',[data.id,data.amount,data.originalId,data.method]);return data;
    }},
    staff:{findFirst:async()=>({id:'staff'})},
    cashbookEntry:{create:async({data}:{data:Record<string,unknown>})=>query('INSERT INTO cashbook VALUES($1,$2)',[data.id,data.amount])},
    serviceAddOnCommand:{findUnique:async()=> (await query('SELECT * FROM commands'))[0],create:async({data}:{data:Record<string,unknown>})=>query('INSERT INTO commands VALUES($1,$2,$3,$4)',[data.storeId,data.requestKey,data.hash,JSON.stringify(data.result)])},
    auditLog:{create:async()=>query("INSERT INTO audit VALUES('audit')")},
   } as unknown as Prisma.TransactionClient;
   return work(tx);
  }),
 });
 const client=lazyAddOnsClient(factory);
 const actor={storeId:'s',userId:'u',staffId:'staff'},person={id:'p',bookingId:'b',customerId:null,status:'ACTIVE',bookingStatus:'CONFIRMED'};
 const intent={amount:80,method:'OTHER'},work=(tx:Prisma.TransactionClient)=>addOnCommand(tx,actor,'request',intent,async()=>{
  const result=await postAddOnReceipt(tx,actor,person,{revision:1,amount:80,method:'OTHER'});
  await tx.auditLog.create({data:{} as never});return result;
 });
 await expect(client.$transaction(work)).rejects.toThrow('permission denied');
 expect(await rows('SELECT revision FROM orders')).toEqual([{revision:1}]);
 expect(await rows('SELECT * FROM receipts')).toEqual([]);expect(await rows('SELECT * FROM commands')).toEqual([]);
 await db.exec('RESET ROLE');expect(await rows('SELECT * FROM cashbook')).toEqual([]);
 await db.exec('GRANT INSERT ON audit TO steamfoot_addons_test; SET ROLE steamfoot_addons_test');
 const first=await client.$transaction(work),retry=await client.$transaction(work);expect(retry).toEqual(first);
 expect(await rows('SELECT revision FROM orders')).toEqual([{revision:2}]);
 expect(await rows('SELECT count(*)::int AS n FROM receipts')).toEqual([{n:1}]);
 await db.exec('RESET ROLE');expect(await rows('SELECT count(*)::int AS n FROM cashbook')).toEqual([{n:1}]);expect(await rows('SELECT count(*)::int AS n FROM audit')).toEqual([{n:1}]);
 }finally{vi.unstubAllEnvs();await db.close();}
},20000);
