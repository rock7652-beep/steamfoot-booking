import { beforeEach, describe, expect, it, vi } from "vitest";

const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),sessions:vi.fn(),bookings:vi.fn(),correct:vi.fn(),settle:vi.fn(),refresh:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/server/services/course-booking",()=>({correctCourseAttendance:m.correct,settleCourseBooking:m.settle}));
vi.mock("@/server/services/course-low-balance-schedule",()=>({scheduleCourseLowBalanceCheck:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.refresh}));
import { updateCourseDailyAttendanceBatch } from "@/server/actions/course-members";

const choices=[{id:"one",sessionId:"morning",status:"CANCELLED" as const},{id:"two",sessionId:"evening",status:"CANCELLED" as const}];
beforeEach(()=>{
  vi.resetAllMocks();
  m.manager.mockResolvedValue({storeId:"store",user:{id:"manager",name:"店長"}});
  m.sessions.mockResolvedValue([{id:"morning"},{id:"evening"}]);
  m.bookings.mockResolvedValue(choices.map(row=>({...row,absenceKind:"STUDENT_LEAVE"})));
  m.transaction.mockImplementation(async (_storeId:string,work:(tx:unknown)=>Promise<unknown>)=>work({courseSession:{findMany:m.sessions},courseBooking:{findMany:m.bookings}}));
});

describe("店長跨課次批次處理",()=>{
  it("同一筆動作核對不同課次的請假名單後逐人恢復",async()=>{
    const result=await updateCourseDailyAttendanceBatch({target:"RESERVED",bookings:choices});
    expect(result.success).toBe(true);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.correct).toHaveBeenCalledTimes(2);
    expect(m.correct.mock.calls.map(call=>call[2])).toEqual(["one","two"]);
  });
  it("任何一位的狀態已變更時，整批不開始扣堂或更正",async()=>{
    m.bookings.mockResolvedValueOnce([{...choices[0],absenceKind:"STUDENT_LEAVE"},{...choices[1],status:"RESERVED",absenceKind:null}]);
    const result=await updateCourseDailyAttendanceBatch({target:"RESERVED",bookings:choices});
    expect(result.success).toBe(false);
    expect(m.correct).not.toHaveBeenCalled();
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("未點名學員可跨課次記曠課，重複勾選遭拒",async()=>{
    const pending=choices.map(row=>({...row,status:"RESERVED" as const}));
    m.bookings.mockResolvedValueOnce(pending.map(row=>({...row,absenceKind:null})));
    expect((await updateCourseDailyAttendanceBatch({target:"NO_SHOW",bookings:pending})).success).toBe(true);
    expect(m.settle).toHaveBeenCalledTimes(2);
    expect(m.settle.mock.calls[0][4]).toBe("DEDUCTED");
    expect((await updateCourseDailyAttendanceBatch({target:"NO_SHOW",bookings:[pending[0],pending[0]]})).success).toBe(false);
  });
});
