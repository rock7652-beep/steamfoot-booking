import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),read:vi.fn(),transaction:vi.fn(),feature:vi.fn(),customer:vi.fn(),raw:vi.fn(),execute:vi.fn(),audit:vi.fn(),limits:vi.fn(),hours:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseManagerRead:m.read,courseTransaction:m.transaction}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature,getStoreLimitsByStoreId:m.limits}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.customer},$transaction:vi.fn()}}));
vi.mock("@/server/services/course-business-hours",()=>({assertCourseSessionsFitHours:m.hours}));
import {saveRentalPayment,saveCourseRental,cancelCourseRental,searchRentalCustomers} from "@/server/actions/course-rental";
const key="f34a8337-9380-4bc4-b218-c450bb3c7aca";
let rental:Record<string,unknown>,receipt:Record<string,unknown>|null,tx:ReturnType<typeof makeTx>;
function makeTx(){return {$queryRaw:m.raw,$executeRaw:m.execute,courseSession:{findFirst:vi.fn(async():Promise<Record<string,unknown>|null>=>null)},courseRoom:{findFirst:vi.fn(async()=>({id:"room",rentalHourlyRate:600,rentalBufferMinutes:10}))},courseRental:{findUnique:vi.fn(async():Promise<Record<string,unknown>|null>=>null),findFirst:vi.fn(async args=>args.where.occupiedStartsAt?null:rental),update:vi.fn(async()=>rental),create:vi.fn(async args=>({id:"r",...args.data}))},courseRentalPayment:{findUnique:vi.fn(async()=>receipt),update:vi.fn(),create:vi.fn(async args=>{receipt={id:"p",...args.data};return receipt;})}};}
beforeEach(()=>{
 vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"s",user:{id:"u",staffId:"staff"}});m.read.mockResolvedValue({storeId:"s"});m.feature.mockResolvedValue(true);m.raw.mockResolvedValue([]);
 rental={id:"r",storeId:"s",roomId:"room",revision:1,customerId:"customer",customerName:"學員",customerPhone:"0900000000",startsAt:new Date("2026-10-02T02:00:00Z"),endsAt:new Date("2026-10-02T03:00:00Z"),amount:600,cancelledAt:null,payments:[]};receipt=null;
 tx=makeTx();
 m.transaction.mockImplementation(async(_store,work)=>work(tx));
});
const payment=()=>({rentalId:"r",revision:1,requestKey:key,amount:600,paymentMethod:"CASH"});
it("collects other income once under the authorized store without touching attendance or cards",async()=>{
 expect((await saveRentalPayment({...payment(),storeId:"other"})).success).toBe(true);
 expect(m.manager).toHaveBeenCalledWith("cashbook.create");expect(m.transaction).toHaveBeenCalledWith("s",expect.any(Function));
 const writes=m.execute.mock.calls.filter(c=>c[0].join("").includes('"CashbookEntry"'));
 expect(writes).toHaveLength(1);expect(writes[0][0].join("")).toContain("'其他收入'");expect(writes[0]).toContain("course-rental:p");expect(writes[0]).toContain("INCOME");
 expect((await saveRentalPayment(payment())).success).toBe(true);expect(m.execute.mock.calls.filter(c=>c[0].join("").includes('"CashbookEntry"'))).toHaveLength(1);
});
it("refuses duplicate collection even with a fresh request key",async()=>{
 rental.payments=[{id:"old",amount:600,paymentMethod:"CASH"}];
 expect((await saveRentalPayment(payment())).success).toBe(false);expect(tx.courseRentalPayment.create).not.toHaveBeenCalled();
});
it("corrects by reversing the original payment and adding one replacement, retaining history",async()=>{
 rental.payments=[{id:"old",amount:600,paymentMethod:"CASH"}];
 expect((await saveRentalPayment({...payment(),originalId:"old",reason:"金額誤植",amount:550,paymentMethod:"OTHER"})).success).toBe(true);
 expect(m.manager).toHaveBeenCalledWith("transaction.void");expect(tx.courseRentalPayment.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"VOIDED"})}));
 const writes=m.execute.mock.calls.filter(c=>c[0].join("").includes('"CashbookEntry"'));expect(writes).toHaveLength(2);expect(writes[0]).toContain("EXPENSE");expect(writes[0]).toContain(600);expect(writes[1]).toContain("INCOME");expect(writes[1]).toContain(550);
});
it("rejects corrections without void permission before opening the transaction",async()=>{
 m.manager.mockImplementation(async p=>{if(p==="transaction.void")throw new Error("denied");return {storeId:"s",user:{id:"u"}};});
 expect((await saveRentalPayment({...payment(),originalId:"old",reason:"更正"})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it("cancellation keeps payment and allows a separate void without a second income",async()=>{
 rental.payments=[{id:"old",amount:600,paymentMethod:"CASH"}];
 expect((await cancelCourseRental({id:"r",revision:1})).success).toBe(true);expect(tx.courseRentalPayment.update).not.toHaveBeenCalled();
 rental.cancelledAt=new Date();expect((await saveRentalPayment(payment())).success).toBe(false);
 expect((await saveRentalPayment({...payment(),originalId:"old",reason:"取消退款",voidOnly:true})).success).toBe(true);
 const writes=m.execute.mock.calls.filter(c=>c[0].join("").includes('"CashbookEntry"'));expect(writes).toHaveLength(1);expect(writes[0]).toContain("EXPENSE");
});
it("rejects stale edits and closed cash drawers",async()=>{
 expect((await saveRentalPayment({...payment(),revision:9})).success).toBe(false);expect(tx.courseRentalPayment.create).not.toHaveBeenCalled();
 m.raw.mockResolvedValue([{status:"CLOSED"}]);expect((await saveRentalPayment(payment())).success).toBe(false);expect(m.execute).not.toHaveBeenCalled();
});
it("checks rental and class collisions including buffers, preserves quote and retry",async()=>{
 const input={requestKey:key,roomId:"room",customerId:null,customerName:"租借人",customerPhone:"0900000000",date:"2026-10-02",time:"10:00",durationMinutes:60,amount:600};
 tx.courseSession.findFirst.mockResolvedValue({id:"occupied"});expect((await saveCourseRental(input)).success).toBe(false);expect(tx.courseRental.create).not.toHaveBeenCalled();
 tx.courseSession.findFirst.mockResolvedValue(null);expect((await saveCourseRental(input)).success).toBe(true);expect(tx.courseRental.create.mock.calls[0][0].data).toMatchObject({storeId:"s",amount:600,hourlyRateSnapshot:600,occupiedStartsAt:new Date("2026-10-02T01:50:00Z"),occupiedEndsAt:new Date("2026-10-02T03:10:00Z")});
 tx.courseRental.findUnique.mockResolvedValue({...rental,requestKey:key,customerId:null,customerName:"租借人",note:""});expect((await saveCourseRental(input)).success).toBe(true);expect(tx.courseRental.create).toHaveBeenCalledTimes(1);
 expect((await saveCourseRental({...input,amount:999})).success).toBe(false);
});
it("search scopes customers to the authorized store and merged accounts are excluded",async()=>{
 m.customer.mockResolvedValue([]);await searchRentalCustomers("0900");expect(m.read).toHaveBeenCalledWith("customer.read");expect(m.customer.mock.calls[0][0].where).toMatchObject({storeId:"s",mergedIntoCustomerId:null});
});

const rentalInput=()=>({requestKey:key,roomId:"room",customerId:null,customerName:"租借人",customerPhone:"0900000000",date:"2026-10-02",time:"10:00",durationMinutes:60,amount:600,payment:{amount:550,paymentMethod:"OTHER"}});
it("creates rental and collection in one transaction, with exact retry protection",async()=>{
 const input=rentalInput();expect((await saveCourseRental(input)).success).toBe(true);
 expect(m.transaction).toHaveBeenCalledTimes(1);expect(m.manager).toHaveBeenCalledWith("cashbook.create");
 expect(tx.courseRentalPayment.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({rentalId:"r",amount:550,paymentMethod:"OTHER",requestKey:key})}));
 const writes=m.execute.mock.calls.filter(c=>c[0].join("").includes('"CashbookEntry"'));expect(writes).toHaveLength(1);expect(writes[0]).toContain(550);
 tx.courseRental.findUnique.mockResolvedValue({...rental,customerId:null,customerName:"租借人",note:""});
 expect((await saveCourseRental(input)).success).toBe(true);expect(tx.courseRentalPayment.create).toHaveBeenCalledTimes(1);
 expect((await saveCourseRental({...input,payment:{amount:999,paymentMethod:"OTHER"}})).success).toBe(false);
 expect((await saveCourseRental({...input,payment:undefined})).success).toBe(false);
});
it("validates inline payment and its permission before creating a rental",async()=>{
 expect((await saveCourseRental({...rentalInput(),payment:{amount:600,paymentMethod:""}})).success).toBe(false);
 expect(m.transaction).not.toHaveBeenCalled();
 m.manager.mockImplementation(async p=>{if(p==="cashbook.create")throw new Error("denied");return {storeId:"s",user:{id:"u"}};});
 expect((await saveCourseRental(rentalInput())).success).toBe(false);expect(tx.courseRental.create).not.toHaveBeenCalled();
});
it("rolls back the new rental and receipt when the cash ledger rejects collection",async()=>{
 const committed:unknown[]=[];
 m.transaction.mockImplementation(async(_store,work)=>{const pending:unknown[]=[];tx.courseRental.create.mockImplementation(async args=>{pending.push(args.data);return {id:"r",...args.data};});tx.courseRentalPayment.create.mockImplementation(async args=>{pending.push(args.data);return {id:"p",...args.data};});const value=await work(tx);committed.push(...pending);return value;});
 m.raw.mockResolvedValue([{status:"CLOSED"}]);
 expect((await saveCourseRental({...rentalInput(),payment:{amount:600,paymentMethod:"CASH"}})).success).toBe(false);
 expect(committed).toHaveLength(0);expect(m.execute.mock.calls.filter(c=>c[0].join("").includes('"CashbookEntry"'))).toHaveLength(0);
});
