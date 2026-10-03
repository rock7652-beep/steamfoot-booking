import { expect,it,vi } from "vitest";
import { assertExistingTeacherAvailability,listOutsideTeacherAvailability } from "@/server/services/course-availability";
const session={id:"lesson",name:"吉他",startsAt:new Date("2026-09-29T10:00:00Z"),endsAt:new Date("2026-09-29T11:00:00Z"),capacity:2};
function reader(weekly:unknown[]=[],exceptions:unknown[]=[]) {
 return {$queryRaw:vi.fn().mockResolvedValueOnce([session]).mockResolvedValueOnce(weekly).mockResolvedValueOnce(exceptions)};
}
it("rejects a new rest interval overlapping an existing lesson and returns both times",async()=>{
 const tx=reader([{dayOfWeek:2,segments:[{openTime:"14:00",closeTime:"18:30"}]}]);
 await expect(assertExistingTeacherAvailability(tx,"store","teacher")).rejects.toMatchObject({conflicts:[{id:"lesson",startsAt:session.startsAt.toISOString(),endsAt:session.endsAt.toISOString()}]});
 for(const call of tx.$queryRaw.mock.calls)expect(call.slice(1)).toEqual(["store","teacher"]);
});
it("accepts unchanged class bounds and inherits store hours",async()=>{
 await expect(assertExistingTeacherAvailability(reader(),"s","t")).resolves.toBeUndefined();
 await expect(assertExistingTeacherAvailability(reader([{dayOfWeek:2,segments:[{openTime:"18:00",closeTime:"19:00"}]}]),"s","t")).resolves.toBeUndefined();
});
it("a missing weekday in a custom week is closed",async()=>{
 await expect(assertExistingTeacherAvailability(reader([{dayOfWeek:1,segments:[{openTime:"09:00",closeTime:"21:00"}]}]),"s","t")).rejects.toThrow("衝突");
});
it("single date exceptions override weekly rules using Taipei dates",async()=>{
 const date=new Date("2026-09-29T00:00:00Z");
 await expect(assertExistingTeacherAvailability(reader([],[{date,type:"UNAVAILABLE",segments:null}]),"s","t")).rejects.toThrow("衝突");
 await expect(assertExistingTeacherAvailability(reader([{dayOfWeek:2,segments:[]}],[{date,type:"CUSTOM",segments:[{openTime:"18:00",closeTime:"19:00"}]}]),"s","t")).resolves.toBeUndefined();
});

it("reports affected classes without rejecting a weekly update",async()=>{
 const tx=reader([{dayOfWeek:2,segments:[]}]);
 await expect(listOutsideTeacherAvailability(tx,"s","t")).resolves.toEqual([expect.objectContaining({id:"lesson",name:"吉他"})]);
});
it("an exception on another date ignores grandfathered weekly classes",async()=>{
 await expect(assertExistingTeacherAvailability(reader([{dayOfWeek:2,segments:[]}]),"s","t","2026-10-02")).resolves.toBeUndefined();
});
