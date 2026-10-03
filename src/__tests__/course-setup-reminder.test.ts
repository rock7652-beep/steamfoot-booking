import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),set:vi.fn(),get:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({set:m.set,get:m.get})}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.access}));
vi.mock("@/server/queries/course-setup",()=>({courseSetupCookieName:(store:string,user:string)=>`setup:${store}:${user}`}));
import {saveCourseSetupReminder} from "@/server/actions/course-setup";
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({user:{id:"u",role:"OWNER"},storeId:"s",isChildStoreView:false});m.get.mockReturnValue({value:"login-1"});});
it("records the actual signed-in user and store, plus the current login marker",async()=>{
 expect(await saveCourseSetupReminder("later")).toEqual({success:true});
 expect(m.access).toHaveBeenCalledWith("booking.read");
 expect(m.set).toHaveBeenCalledWith("setup:s:u",JSON.stringify({mode:"later",login:"login-1"}),expect.objectContaining({httpOnly:true,sameSite:"lax",path:"/",maxAge:31536000}));
});
it("cannot change another store from a child-store inspection",async()=>{
 m.access.mockResolvedValue({user:{id:"u",role:"OWNER"},storeId:"child",isChildStoreView:true});expect((await saveCourseSetupReminder("never")).success).toBe(false);expect(m.set).not.toHaveBeenCalled();
});
it("invalid mode or staff access cannot persist a reminder",async()=>{
 expect((await saveCourseSetupReminder("invalid" as "show")).success).toBe(false);expect(m.access).not.toHaveBeenCalled();
 m.access.mockResolvedValue({user:{id:"u",role:"STAFF"},storeId:"s",isChildStoreView:false});expect((await saveCourseSetupReminder("show")).success).toBe(false);expect(m.set).not.toHaveBeenCalled();
});
