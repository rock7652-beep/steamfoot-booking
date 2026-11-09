// Run after beauty-digital-manager-role-postgres.mjs against its disposable DB.
import assert from 'node:assert/strict';
import {PrismaClient} from '../../generated/beauty-client';
import {recordDigitalManagerNotice,resolveDigitalManagerNotice} from '../../src/server/services/digital-manager-notices';

const url='postgresql://steamfoot_beauty_data_roleqa@127.0.0.1:55438/beauty_digital_manager_role_test';
const db=new PrismaClient({datasourceUrl:url});
async function main(){
 const [identity]=await db.$queryRaw<Array<{actor:string;db:string}>>`SELECT current_user AS actor,current_database() AS db`;
 assert.deepEqual(identity,{actor:'steamfoot_beauty_data_roleqa',db:'beauty_digital_manager_role_test'});
 const input={storeId:'beauty-a',eventKey:'beauty-purchase-pending:service',eventType:'TRANSFER_PENDING_CONFIRMATION' as const,targetId:'service-order'};
 const first=await db.$transaction(tx=>recordDigitalManagerNotice(tx,input));
 const duplicate=await db.$transaction(tx=>recordDigitalManagerNotice(tx,input));
 assert.equal(first,1);assert.equal(duplicate,0);
 const resolved=await db.$transaction(tx=>resolveDigitalManagerNotice(tx,{storeId:'beauty-a',eventKey:input.eventKey,actorUserId:'qa-owner',actorName:'驗收店長'}));
 assert.equal(resolved,1);
 const [row]=await db.$queryRaw<Array<{handledAt:Date|null;revision:number}>>`SELECT "handledAt",revision FROM "DigitalManagerNotice" WHERE "storeId"='beauty-a' AND "eventKey"=${input.eventKey}`;
 assert.ok(row.handledAt instanceof Date);assert.equal(row.revision,1);
 const foreign=await db.$transaction(tx=>resolveDigitalManagerNotice(tx,{storeId:'beauty-a',eventKey:'beauty-purchase-pending:2',actorUserId:'qa-owner',actorName:'驗收店長'}));
 assert.equal(foreign,0);
 console.log('PASS actual notification service with dedicated restricted Beauty Prisma connection');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Role service rehearsal failed');process.exitCode=1}).finally(()=>db.$disconnect());
