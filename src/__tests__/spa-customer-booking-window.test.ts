import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),member:vi.fn(),store:vi.fn(),scope:vi.fn(),guard:vi.fn(),raw:vi.fn(),transaction:vi.fn(),duplicate:vi.fn(),create:vi.fn(),staff:vi.fn(),location:vi.fn(),treatments:vi.fn(),day:vi.fn(),slots:vi.fn()}));
vi.mock("@/lib/session",()=>({requireSession:m.session}));
vi.mock("@/lib/industry-module-server",()=>({requireSpaStore:m.guard}));
vi.mock("@/server/services/member-request-store",()=>({resolveMemberRequestStoreId:m.scope}));
vi.mock("@/server/services/central-member-resolver",()=>({resolveCentralMemberCustomerForStore:m.member}));
vi.mock("@/lib/db",()=>({prisma:{store:{findUnique:m.store},staff:{findFirst:m.staff}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{$queryRaw:m.raw,$transaction:m.transaction,spaTreatment:{findMany:m.treatments}}}));
vi.mock("@/lib/business-hours-resolver",()=>({loadDayBusinessHoursContext:m.day,applySlotOverrides:m.slots}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {fetchSpaCustomerAvailability,createSpaCustomerBooking} from "@/server/actions/spa-customer-booking";
import {readSpaCustomerWindow,assertSpaCustomerDate,withinSpaCustomerWindow} from "@/server/services/spa-customer-window";
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-10T15:00:00+08:00"));
 m.session.mockResolvedValue({id:"u",role:"CUSTOMER",storeId:"s"});m.scope.mockResolvedValue("s");m.member.mockResolvedValue({customerId:"c"});m.store.mockResolvedValue({slug:"shop",operatingStatus:"ACTIVE",moduleInstallation:{status:"ACTIVE"}});
 m.raw.mockResolvedValue([{bookableUntilDate:null,bookingWindowDays:7,bookingOpensAt:null}]);m.duplicate.mockResolvedValue(null);
 m.transaction.mockImplementation(async work=>work({$executeRaw:vi.fn(),$queryRaw:m.raw,spaBooking:{findUnique:m.duplicate,create:m.create},spaServiceLocation:{findFirst:m.location}}));
});
afterEach(()=>vi.useRealTimers());
const input={date:"2026-10-18",treatmentIds:["t"],startTime:"10:00",staffId:null,requestKey:"123e4567-e89b-42d3-a456-426614174000"};
it("availability and transaction both reject dates beyond the configured seven-day window before bookings/entitlements",async()=>{
 expect(await fetchSpaCustomerAvailability(input)).toMatchObject({success:false,error:expect.stringContaining("2026-10-17")});expect(m.treatments).not.toHaveBeenCalled();
 expect(await createSpaCustomerBooking(input)).toMatchObject({success:false,error:expect.stringContaining("2026-10-17")});expect(m.create).not.toHaveBeenCalled();expect(m.raw.mock.calls[0][1]).toBe("s");
});
it("rejects the final rolling day's times beyond the exact cutoff inside the booking lock",async()=>{
 expect(await createSpaCustomerBooking({...input,date:"2026-10-17",startTime:"15:01"})).toMatchObject({success:false,error:expect.stringContaining("預約期限")});expect(m.create).not.toHaveBeenCalled();
});
it("honors fixed date inclusive Taipei day and deferred opening, without imposing a hard-coded sixty days",async()=>{
 m.raw.mockResolvedValue([{bookableUntilDate:new Date("2027-01-01T00:00:00Z"),bookingWindowDays:7,bookingOpensAt:null}]);
 const window=await readSpaCustomerWindow("s");expect(()=>assertSpaCustomerDate("2027-01-01",window)).not.toThrow();expect(withinSpaCustomerWindow("2027-01-01","23:59",window)).toBe(true);expect(withinSpaCustomerWindow("2027-01-02","00:00",window)).toBe(false);
 m.raw.mockResolvedValue([{bookableUntilDate:null,bookingWindowDays:7,bookingOpensAt:new Date("2026-10-11T00:00:00+08:00")}]);expect(await createSpaCustomerBooking({...input,date:"2026-10-11"})).toMatchObject({success:false,error:"本店預約尚未開放"});expect(m.create).not.toHaveBeenCalled();
});
it("an already committed same-key retry returns its booking even after the window changed",async()=>{
 m.duplicate.mockResolvedValue({id:"b",serviceNameSnapshot:"按摩",endTime:"11:00",serviceStaffId:"teacher",serviceLocationId:"room"});m.staff.mockResolvedValue({displayName:"小美"});m.location.mockResolvedValue({name:"一號房"});
 expect(await createSpaCustomerBooking(input)).toMatchObject({success:true,data:{bookingId:"b",staffName:"小美"}});expect(m.raw).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it("invalid dates, wrong membership and wrong module never create bookings",async()=>{
 expect(await createSpaCustomerBooking({...input,date:"2026-02-30"})).toMatchObject({success:false});expect(m.create).not.toHaveBeenCalled();
 m.member.mockResolvedValue(null);expect(await createSpaCustomerBooking(input)).toMatchObject({success:false});m.transaction.mockClear();m.member.mockResolvedValue({customerId:"c"});m.guard.mockRejectedValue(new Error("wrong module"));expect(await createSpaCustomerBooking(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
