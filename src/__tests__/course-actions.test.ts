import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schedulingRule: vi.fn(),
  quote:vi.fn(),execute:vi.fn(),reserve:vi.fn(),
  bookings: vi.fn(),
  permission: vi.fn(),
  store: vi.fn(),
  module: vi.fn(),
  raw: vi.fn(),
  existing: vi.fn(),
  conflict: vi.fn(),
  template: vi.fn(),
  room: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  cancelForMove: vi.fn(),
  catalogUpdate: vi.fn(),
  revalidate: vi.fn(),
  planName: vi.fn(),
}));
vi.mock("@/server/services/course-charge",()=>({resolveScheduleCharge:mocks.quote}));
vi.mock("@/lib/shop-config",()=>({getTrialSettings:async()=>({trialEnabled:true,trialDefaultPrice:499,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000000}),clampTrialTotal:(price:number|undefined)=>price??499}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:async()=>({maxCustomers:null,maxMonthlyBookings:null})}));
vi.mock("@/server/services/music-teaching-item",()=>({readTeachingTrialPrice:async()=>null,ensureMusicTeachingItem:async()=>{}}));
vi.mock("@/server/services/course-booking",()=>({reserveCourseInTransaction:mocks.reserve}));
vi.mock("@/lib/sports-staging", () => ({ requireSportsStaging: vi.fn(), sportsStagingEnabled: () => false }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findFirst: async () => ({ id: "fitness" }) } } }));
vi.mock("@/server/services/sports-staging-schedule", () => ({ attachSportsSessionRules: vi.fn(),readSportsSessionRule:vi.fn() }));
vi.mock("@/server/services/course-access", () => ({
  courseTransaction: async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => {
    const {coursePrisma} = await import("@/lib/course-db");
    return coursePrisma.$transaction(work as never);
  },
  courseManager: async (permission: string) => {
    const user = await mocks.permission(permission);
    const storeId = await mocks.store(user);
    await mocks.module(storeId);
    return { user, storeId };
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission,isOwner:(role:string)=>["OWNER","ADMIN"].includes(role),isNonOwnerStaff:(role:string)=>["STAFF","MANAGER"].includes(role) }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: mocks.store }));
vi.mock("@/lib/industry-module-server", () => ({
  requireCourseStore: mocks.module,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/course-db", () => ({
  coursePrisma: {
    courseTemplate:{findFirst:mocks.template,findMany:async()=>[]},
    coursePointPlan:{findMany:async()=>[]},
    courseSession: { findFirst: async()=>({id:"session-created"}), findMany:async()=>[] },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: mocks.raw,
        $executeRaw:mocks.execute,
        courseSession: {
          findMany: mocks.existing,
          findFirst: mocks.conflict,
          createMany: mocks.create,
          update: mocks.update,
          updateMany: mocks.cancelForMove,
        },
        courseRental:{findFirst:async()=>null},
        courseScheduleSeries: {findMany:async()=>[],findUnique:async()=>null},
        courseBookingRule: {findUnique:mocks.schedulingRule},
        courseSessionMove: { create: mocks.move },
        courseBooking: { findMany: mocks.bookings },
        courseTemplate: {
          findFirst: mocks.template,
          updateMany: mocks.catalogUpdate,
        },
        courseRoom: { findFirst: mocks.room, updateMany: mocks.catalogUpdate },
        coursePointPlan: { findFirst: mocks.planName,findMany:async()=>[] },
      }),
  },
}));
import {
  createCourseSchedule,
  updateCourseSession,
  setCourseCatalogStatus,
  updateCourseRoom,
  moveCourseSessions,
} from "@/server/actions/course";
import { AppError } from "@/lib/errors";
const input = {
  templateId: "yoga",
  roomId: "room-a",
  coachId: "coach-a",
  date: "2026-09-22",
  time: "18:00",
  durationMinutes: 60,
  capacity: 10,
  repeatUntil: "2026-10-06",
  requestKey: "cbd7b9ea-0638-4046-a1b4-11360f2cc955",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.quote.mockResolvedValue(null);
  mocks.schedulingRule.mockResolvedValue(null);
  mocks.bookings.mockResolvedValue([]);
  mocks.permission.mockResolvedValue({ id: "owner-a" });
  mocks.store.mockResolvedValue("store-a");
  mocks.module.mockResolvedValue(undefined);
  mocks.raw.mockImplementation(async (sql: TemplateStringsArray) => /BusinessHours|SpecialBusinessDay|StoreFeatureEntitlement|CourseStaffAvailability/.test(sql.join("")) ? [] : [{ id: "valid",courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:["yoga"] }]);
  mocks.existing.mockResolvedValue([]);
  mocks.conflict.mockResolvedValue(null);
  mocks.template.mockResolvedValue({ id: "yoga", name: "瑜珈", pointCost: 2,isActive:true,visibility:"PUBLIC" });
  mocks.room.mockResolvedValue({ id: "room-a",capacity:null });
  mocks.create.mockResolvedValue({ count: 3 });
});
describe("restoring a moved lesson", () => {
  const restore = {id:"moved",scope:"SINGLE",date:"2026-10-01",time:"10:00",roomId:"room-a",coachId:"coach-a",restore:true};
  const session = {
    id:"moved",storeId:"store-a",templateId:"yoga",roomId:"room-a",coachId:"coach-a",capacity:1,
    startsAt:new Date("2026-10-02T02:00:00Z"),endsAt:new Date("2026-10-02T03:00:00Z"),
    rescheduledFromStartsAt:new Date("2026-10-01T02:00:00Z"),rescheduledFromEndsAt:new Date("2026-10-01T03:00:00Z"),
    rescheduledFromRoomId:"room-a",rescheduledFromCoachId:"coach-a",bookings:[],
  };
  it("restores an unstarted lesson without rewriting compensation fields", async () => {
    mocks.conflict.mockResolvedValueOnce(session);
    expect(await moveCourseSessions(restore)).toMatchObject({success:true,data:{count:1}});
    const data=mocks.update.mock.calls[0][0].data;
    expect(data.startsAt).toEqual(session.rescheduledFromStartsAt);
    expect(data.rescheduledFromStartsAt).toBeNull();
    expect(data).not.toHaveProperty("compensationSnapshot");
    expect(mocks.move).toHaveBeenCalledTimes(1);
  });
  it.each(["snapshot","identity"])("explains the database's started-course %s refusal without retrying", async (kind) => {
    mocks.conflict.mockResolvedValueOnce(session);
    mocks.update.mockRejectedValueOnce(new Error(`ConnectorError: Cannot change compensation ${kind} of a started course`));
    expect(await moveCourseSessions(restore)).toMatchObject({success:false,error:"課程已開始，為保留鐘點費紀錄，無法變更上課時間或老師（包含恢復原時段）。"});
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects an attended lesson before any move writes", async () => {
    mocks.conflict.mockResolvedValueOnce({...session,bookings:[{status:"ATTENDED",card:null}]});
    expect(await moveCourseSessions(restore)).toMatchObject({success:false,error:"已完成的課程不可調整"});
    expect(mocks.cancelForMove).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
describe("room capacity changes", () => {
  const room = {id:"room-a",name:"教室",capacity:5};
  it("does not force unrelated legacy capacity repair while editing metadata", async () => {
    mocks.room.mockResolvedValue({capacity:5});
    mocks.catalogUpdate.mockResolvedValue({count:1});
    expect(await updateCourseRoom({...room,equipment:"瑜珈墊"})).toEqual({success:true});
    expect(mocks.existing).not.toHaveBeenCalled();
  });
  it("blocks a lower capacity when a live session still has a higher limit", async () => {
    mocks.room.mockResolvedValue({capacity:6});
    mocks.existing.mockResolvedValue([{id:"live",nameSnapshot:"課程",startsAt:new Date(),capacity:6}]);
    expect(await updateCourseRoom(room)).toMatchObject({success:false,conflicts:[{id:"live"}]});
    expect(mocks.catalogUpdate).not.toHaveBeenCalled();
  });
});
describe("fixed-slot and temporary moves", () => {
  const source = {
    id:"source",storeId:"store-a",requestKey:"series",templateId:"yoga",roomId:"room-a",coachId:"coach-a",capacity:1,
    startsAt:new Date("2070-10-01T02:00:00Z"),endsAt:new Date("2070-10-01T03:00:00Z"),bookings:[],
    rescheduledFromStartsAt:new Date("2070-09-30T02:00:00Z"),rescheduledFromEndsAt:new Date("2070-09-30T03:00:00Z"),
    rescheduledFromRoomId:"original-room",rescheduledFromCoachId:"original-coach",
  };
  it("changes the permanent series without writing FUTURE into the temporary-move constraint", async () => {
    const next={...source,id:"next",startsAt:new Date("2070-10-08T02:00:00Z"),endsAt:new Date("2070-10-08T03:00:00Z")};
    mocks.conflict.mockResolvedValueOnce(source);
    mocks.existing.mockResolvedValueOnce([source,next]);
    mocks.update.mockImplementation(async ({data}) => {
      if(data.rescheduleKind && !["SINGLE","WEEKS"].includes(data.rescheduleKind)) throw new Error("CourseSession_reschedule_kind_check");
      return {};
    });
    expect(await moveCourseSessions({id:source.id,scope:"FUTURE",date:"2070-10-01",time:"11:00",roomId:"room-a",coachId:"coach-a"})).toMatchObject({success:true,data:{count:2}});
    expect(mocks.update).toHaveBeenCalledTimes(2);
    for(const [{data}] of mocks.update.mock.calls) {
      expect(data).toMatchObject({rescheduleKind:null,rescheduledFromStartsAt:null,rescheduledFromEndsAt:null,rescheduledFromRoomId:null,rescheduledFromCoachId:null,rescheduledAt:null,rescheduledById:null});
      expect(data).not.toHaveProperty("compensationSnapshot");
    }
    expect(mocks.move.mock.calls.map(([{data}])=>data.scope)).toEqual(["FUTURE","FUTURE"]);
  });
  it.each(["SINGLE","WEEKS"])("preserves the original slot for a temporary %s move", async scope => {
    mocks.conflict.mockResolvedValueOnce(source);
    mocks.existing.mockResolvedValueOnce([source]);
    expect(await moveCourseSessions({id:source.id,scope,weeks:scope==="WEEKS"?2:undefined,date:"2070-10-01",time:"11:00",roomId:"room-a",coachId:"coach-a"})).toMatchObject({success:true});
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({rescheduleKind:scope,rescheduledFromStartsAt:source.rescheduledFromStartsAt,rescheduledFromRoomId:"original-room"});
  });
});

describe("course editing", () => {
  const edit = {
    ...input,
    id: "session-a",
    nameSnapshot: "新課名",
    pointCost: 3,
    capacity: 12,
  };
  it("updates only the selected store session and excludes itself from conflicts", async () => {
    mocks.conflict
      .mockResolvedValueOnce({ id: "session-a" })
      .mockResolvedValueOnce(null);
    expect(await updateCourseSession(edit)).toEqual({ success: true });
    expect(mocks.permission).toHaveBeenCalledWith("booking.update");
    expect(mocks.conflict.mock.calls[1][0].where).toMatchObject({
      storeId: "store-a",
      id: { not: "session-a" },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-a", storeId: "store-a" },
        data: expect.objectContaining({
          capacity: 12,
          nameSnapshot: "新課名",
          pointCost: 3,
        }),
      }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves the original session when a new time conflicts", async () => {
    mocks.conflict
      .mockResolvedValueOnce({ id: "session-a" })
      .mockResolvedValueOnce({
        startsAt: new Date("2026-09-22T10:00:00Z"),
        roomId: "room-a",
      });
    expect(await updateCourseSession(edit)).toMatchObject({
      success: false,
      error: expect.stringContaining("尚未儲存修改"),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("preserves completed attendance history and card expiry on rescheduling", async () => {
    mocks.conflict.mockResolvedValue({ id: "session-a", pointCost: 3 });
    mocks.bookings.mockResolvedValue([
      { status: "ATTENDED", card: { expiresAt: new Date("2027-01-01") } },
    ]);
    expect(await updateCourseSession(edit)).toMatchObject({
      success: false,
      error: expect.stringContaining("已完成點名"),
    });
    mocks.bookings.mockResolvedValue([
      { status: "RESERVED", card: { expiresAt: new Date("2026-09-21") } },
    ]);
    expect(await updateCourseSession(edit)).toMatchObject({
      success: false,
      error: expect.stringContaining("方案期限"),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects foreign sessions and invalid capacity", async () => {
    expect(await updateCourseSession(edit)).toMatchObject({ success: false });
    expect(await updateCourseSession({ ...edit, capacity: 0 })).toMatchObject({
      success: false,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
describe("course scheduling action", () => {
  it("names open enrollment after the teaching item instead of a pricing package", async () => {
    mocks.template.mockResolvedValue({ id:"yoga",name:"重量訓練 · abcdef",pointCost:2,isActive:true,visibility:"PUBLIC" });
    mocks.planName.mockResolvedValue({ name:"5次" });
    const result = await createCourseSchedule({ ...input, repeatUntil:undefined, sportsStaging:{frequency:"SINGLE",enrollment:"OPEN",planId:null,students:[],trialPrice:0} });
    expect(result).toMatchObject({success:true});
    expect(mocks.create.mock.calls[0][0].data[0].nameSnapshot).toBe("重量訓練");
    expect(mocks.planName).not.toHaveBeenCalled();
  });
  it("derives store and cost on the server, and writes one batch", async () => {
    const result = await createCourseSchedule({
      ...input,
      storeId: "victim",
      pointCost: 0,
    });
    expect(result).toMatchObject({ success: true, data: { count: 3, sessionId: "session-created" } });
    const rows = mocks.create.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(
      rows.every(
        (r: { storeId: string; pointCost: number }) =>
          r.storeId === "store-a" && r.pointCost === 2,
      ),
    ).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("booking.create");
  });
  it("persists the chosen audience for every occurrence and rejects unknown modes",async()=>{
    expect(await createCourseSchedule({...input,bookingAudience:"ASSIGNED"})).toMatchObject({success:true});
    expect(mocks.create.mock.calls[0][0].data.every((s:{bookingAudience:string})=>s.bookingAudience==="ASSIGNED")).toBe(true);
    mocks.create.mockClear();
    expect(await createCourseSchedule({...input,bookingAudience:"INVALID"})).toMatchObject({success:false});
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not write any occurrence if a later week conflicts", async () => {
    mocks.conflict.mockResolvedValue({
      startsAt: new Date("2026-09-29T10:00:00Z"),
      roomId: "room-a",
    });
    const result = await createCourseSchedule(input);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("2026-09-29"),
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects foreign-store or inactive references before writes", async () => {
    mocks.room.mockResolvedValue(null);
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns the original batch for a network retry, without a second write", async () => {
    const { buildCourseOccurrences } = await import("@/lib/course-scheduling");
    mocks.existing.mockResolvedValue(
      buildCourseOccurrences(input).map((range) => ({
        ...range,
        ...input,
        createdById: "owner-a",
        bookingAudience: "OPEN",
        isTrial: false,
      })),
    );
    expect(await createCourseSchedule(input)).toMatchObject({
      success: true,
      data: { count: 3, sessionId: "session-created" },
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      await createCourseSchedule({ ...input, bookingAudience: "ASSIGNED" }),
    ).toMatchObject({ success: false });
  });
  it("blocks writes when store access or module authorization fails", async () => {
    mocks.store.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "不可寫入其他店家"),
    );
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    mocks.module.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "此功能僅適用於課程門市"),
    );
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.raw).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("copy course schedule", () => {
  it("copies the selected session snapshot instead of changed template defaults", async () => {
    mocks.conflict
      .mockResolvedValueOnce({
        id: "source",
        templateId: "yoga",
        nameSnapshot: "單堂調整名稱",
        pointCost: 4,
      })
      .mockResolvedValueOnce(null);
    expect(
      await createCourseSchedule({ ...input, sourceSessionId: "source" }),
    ).toMatchObject({ success: true });
    expect(mocks.create.mock.calls[0][0].data[0]).toMatchObject({
      nameSnapshot: "單堂調整名稱",
      pointCost: 4,
    });
  });
  it("refuses a missing or foreign source before creating copies", async () => {
    expect(
      await createCourseSchedule({ ...input, sourceSessionId: "foreign" }),
    ).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("catalogue availability", () => {
  it("changes only a record in the authorized course store and preserves sessions", async () => {
    mocks.catalogUpdate.mockResolvedValue({ count: 1 });
    expect(
      await setCourseCatalogStatus({
        kind: "template",
        id: "yoga",
        isActive: false,
        storeId: "foreign",
      }),
    ).toEqual({ success: true });
    expect(mocks.permission).toHaveBeenCalledWith("booking.update");
    expect(mocks.catalogUpdate).toHaveBeenCalledWith({
      where: { id: "yoga", storeId: "store-a" },
      data: { isActive: false,visibility:"OFF" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      await setCourseCatalogStatus({
        kind: "template",
        id: "yoga",
        isActive: true,
      }),
    ).toEqual({ success: true });
  });
  it("rejects foreign records and unauthorized changes", async () => {
    mocks.catalogUpdate.mockResolvedValue({ count: 0 });
    expect(
      await setCourseCatalogStatus({
        kind: "room",
        id: "foreign",
        isActive: false,
      }),
    ).toMatchObject({ success: false });
    mocks.catalogUpdate.mockClear();
    mocks.permission.mockRejectedValue(
      new AppError("FORBIDDEN", "no permission"),
    );
    expect(
      await setCourseCatalogStatus({ kind: "room", id: "a", isActive: false }),
    ).toMatchObject({ success: false });
    expect(mocks.catalogUpdate).not.toHaveBeenCalled();
  });
  it("does not schedule an unpublished template or hidden room", async () => {
    mocks.template.mockResolvedValue(null);
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.template).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "yoga", storeId: "store-a", isActive: true },
      }),
    );
    mocks.template.mockResolvedValue({
      id: "yoga",
      name: "Yoga",
      pointCost: 2,
    });
    mocks.room.mockResolvedValue(null);
    expect(await createCourseSchedule(input)).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

it.each([[true,true],[true,false],[false,true],[false,false]])("enforces both scheduling flags before creating occurrences (%s/%s)",async(open,assigned)=>{
 mocks.schedulingRule.mockResolvedValue({selfBookingEnabled:open,assignedSchedulingEnabled:assigned});
 for(const audience of ["OPEN","ASSIGNED"] as const){mocks.create.mockClear();const result=await createCourseSchedule({...input,bookingAudience:audience});expect(result.success).toBe(audience==="OPEN"?open:assigned);if(!result.success)expect(mocks.create).not.toHaveBeenCalled();}
});

it("does not apply learner scheduling mode switches to the separate rental class",async()=>{
 mocks.schedulingRule.mockResolvedValue({selfBookingEnabled:false,assignedSchedulingEnabled:false});mocks.template.mockResolvedValue({id:"yoga",name:"租借",pointCost:0,isActive:true,visibility:"PUBLIC",classType:"RENTAL"});expect(await createCourseSchedule({...input,repeatUntil:undefined})).toMatchObject({success:true});
});

describe('sports guest trial transaction',()=>{
 const requestKey='00000000-0000-4000-8000-000000000001',participantKey='00000000-0000-4000-8000-000000000002';
 const input={templateId:'yoga',roomId:'room-a',coachId:'coach-a',date:'2099-01-01',time:'10:00',durationMinutes:60,capacity:1,requestKey,isTrial:true,chargePlanId:'single',bookingAudience:'ASSIGNED',sportsStaging:{frequency:'SINGLE',enrollment:'ASSIGNED',planId:null,students:[],trialPrice:1},learners:[{customerId:null,cardId:null,participantKey,customerName:'體驗學員',customerPhone:'0912345678'}]};
 function setup(existingCustomer=false){
  mocks.permission.mockResolvedValue({id:'owner-a',role:'OWNER',name:'店長'});
  mocks.quote.mockResolvedValue({snapshot:{planId:'single'},duration:90,trialPrice:480});
  mocks.existing.mockImplementation(async(args:{select?:{id?:boolean}})=>args.select?.id?[{id:'created'}]:[]);
  const fallback=mocks.raw.getMockImplementation()!;
  mocks.raw.mockImplementation(async(sql:TemplateStringsArray,...args:unknown[])=>sql.join('').includes('FROM "Customer"')?(existingCustomer?[{id:'existing-customer',assignedStaffId:null}]:[]):fallback(sql,...args));
 }
 it.each([false,true])('creates a trial booking using the authoritative quote; existing phone reused=%s',async existingCustomer=>{
  setup(existingCustomer);
  expect(await createCourseSchedule(input)).toMatchObject({success:true,data:{count:1}});
  expect(mocks.permission).toHaveBeenCalledWith('customer.create');
  const writes=mocks.execute.mock.calls.filter(c=>c[0].join('').includes('INSERT INTO "Customer"'));
  expect(writes).toHaveLength(existingCustomer?0:1);
  expect(mocks.create.mock.calls[0][0].data[0]).toMatchObject({isTrial:true,enrollmentFingerprint:expect.any(String)});
  const session=mocks.create.mock.calls[0][0].data[0];expect((session.endsAt-session.startsAt)/60000).toBe(90);
  expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'store-a'}),expect.objectContaining({sessionId:'created',customerId:existingCustomer?'existing-customer':`trial:${participantKey}`,trialPrice:480,cardId:null}),null);
 });
 it('checks customer creation permission before any schedule/customer writes',async()=>{
  setup();mocks.permission.mockImplementation(async(permission:string)=>{if(permission==='customer.create')throw new Error('FORBIDDEN');return {id:'owner-a',role:'OWNER'};});
  expect((await createCourseSchedule(input)).success).toBe(false);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
 });
 it('replays the same guest intent without creating another customer or booking',async()=>{
  setup();await createCourseSchedule(input);const session={...mocks.create.mock.calls[0][0].data[0],id:'created'};
  mocks.existing.mockResolvedValue([session]);mocks.bookings.mockResolvedValue([{sessionId:'created',customerId:`trial:${participantKey}`,cardId:null,trialPrice:480,requestKey:`schedule:${requestKey}:created:${participantKey}`}]);
  const {readSportsSessionRule}=await import('@/server/services/sports-staging-schedule');vi.mocked(readSportsSessionRule).mockResolvedValue({payload:{...input.sportsStaging,trialPrice:480}} as never);
  mocks.create.mockClear();mocks.reserve.mockClear();mocks.execute.mockClear();
  expect(await createCourseSchedule(input)).toMatchObject({success:true,data:{count:1}});expect(mocks.create).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
  expect((await createCourseSchedule({...input,learners:[{...input.learners[0],customerPhone:'0999999999'}]})).success).toBe(false);
 });
});
