import { afterEach,beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({store:vi.fn(),customer:vi.fn(),bookings:vi.fn(),order:vi.fn(),send:vi.fn(),feature:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{store:{findFirst:m.store},customer:{findFirst:m.customer}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{findMany:m.bookings},coursePurchase:{findFirst:m.order}}}));
vi.mock("@/lib/base-url",()=>({deriveBaseUrl:()=>"https://example.test"}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/server/services/manager-notification-delivery",()=>({deliverManagerNotification:m.send}));
import {notifyCourseBookingManagers,notifyCoursePurchaseManagers} from "@/server/services/course-manager-notifications";
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-17T12:00:00+08:00"));m.store.mockResolvedValue({slug:"test-course",name:"course"});m.feature.mockResolvedValue(true);m.bookings.mockResolvedValue([{id:"b",createdAt:new Date(),customerName:"B",operatorName:"A",session:{startsAt:new Date("2026-09-17T15:00:00+08:00"),nameSnapshot:"課程"}}]);m.order.mockResolvedValue({id:"p",customerId:"A",name:"方案",price:1000});m.customer.mockResolvedValue({name:"A"});});
afterEach(()=>vi.useRealTimers());
it("same-day notification identifies operator and learner and uses course-only link",async()=>{
 await notifyCourseBookingManagers("s",["b"]);expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",status:"RESERVED",operatorCustomerId:{not:null}})}));const input=m.send.mock.calls[0][0];expect(input.eventKey).toBe("course-booking-created:b");expect(input.messages[0].text).toContain("上課者：B");expect(input.messages[0].text).toContain("預約人：A");expect(input.messages[0].text).toContain("courses?date=2026-09-17");
});
it("does not send a tomorrow class as a same-day event",async()=>{
 m.bookings.mockResolvedValue([{id:"b",createdAt:new Date(),session:{startsAt:new Date("2026-09-18T15:00:00+08:00")}}]);await notifyCourseBookingManagers("s",["b"]);expect(m.send).not.toHaveBeenCalled();
});
it("pending purchase notification uses same-store lookup and does not disclose bank last-five",async()=>{
 await notifyCoursePurchaseManagers("s","p");expect(m.order).toHaveBeenCalledWith({where:{id:"p",storeId:"s",status:"PENDING"}});expect(m.customer).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"A",storeId:"s"})}));expect(m.send.mock.calls[0][0]).toMatchObject({eventKey:"course-purchase-pending:p",type:"TRANSFER_PENDING_CONFIRMATION"});expect(m.send.mock.calls[0][0].messages[0].text).toContain("view=plans");
});
it("confirmed or missing orders generate no pending payment notification",async()=>{m.order.mockResolvedValue(null);await notifyCoursePurchaseManagers("s","p");expect(m.send).not.toHaveBeenCalled();});
it("other modules and disabled store features never enter course delivery",async()=>{m.store.mockResolvedValue(null);await notifyCoursePurchaseManagers("s","p");expect(m.order).not.toHaveBeenCalled();m.store.mockResolvedValue({slug:"test"});m.feature.mockResolvedValue(false);await notifyCourseBookingManagers("s",["b"]);expect(m.bookings).not.toHaveBeenCalled();});
it("delivery outage does not throw into a committed transaction response",async()=>{m.send.mockRejectedValue(new Error("offline"));await expect(notifyCoursePurchaseManagers("s","p")).resolves.toBeUndefined();});
