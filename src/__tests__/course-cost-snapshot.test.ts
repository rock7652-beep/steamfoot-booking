import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {recordCoursePurchaseCost} from '@/server/services/course-cost-snapshot';
it('atomically stores an immutable cost quote, with separate identities for each store',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorUserId" text,"storeId" text,"targetType" text,"targetId" text,action text,"afterJson" jsonb,"createdAt" timestamp)');
 const tx={$executeRaw:async(strings:TemplateStringsArray,...values:unknown[])=>db.query(strings.map((s,i)=>s+(i<values.length?'$'+(i+1):'')).join(''),values)} as unknown as Prisma.TransactionClient;
 const plan={id:'fee',name:'單堂',price:600,storeCost:200,points:1,unit:'SESSION',isActive:true,chargeSettings:null};
 await recordCoursePurchaseCost(tx,{storeId:'store-a',userId:'owner'},'order',plan,{price:600,points:1});
 await recordCoursePurchaseCost(tx,{storeId:'store-a',userId:'owner'},'order',{...plan,storeCost:400},{price:600,points:1});
 await recordCoursePurchaseCost(tx,{storeId:'store-b',userId:'owner-b'},'order',{...plan,storeCost:300},{price:600,points:1});
 const rows=(await db.query<{storeId:string;afterJson:{storeCost:number;feeVersion:string}}>('SELECT "storeId","afterJson" FROM "AuditLog" ORDER BY "storeId"')).rows;
 expect(rows.map(r=>r.afterJson.storeCost)).toEqual([200,300]);expect(rows[0].afterJson.feeVersion).toContain('"storeCost":200');
 }finally{await db.close();}
},20000);
