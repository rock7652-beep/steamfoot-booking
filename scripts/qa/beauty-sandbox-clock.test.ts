/** Real domain/PG verification. Only this test process's Date is controlled;
 * live Next, database server time and real authentication remain untouched. */
import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
vi.mock('@/lib/session',()=>({requireSession:()=>{throw Error('No HTTP auth in clock suite');}}));
vi.mock('@/lib/permissions',()=>({requirePermission:()=>{throw Error('No HTTP auth in clock suite');}}));
vi.mock('@/lib/store',()=>({resolveWriteStoreId:()=>{throw Error('No HTTP context');},getActiveStoreForRead:()=>{throw Error('No HTTP context');}}));
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {assertBeautySandboxQaEnvironment} from '../beauty-sandbox-qa-scope.mjs';
assertBeautySandboxQaEnvironment({...process.env,NODE_ENV:'development'});
const {beautyPrisma:db}=await import('../../src/lib/beauty-db');
const {prisma}=await import('../../src/lib/db');
const {beautyTransaction}=await import('../../src/server/beauty/access');
const {reserveParty,transition,assertCard}=await import('../../src/server/beauty/booking');
const {issueCard,collect}=await import('../../src/server/beauty/commerce');
const {partyInput}=await import('../../src/lib/beauty/contracts');
const {toLocalDateStr,toLocalMonthStr,dayRange,monthRange,parseTaipeiDateTime}=await import('../../src/lib/date-utils');
const {PrismaClient:CourseClient}=await import('../../generated/course-client');
const course=new CourseClient(),fixture=JSON.parse(await readFile('/tmp/beauty-org-fixture.json','utf8'));
if(!/^beauty-1374-org-[a-f0-9]{8}$/.test(fixture.childId))throw Error('Unexpected organization fixture');
const runId=randomUUID().slice(0,8),out='/tmp/beauty-sandbox-clock/'+runId;
const a={storeId:fixture.childId,userId:fixture.childOwnerId,manager:true};
const results:Array<{case:string;passed:boolean}>=[];
let serviceId:string,techId:string,planId:string,cardId:string,reservedId:string;
function clock(instant:string){vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(instant));}
function pass(label:string){results.push({case:label,passed:true});}
const run=<T>(fn:Parameters<typeof beautyTransaction<T>>[1])=>beautyTransaction(a,fn);
function party(date:string,time:string,card?:string){return partyInput.parse({requestKey:randomUUID(),date,time,contactName:'合成時間邊界',phone:'0900000000',isTrial:false,people:[{name:'合成邊界-'+runId,phone:'0900000000',customerId:fixture.childCustomerId,serviceId,preference:'FEMALE' as const,specifiedTechnicianId:techId,...(card?{cardId:card}:{}),notes:'clock-'+runId}]});}
beforeAll(async()=>{
 await mkdir(out,{recursive:true});expect((await prisma.store.findUniqueOrThrow({where:{id:a.storeId}})).parentStoreId).toBe('beauty-1374-store');
 const service=await db.beautyService.create({data:{storeId:a.storeId,name:'時間邊界10分-'+runId,duration:10,buffer:5,price:1000}});serviceId=service.id;
 const room=await course.courseRoom.create({data:{storeId:a.storeId,name:'邊界空間-'+runId,capacity:1}});expect(room.id).toBeTruthy();
 const tech=await db.beautyTechnician.create({data:{storeId:a.storeId,name:'邊界女技師-'+runId,gender:'FEMALE',serviceIds:[serviceId],weekly:Array.from({length:7},(_,day)=>({day,start:'00:00',end:'23:59'})),rates:{[serviceId]:{mode:'FIXED',value:100}}}});techId=tech.id;
 const plan=await db.beautyPlan.create({data:{storeId:a.storeId,name:'一天3次-'+runId,sessions:3,price:1000,validDays:1,serviceIds:[serviceId],allowShared:false}});planId=plan.id;
 // Only this newly seeded child; retain original hours and restore in afterAll.
 originalHours=await prisma.businessHours.findMany({where:{storeId:a.storeId}});
 await prisma.businessHours.updateMany({where:{storeId:a.storeId},data:{openTime:'00:00',closeTime:'23:59',slotInterval:15}});
});
let originalHours:Awaited<ReturnType<typeof prisma.businessHours.findMany>>=[];
afterEach(()=>vi.useRealTimers());
afterAll(async()=>{vi.useRealTimers();for(const h of originalHours)await prisma.businessHours.update({where:{id:h.id},data:{openTime:h.openTime,closeTime:h.closeTime,slotInterval:h.slotInterval}});await writeFile(out+'/results.json',JSON.stringify({runId,synthetic:true,realPostgres:true,controlledProcessDateOnly:true,results,passed:results.length===8&&results.every(r=>r.passed),limitations:['Domain services and app clock, not real browser/server wall-clock transition','Postgres NOW()/receipt createdAt remain real; no claim of real midnight revenue timestamp test','Original synthetic child hours restored; all financial history retained','Overnight services are rejected by current same-day operating periods']},null,2));await Promise.all([db.$disconnect(),prisma.$disconnect(),course.$disconnect()]);console.log(JSON.stringify({output:out,groups:results.length}));});
it('Taiwan day/month/year changes at UTC16:00, not UTC00:00',()=>{
 clock('2026-12-31T15:59:59.999Z');expect(toLocalDateStr()).toBe('2026-12-31');expect(toLocalMonthStr()).toBe('2026-12');
 clock('2026-12-31T16:00:00.000Z');expect(toLocalDateStr()).toBe('2027-01-01');expect(toLocalMonthStr()).toBe('2027-01');
 expect(dayRange('2026-12-31').end.toISOString()).toBe('2026-12-31T15:59:59.999Z');expect(monthRange('2027-01').start.toISOString()).toBe('2026-12-31T16:00:00.000Z');pass('台灣日／月／年在UTC16:00切換，共用查詢邊界正確');
});
it('issue before/after Taiwan midnight writes correct expiry and date-only cashbook day',async()=>{
 for(const [instant,day,expiry] of [['2026-12-31T15:59:59.999Z','2026-12-31','2027-01-01T15:59:59.999Z'],['2026-12-31T16:00:00.000Z','2027-01-01','2027-01-02T15:59:59.999Z']]){
  clock(instant);const issued=await run(tx=>issueCard(tx,a,{requestKey:randomUUID(),planId,customerId:fixture.childCustomerId,memberIds:[],paid:1000,method:'BANK_TRANSFER'}));
  const c=await db.beautyCard.findUniqueOrThrow({where:{id:issued.cardId}});expect(c.expiresAt.toISOString()).toBe(expiry);const sale=await db.beautyPayment.findFirstOrThrow({where:{cardId:c.id,kind:'SALE'}});const cash=await prisma.cashbookEntry.findUniqueOrThrow({where:{id:'beauty:'+sale.id}});expect(cash.entryDate.toISOString()).toBe(day+'T00:00:00.000Z');if(day==='2026-12-31')cardId=c.id;
 }pass('跨午夜售卡依台灣成交日計有效日及共用收支營業日，未混用UTC日期');
});
it('card validity includes its exact last millisecond and rejects the next millisecond',async()=>{
 const c=await db.beautyCard.findUniqueOrThrow({where:{id:cardId}});await expect(run(tx=>assertCard(tx,a,cardId,fixture.childCustomerId,serviceId,c.expiresAt))).resolves.toMatchObject({id:cardId});await expect(run(tx=>assertCard(tx,a,cardId,fixture.childCustomerId,serviceId,new Date(c.expiresAt.getTime()+1)))).rejects.toThrow(/不適用/);pass('方案到期最後1毫秒可用，下一毫秒拒絕');
});
it('last valid service day reserves, next day refuses without partial group or ledger',async()=>{
 clock('2026-12-31T00:00:00Z');const r=await run(tx=>reserveParty(tx,a,party('2027-01-01','09:00',cardId)));reservedId=r.ids[0];expect((await db.beautyCard.findUniqueOrThrow({where:{id:cardId}})).remaining).toBe(3);
 const groups=await db.beautyGroup.count({where:{storeId:a.storeId}}),ledgers=await db.beautyLedger.count({where:{storeId:a.storeId}});await expect(run(tx=>reserveParty(tx,a,party('2027-01-02','09:00',cardId)))).rejects.toThrow(/不適用/);expect(await db.beautyGroup.count({where:{storeId:a.storeId}})).toBe(groups);expect(await db.beautyLedger.count({where:{storeId:a.storeId}})).toBe(ledgers);pass('到期當天服務可預留、翌日拒絕且無殘留群組或扣次');
});
it('a service booked within validity can be completed after expiry and debits exactly once',async()=>{
 clock('2027-01-02T01:00:00Z');await run(tx=>transition(tx,a,{id:reservedId,revision:0,target:'COMPLETED',reason:'實際服務日有效，隔日補登'}));expect((await db.beautyCard.findUniqueOrThrow({where:{id:cardId}})).remaining).toBe(2);expect(await db.beautyLedger.count({where:{appointmentId:reservedId,delta:-1}})).toBe(1);await expect(run(tx=>transition(tx,a,{id:reservedId,revision:0,target:'COMPLETED',reason:'舊版本重送'}))).rejects.toThrow(/已更新/);pass('有效服務日預約可在過期後補登完成，只扣一次，舊版本拒絕');
});
it('today/past and lead-time boundaries use the process clock consistently',async()=>{
 clock('2027-01-03T01:00:00.000Z');const before=await db.beautyGroup.count({where:{storeId:a.storeId}});await expect(run(tx=>reserveParty(tx,a,party('2027-01-03','09:00')))).rejects.toThrow(/截止/);expect(await db.beautyGroup.count({where:{storeId:a.storeId}})).toBe(before);await expect(run(tx=>reserveParty(tx,a,party('2027-01-03','09:15')))).resolves.toHaveProperty('groupId');pass('等於現在的開始時間拒絕，下一個開放15分鐘時段可預約');
});
it('a full service plus optional buffer cannot overflow the same-day closing boundary',async()=>{
 clock('2027-01-04T00:00:00Z');const service=await db.beautyService.create({data:{storeId:a.storeId,name:'跨午夜拒絕-'+runId,duration:60,buffer:15,price:1000}});await db.beautyTechnician.update({where:{id:techId},data:{serviceIds:{push:service.id},rates:{[serviceId]:{mode:'FIXED',value:100},[service.id]:{mode:'FIXED',value:100}}}});const d=party('2027-01-04','23:30');d.people[0].serviceId=service.id;const before=await db.beautyGroup.count({where:{storeId:a.storeId}});await expect(run(tx=>reserveParty(tx,a,d))).rejects.toThrow(/全部同行者|未開放/);expect(await db.beautyGroup.count({where:{storeId:a.storeId}})).toBe(before);pass('完整服務加整理時間超過當日營業結束時拒絕，不暗中跨日');
});
it('receipt cashbook uses actual collection day even for an earlier service date',async()=>{
 clock('2027-01-05T00:00:00Z');const r=await run(tx=>reserveParty(tx,a,party('2027-01-05','10:00')));clock('2027-01-05T16:00:00Z');await run(tx=>collect(tx,a,{requestKey:randomUUID(),ids:r.ids,amounts:[1000],method:'BANK_TRANSFER',note:'跨日補收-'+runId}));const sale=await db.beautyPayment.findFirstOrThrow({where:{appointmentId:r.ids[0],kind:'SALE'}}),cash=await prisma.cashbookEntry.findUniqueOrThrow({where:{id:'beauty:'+sale.id}});expect(cash.entryDate.toISOString()).toBe('2027-01-06T00:00:00.000Z');expect(toLocalDateStr((await db.beautyAppointment.findUniqueOrThrow({where:{id:r.ids[0]}})).startsAt)).toBe('2027-01-05');expect(parseTaipeiDateTime('2027-01-06','00:00')?.toISOString()).toBe('2027-01-05T16:00:00.000Z');pass('跨午夜補收沿實際台灣收款日記共用收支，服務日期維持原日');
});
