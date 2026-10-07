import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({bookings:vi.fn(),absences:vi.fn(),people:vi.fn(),purchases:vi.fn(),cards:vi.fn(),leaveCounts:vi.fn(),sessionCount:vi.fn(),transaction:vi.fn(),query:vi.fn(),openingCards:vi.fn(),purchaseCount:vi.fn()}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{findMany:(q:{where:{sessionId?:string}})=>q.where.sessionId?m.bookings(q):m.absences(q),groupBy:m.leaveCounts},courseSession:{count:m.sessionCount},coursePurchase:{findMany:m.purchases},coursePointCard:{findMany:m.cards}}}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.people}}}));
vi.mock("@/server/services/course-access",()=>({courseTransaction:m.transaction}));
import {getCourseRoster,getCourseCards} from "@/server/queries/course-members";
import {getCourseBalanceSummary} from "@/server/queries/course-balance-summary";
import {readTeacherFeeSeats,capturedTeacherFee} from "@/server/services/course-teacher-fee";
import {checkCourseAccounts} from "@/server/reconciliation/course-checks";
import {syntheticOpeningBooking,syntheticOpeningRecord,syntheticOpeningCard,syntheticOpeningRow,syntheticOpeningScope} from "./fixtures/music-opening";
import type {Prisma} from "../../generated/course-client";
const store=syntheticOpeningScope.targetStoreId;
const rosterRow=()=>{const b=syntheticOpeningBooking();return {...b,card:{...b.card,bookings:[b]}};};
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
  vi.resetAllMocks();m.people.mockResolvedValue([]);m.purchases.mockResolvedValue([]);m.cards.mockResolvedValue([]);m.absences.mockResolvedValue([]);m.leaveCounts.mockResolvedValue([]);m.sessionCount.mockResolvedValue(0);m.purchaseCount.mockResolvedValue(0);
  m.transaction.mockImplementation(async(_store,work)=>work({$queryRaw:m.query,coursePointCard:{findMany:m.openingCards},coursePurchase:{count:m.purchaseCount}}));
});
describe("actual roster and balance reads",()=>{
  it("preserves the original third ordinal, hides closed prefix from unscheduled and keeps opening money separate",async()=>{
    m.bookings.mockResolvedValue([rosterRow()]);const [result]=await getCourseRoster(store,"synthetic-session");
    expect(result).toMatchObject({termNumber:7,termIndex:3,termCount:4,termClosedBeforeCutoff:2,termUnscheduledOrdinals:[4],openingTuition:{paid:2000,receivable:1200},termPayment:null,nextTerm:null});
    expect(result.termLessons).toEqual([{ordinal:3,date:"2026-10-01T02:00:00.000Z",status:"待上課"}]);
    expect(JSON.stringify(result)).not.toMatch(/sourceKey|contentHash|sourceRecordKey|synthetic-source-lesson/);
  });
  it("does not re-number when input bookings arrive in reverse date order",async()=>{
    const row=rosterRow();const fourth={...row.card.bookings[0],id:"fourth",musicOpeningSourceLessonKey:"source-4",musicOpeningLessonOrdinal:4,session:{...row.session,startsAt:new Date("2026-10-15T02:00:00Z")}};
    row.card.bookings=[fourth,...row.card.bookings];m.bookings.mockResolvedValue([row]);const [result]=await getCourseRoster(store,"synthetic-session");
    expect(result.termLessons.map(lesson=>lesson.ordinal)).toEqual([3,4]);expect(result.termIndex).toBe(3);expect(result.termUnscheduledOrdinals).toEqual([]);
  });
  it.each(["missing","duplicate","damaged"])("blocks %s source mapping without catalogue fallback",async mode=>{
    const row=rosterRow();
    if(mode==="missing")row.musicOpeningSourceLessonKey="";
    if(mode==="duplicate")row.card.bookings.push({...row.card.bookings[0],id:"duplicate"});
    if(mode==="damaged")row.card.musicOpeningState.contentHash="0".repeat(64);
    m.bookings.mockResolvedValue([row]);const [result]=await getCourseRoster(store,"synthetic-session");
    expect(result.termIndex).toBeNull();expect(result.termCount).toBe(0);expect(result.available).toBe(0);expect(result.openingIssue).toBeTruthy();
  });
  it("retains known source ordinals while unresolved opening holds block availability",async()=>{
    const record=syntheticOpeningRecord();record.balance.reservedAtCutoff=1;
    const b=syntheticOpeningBooking();const row={...b,card:{...syntheticOpeningCard(record),bookings:[b]}};
    m.bookings.mockResolvedValue([row]);const [result]=await getCourseRoster(store,"synthetic-session");
    expect(result.termIndex).toBe(3);expect(result.available).toBe(0);expect(result.openingIssue).toContain("來源連結");
  });
  it("card list and all-card summary share the live held count without adding opening holds twice",async()=>{
    const row=rosterRow();m.cards.mockResolvedValue([row.card]);
    const [card]=await getCourseCards(store,"synthetic-student");expect(card).toMatchObject({remaining:2,held:1,available:1,openingImported:true});
    expect(await getCourseBalanceSummary(store,"synthetic-student",true)).toEqual([{unit:"SESSION",count:1,remaining:2,held:1,available:1}]);
    expect(m.cards.mock.calls.at(-1)?.[0].where).toMatchObject({storeId:store,unit:"SESSION",members:{some:{customerId:"synthetic-student"}}});
  });
  it("card list preserves unknown original expiry instead of showing the target sentinel",async()=>{
    const record={...syntheticOpeningRecord(),activatedAt:null,expiresAt:null};const card={...syntheticOpeningCard(record),bookings:[]};m.cards.mockResolvedValue([card]);
    const [result]=await getCourseCards(store,"synthetic-student");expect(result.expiresAt).toBeNull();expect(result.musicActivatedAt).toBeNull();expect(result.available).toBe(0);expect(result.openingIssue).toContain("未確認");
  });
  it("shows original expiry and blocks a corrupted live date instead of exposing 2099 as valid",async()=>{
    const row=rosterRow();row.card.expiresAt=new Date("2099-01-01");m.bookings.mockResolvedValue([row]);
    const [result]=await getCourseRoster(store,"synthetic-session");expect(result.expiresAt).toBe("2026-11-30T15:59:59.999Z");expect(result.available).toBe(0);
  });
});
function feeRow(){const b=syntheticOpeningBooking("ATTENDED");return {...b,sessionId:b.sessionId,cardUnit:"SESSION",musicOpeningStateRequired:true,musicOpeningState:syntheticOpeningRow(syntheticOpeningRecord(),"MUSIC_V2_ORIGINAL_PRICE"),memberCustomerIds:[b.customerId],startsAt:b.session.startsAt,musicActivatedAt:b.card.musicActivatedAt,expiresAt:b.card.expiresAt,purchaseCount:BigInt(0),listPrice:null,points:null,musicBonusLessons:null};}
describe("actual teacher-fee source read",()=>{
  it("uses verified original 800 without manufacturing a confirmed purchase",async()=>{
    m.query.mockResolvedValue([feeRow()]);const grouped=await readTeacherFeeSeats({$queryRaw:m.query} as unknown as Pick<Prisma.TransactionClient,"$queryRaw">,store,["synthetic-session"]);
    const seats=grouped.get("synthetic-session")!;expect(seats[0]).toMatchObject({originalUnitPrice:800,openingPriceSource:true,openingIssue:null});
    expect(capturedTeacherFee({rule:{mode:"SHARE",value:60,calculationVersion:2},revision:1},seats).amount).toBe(480);
    expect(JSON.stringify(seats)).not.toMatch(/sourceKey|snapshot|sourceLessonKey/);
  });
  it.each(["policy","price","customer","hybrid"])("blocks %s instead of guessing payroll or zero",async mode=>{
    const row=feeRow();if(mode==="policy")row.musicOpeningState.teacherFeePolicy="UNVERIFIED";
    if(mode==="price"){const record={...syntheticOpeningRecord(),originalUnitPrice:null};row.musicOpeningState=syntheticOpeningRow(record,"MUSIC_V2_ORIGINAL_PRICE");}
    if(mode==="customer")row.customerId="different";
    if(mode==="hybrid")row.purchaseCount=BigInt(1);
    m.query.mockResolvedValue([row]);const seats=(await readTeacherFeeSeats({$queryRaw:m.query} as unknown as Pick<Prisma.TransactionClient,"$queryRaw">,store,[row.sessionId])).get(row.sessionId)!;
    expect(seats[0].originalUnitPrice).toBeNull();expect(seats[0].openingIssue).toBeTruthy();
    expect(capturedTeacherFee({rule:{mode:"CLASS",value:500,calculationVersion:2},revision:1},seats).amount).toBeNull();
  });
  it("keeps non-imported trials and original purchase pricing unchanged",async()=>{
    const row={...feeRow(),musicOpeningStateRequired:false,musicOpeningState:null,musicOpeningTermKey:null,musicOpeningLessonOrdinal:null,musicOpeningSourceLessonKey:null,bookingKind:"TRIAL",trialPrice:500};m.query.mockResolvedValue([row]);
    const seats=(await readTeacherFeeSeats({$queryRaw:m.query} as unknown as Pick<Prisma.TransactionClient,"$queryRaw">,store,[row.sessionId])).get(row.sessionId)!;
    expect(seats[0].originalUnitPrice).toBe(500);expect(seats[0]).not.toHaveProperty("openingPriceSource");
  });
  it("blocks source identity on an otherwise native fee row",async()=>{
    const row={...feeRow(),musicOpeningStateRequired:false,musicOpeningState:null,purchaseCount:BigInt(1),listPrice:3200,points:4};m.query.mockResolvedValue([row]);
    const seats=(await readTeacherFeeSeats({$queryRaw:m.query} as unknown as Pick<Prisma.TransactionClient,"$queryRaw">,store,[row.sessionId])).get(row.sessionId)!;
    expect(seats[0].originalUnitPrice).toBeNull();expect(seats[0].openingIssue).toContain("原生方案");
  });
  it("does not run an unverified old-version fee calculation on imported seats",()=>{
    const seats=[{id:"s",customerName:"Synthetic",status:"ATTENDED",bookingKind:"CARD",absenceKind:null,originalUnitPrice:800,openingPriceSource:true,openingIssue:null}];
    expect(capturedTeacherFee({rule:{mode:"SHARE",value:60},revision:1,musicPricePerLesson:1000},seats).amount).toBeNull();
    expect(capturedTeacherFee({rule:{mode:"SHARE",value:60},revision:1,teacherAttendance:"LEAVE"},seats).amount).toBe(0);
  });
});
describe("opening-specific reconciliation",()=>{
  it.each(["ATTENDED","NO_SHOW","GROUP_LEAVE_FORFEITED"])("uses opening remaining minus %s, without a synthetic GRANT",async status=>{
    const b=syntheticOpeningBooking(status==="GROUP_LEAVE_FORFEITED"?"CANCELLED":status);if(status==="GROUP_LEAVE_FORFEITED"){b.absenceKind=status;b.card.remaining=1;}
    m.openingCards.mockResolvedValue([{...b.card,bookings:[b],entries:[]}]);m.query.mockResolvedValue([]);
    const result=await checkCourseAccounts(store);expect(result).toEqual([expect.objectContaining({checkCode:"course_opening_balance",status:"pass"})]);
  });
  it("flags mismatched credit, fake purchase and missing state rather than fixing the numbers",async()=>{
    for(const mode of ["balance","purchase","missing"]) {
      const b=syntheticOpeningBooking("ATTENDED");const card={...b.card,bookings:[b],entries:[]};
      if(mode==="balance")card.remaining=2;
      m.openingCards.mockResolvedValue([{...card,...(mode==="missing"?{musicOpeningState:null}:{})}]);m.purchaseCount.mockResolvedValue(mode==="purchase"?1:0);m.query.mockResolvedValue([]);
      expect((await checkCourseAccounts(store))[0].status).toBe("mismatch");
    }
  });
});
