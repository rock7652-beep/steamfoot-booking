/** Explicit opt-in integration suite: real PostgreSQL and real domain services.
 * HTTP sessions/role guards are separately exercised by beauty-live-browser.mjs. */
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
// Domain tests have no HTTP request. Block accidental authorization calls;
// do not manufacture sessions or mock any database/transaction/domain method.
vi.mock('@/lib/session',()=>({requireSession:()=>{throw Error('HTTP authorization belongs in browser acceptance');}}));
vi.mock('@/lib/permissions',()=>({requirePermission:()=>{throw Error('HTTP authorization belongs in browser acceptance');}}));
vi.mock('@/lib/store',()=>({resolveWriteStoreId:()=>{throw Error('No request context');},getActiveStoreForRead:()=>{throw Error('No request context');}}));
import {randomUUID,randomInt} from 'node:crypto';
import {assertBeautyLocalQaEnvironment} from '../beauty-local-qa-scope.mjs';
import {beautyPrisma as db} from '../../src/lib/beauty-db';
import {prisma} from '../../src/lib/db';
import {beautyTransaction,type BeautyActor} from '../../src/server/beauty/access';
import {reserveParty,transition,type Tx} from '../../src/server/beauty/booking';
import {collect,issueCard,refund,settlement,payFee,voidFee} from '../../src/server/beauty/commerce';
import {partyInput,type PartyInput} from '../../src/lib/beauty/contracts';
import {toLocalDateStr,addTaiwanDuration,toLocalMonthStr,dayRange} from '../../src/lib/date-utils';
const a:BeautyActor={storeId:'beauty-1374-store',userId:'beauty-1374-owner',manager:true};
const member:BeautyActor={storeId:a.storeId,userId:'beauty-1374-member',customerId:'beauty-1374-member-customer'};
const date=process.env.BEAUTY_QA_TEST_DATE ?? addTaiwanDuration(toLocalDateStr(),10,'DAY');
const prefix=randomUUID().slice(0,7);
const phoneBase=randomInt(100000,900000);
let serial=0;
function person(patch:Partial<PartyInput['people'][number]>={}) {
  return {name:`合成${prefix}`,phone:`0913${String(phoneBase + ++serial).padStart(6,'0')}`,serviceId:'beauty-1374-face',preference:'ANY',...patch};
}
function party(time:string,people:ReturnType<typeof person>[],isTrial=false) {
  return partyInput.parse({requestKey:randomUUID(),date,time,contactName:'隔離測試聯絡人',phone:people[0].phone,isTrial,people});
}
const run=<T>(fn:(tx:Tx)=>Promise<T>)=>beautyTransaction(a,fn);
const book=(d:PartyInput,actor=a)=>beautyTransaction(actor,tx=>reserveParty(tx,actor,structuredClone(d)));
beforeAll(async()=>{
  assertBeautyLocalQaEnvironment({...process.env,NODE_ENV:'development',BEAUTY_LOCAL_QA:'1'});
  const [role]=await db.$queryRaw<Array<{safe:boolean}>>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`;
  expect(role.safe).toBe(true);
  expect(await db.beautyAppointment.count({where:{storeId:a.storeId,startsAt:{gte:dayRange(date).start,lte:dayRange(addTaiwanDuration(date,2,'DAY')).end}}}), 'Choose an unused three-day range with BEAUTY_QA_TEST_DATE; this suite retains synthetic financial history.').toBe(0);
});
afterAll(async()=>{await Promise.all([db.$disconnect(),prisma.$disconnect()]);});
it('uses the actual shared schema, RLS, backend grants and exclusion constraints',async()=>{
  const [row]=await db.$queryRaw<Array<{rls:bigint;browserBlocked:boolean}>>`SELECT (SELECT count(*) FROM pg_class WHERE relname LIKE 'Beauty%' AND relrowsecurity) AS rls,NOT has_table_privilege('anon','"BeautyAppointment"','SELECT') AND NOT has_table_privilege('authenticated','"BeautyPayment"','INSERT') AS "browserBlocked"`;
  expect(Number(row.rls)).toBe(13);expect(row.browserBlocked).toBe(true);
});
it('database constraints reject an overlapping insert even if the application allocator is bypassed',async()=>{
  const r=await book({...party('09:00',[person({preference:'FEMALE'})]),date:addTaiwanDuration(date,2,'DAY')});
  const item=await db.beautyAppointment.findUniqueOrThrow({where:{id:r.ids[0]}});
  const {id:ignored,rate,...copy}=item;void ignored;
  await expect(db.beautyAppointment.create({data:{...copy,id:randomUUID(),personPhone:person().phone,rate:rate!}})).rejects.toThrow(/beauty_teacher_overlap|exclusion constraint/);
  expect(await db.beautyAppointment.count({where:{groupId:r.groupId}})).toBe(1);
});
it('persists a two-person different-service party atomically, including separate occupied ends',async()=>{
  const d=party('09:00',[person({preference:'FEMALE'}),person({serviceId:'beauty-1374-massage',preference:'MALE'})],true);
  const r=await book(d);
  const items=await db.beautyAppointment.findMany({where:{groupId:r.groupId},orderBy:{duration:'asc'}});
  expect(items).toHaveLength(2);expect(new Set(items.map(i=>i.locationId)).size).toBe(2);
  expect(items.map(i=>(+i.occupiedEndsAt-+i.startsAt)/60000)).toEqual([75,90]);
  expect(await book(d)).toEqual(r);
  expect(await db.beautyGroup.count({where:{id:r.groupId}})).toBe(1);
  await expect(book({...d,people:[{...d.people[0],notes:'different intent'},d.people[1]]})).rejects.toThrow('已使用');
});
it('two independent database connections cannot both reserve the same technician',async()=>{
  const pids:number[]=[];
  const requests=[party('11:00',[person({preference:'FEMALE'})]),party('11:00',[person({preference:'FEMALE'})])];
  const results=await Promise.allSettled(requests.map(d=>run(async tx=>{
    const [row]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;
    pids.push(row.pid);await tx.$executeRaw`SELECT pg_sleep(0.1)`;
    return reserveParty(tx,a,d);
  })));
  expect(new Set(pids).size).toBe(2);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
});
it('the last space cannot be oversold when different technicians compete',async()=>{
  await prisma.$executeRaw`UPDATE "CourseRoom" SET "isActive"=false WHERE id='beauty-1374-room-b'`;
  try {
    const results=await Promise.allSettled([book(party('12:30',[person({preference:'FEMALE'})])),book(party('12:30',[person({preference:'MALE'})]))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  } finally {await prisma.$executeRaw`UPDATE "CourseRoom" SET "isActive"=true WHERE id='beauty-1374-room-b'`;}
});
it('failed whole-party allocation leaves no group or unlinked customer behind',async()=>{
  const d=party('14:00',[person({preference:'FEMALE'}),person({preference:'FEMALE'})]);
  const n=await db.beautyGroup.count({where:{storeId:a.storeId}});
  await expect(book(d)).rejects.toThrow('全部同行者');
  expect(await db.beautyGroup.count({where:{storeId:a.storeId}})).toBe(n);
  expect(await prisma.customer.count({where:{storeId:a.storeId,phone:{in:d.people.map(p=>p.phone)}}})).toBe(0);
});
it('shared last session is held once, cancellation releases it, completion debits once, correction restores it',async()=>{
  const {cardId}=await run(tx=>issueCard(tx,a,{requestKey:randomUUID(),planId:'beauty-1374-plan',customerId:member.customerId!,memberIds:['beauty-1374-worker-customer'],paid:800,method:'CASH'}));
  const requests=[party('15:00',[person({customerId:member.customerId,phone:'0900001375',cardId})]),party('16:30',[person({customerId:'beauty-1374-worker-customer',phone:'0900001376',cardId})])];
  const results=await Promise.allSettled(requests.map(d=>book(d,member)));
  const won=results.find(r=>r.status==='fulfilled');expect(won?.status).toBe('fulfilled');
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const id=(won as PromiseFulfilledResult<{ids:string[]}>).value.ids[0];
  await run(tx=>transition(tx,a,{id,revision:0,target:'CANCELLED',reason:'釋放'}));
  const loser=requests[results.findIndex(r=>r.status==='rejected')];loser.requestKey=randomUUID();
  const r=await book(loser,member);
  await run(tx=>transition(tx,a,{id:r.ids[0],revision:0,target:'COMPLETED',reason:'完成'}));
  expect((await db.beautyCard.findUniqueOrThrow({where:{id:cardId}})).remaining).toBe(0);
  expect((await db.beautyAppointment.findUniqueOrThrow({where:{id:r.ids[0]}})).fee).toBe(400);
  await expect(run(tx=>transition(tx,a,{id:r.ids[0],revision:0,target:'COMPLETED',reason:'重複'}))).rejects.toThrow('已更新');
  await run(tx=>transition(tx,a,{id:r.ids[0],revision:1,target:'CANCELLED',reason:'更正'}));
  expect((await db.beautyCard.findUniqueOrThrow({where:{id:cardId}})).remaining).toBe(1);
  expect((await db.beautyLedger.findMany({where:{cardId}})).reduce((n,l)=>n+l.delta,0)).toBe(1);
});
it('real cash collection, paid-basis fee, confirmed settlement, payout/recovery and refund append matching cash entries',async()=>{
  const r=await book(party('18:00',[person({preference:'FEMALE'})]));const id=r.ids[0];
  await run(tx=>collect(tx,a,{requestKey:randomUUID(),ids:[id],amounts:[800],method:'CASH',note:'隔離收款'}));
  await run(tx=>transition(tx,a,{id,revision:0,target:'COMPLETED',reason:'完成'}));
  expect((await db.beautyAppointment.findUniqueOrThrow({where:{id}})).fee).toBe(400);
  await expect(run(tx=>payFee(tx,a,{id,amount:400,method:'CASH',note:'未確認'}))).rejects.toThrow('最新月結');
  await run(async tx=>{const s=await settlement(tx,a.storeId,toLocalMonthStr(new Date(date+'T04:00:00Z')));await tx.beautySettlement.create({data:{storeId:a.storeId,month:date.slice(0,7),fingerprint:s.fingerprint,lines:s.lines,actorUserId:a.userId!}});});
  const fee=await run(tx=>payFee(tx,a,{id,amount:400,method:'CASH',note:'付款'}));
  await expect(run(tx=>transition(tx,a,{id,revision:1,target:'CANCELLED',reason:'有付款'}))).rejects.toThrow('已有技師付款');
  await run(tx=>voidFee(tx,a,{paymentId:fee.id,amount:400,method:'CASH',reason:'實際收回'}));
  await run(tx=>transition(tx,a,{id,revision:1,target:'CANCELLED',reason:'更正'}));
  const sale=await db.beautyPayment.findFirstOrThrow({where:{appointmentId:id,kind:'SALE'}});
  await run(tx=>refund(tx,a,{requestKey:randomUUID(),paymentId:sale.id,amount:800,method:'CASH',reason:'取消退款'}));
  const payments=await db.beautyPayment.findMany({where:{appointmentId:id}});
  expect(payments.map(p=>p.kind).sort()).toEqual(['FEE','FEE_VOID','REFUND','SALE']);
  const cash=await prisma.cashbookEntry.findMany({where:{id:{in:payments.map(p=>'beauty:'+p.id)}}});
  expect(cash).toHaveLength(4);expect(cash.reduce((n,e)=>n+(e.type==='INCOME'?1:-1)*Number(e.amount),0)).toBe(0);
  await expect(db.beautyPayment.update({where:{id:sale.id},data:{amount:1}})).rejects.toThrow('immutable');
});
it('trial eligibility is per service, cancelled trials release eligibility, no-shows retain it',async()=>{
  const p=person({preference:'MALE'});const r=await book(party('19:30',[p],true));
  await run(tx=>transition(tx,a,{id:r.ids[0],revision:0,target:'NO_SHOW',reason:'未到'}));
  await expect(book({...party('09:00',[p],true),date:addTaiwanDuration(date,1,'DAY')})).rejects.toThrow('限體驗一次');
  await run(tx=>transition(tx,a,{id:r.ids[0],revision:1,target:'CANCELLED',reason:'修正'}));
  await expect(book({...party('09:00',[p],true),date:addTaiwanDuration(date,1,'DAY')})).resolves.toHaveProperty('ids');
});
