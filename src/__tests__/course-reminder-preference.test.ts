import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({member:vi.fn(),transaction:vi.fn(),save:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseMember:m.member,courseTransaction:m.transaction}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {setCourseBalanceReminderPreference} from "@/server/actions/course-reminder-preference";
beforeEach(()=>{vi.resetAllMocks();m.member.mockResolvedValue({storeId:"shop-a",customer:{id:"member-a"}});m.transaction.mockImplementation(async(_store,work)=>work({courseBalanceReminderPreference:{upsert:m.save}}));});
it("uses only the logged-in member and current store, preserving other shared members",async()=>{
 expect(await setCourseBalanceReminderPreference(true)).toEqual({success:true});
 expect(m.transaction.mock.calls[0][0]).toBe("shop-a");
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({where:{storeId_customerId:{storeId:"shop-a",customerId:"member-a"}},update:{stoppedAt:expect.any(Date),lastEventAt:expect.any(Date)}}));
});
it("allows only the same member to resume without modifying reservation notifications",async()=>{
 await setCourseBalanceReminderPreference(false);
 expect(m.save.mock.calls[0][0].update).toEqual({stoppedAt:null,lastEventAt:expect.any(Date)});
});
it("rejects missing/disabled membership before writing",async()=>{
 m.member.mockRejectedValue(new Error("停用"));expect(await setCourseBalanceReminderPreference(true)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
