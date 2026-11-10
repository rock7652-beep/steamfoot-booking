// Local-only Prisma acquisition regression. No production credentials or schema.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {sportsReadinessTransactionOptions} from '../../src/lib/sports-readiness-transaction.ts';
const fixtureRoot=process.env.QA_PGLITE_SOCKET_ROOT;
assert.ok(fixtureRoot,'Set the separately installed local PGlite socket fixture directory');
const fixture=createRequire(resolve(fixtureRoot,'package.json'));
const {PGlite}=fixture('@electric-sql/pglite');
const {PGLiteSocketServer}=fixture('@electric-sql/pglite-socket');
const require=createRequire(import.meta.url),{PrismaClient}=require('../../generated/course-client');
const port=55439,db=await PGlite.create(),server=new PGLiteSocketServer({db,host:'127.0.0.1',port,maxConnections:1});
const url=`postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&pool_timeout=10&connect_timeout=10&sslmode=disable`;
const client=new PrismaClient({datasources:{db:{url}}}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={fixture:'local in-memory PGlite PostgreSQL wire protocol',productionAccess:false,connectionLimit:1,rounds:[],complete:false};
async function queue(options,holdMs){
 let acquired;const ready=new Promise(r=>{acquired=r;});
 const holder=client.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT 1 AS ready');acquired();await sleep(holdMs);},{timeout:20000});
 await ready;const start=performance.now();let entered=false,result,error;
 try{result=await client.$transaction(async tx=>{entered=true;return tx.$queryRawUnsafe('SELECT 1 AS catalog_ready');},options);}catch(e){error=e.code;}
 const waitMs=Math.round(performance.now()-start);await holder;
 return {waitMs,entered,error:error??null,success:!!result};
}
try{
 await server.start();await client.$connect();
 for(let round=1;round<=3;round++){
  const before=await queue(undefined,3200),after=await queue(sportsReadinessTransactionOptions,3200);
  assert.equal(before.error,'P2028');assert.equal(before.entered,false);assert.ok(before.waitMs>=1700);
  assert.equal(after.success,true);assert.equal(after.entered,true);assert.ok(after.waitMs>=2800);
  report.rounds.push({round,before,after});
 }
 const bounded=await queue(sportsReadinessTransactionOptions,11200);assert.ok(['P2024','P2028'].includes(bounded.error));assert.equal(bounded.entered,false);assert.ok(bounded.waitMs>=9500);report.bounded=bounded;
 let executed=false;await assert.rejects(client.$transaction(async tx=>{await sleep(5300);executed=true;await tx.$queryRawUnsafe('SELECT 1 AS expired');},sportsReadinessTransactionOptions),e=>e.code==='P2028');assert.equal(executed,true);report.executionLimitPreserved=true;
 report.complete=true;
}finally{await client.$disconnect();await server.stop();await db.close();writeFileSync(process.env.QA_OUTPUT||'/tmp/silverlily-transaction-contention.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
