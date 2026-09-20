import { beforeEach, describe, expect, it, vi } from "vitest";
import { courseMonthlyBookingWhere } from "@/lib/course-usage";
import { courseCashStatus } from "@/lib/course-home-display";
const m=vi.hoisted(()=>({customer:vi.fn(),staff:vi.fn(),steam:vi.fn(),spa:vi.fn(),course:vi.fn(),module:vi.fn(),store:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({prisma:{customer:{count:m.customer},staff:{count:m.staff},booking:{count:m.steam}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{spaBooking:{count:m.spa}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBooking:{count:m.course}}}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
import { getTrialStatus } from "@/lib/shop-config";
const trial={plan:"EXPERIENCE",planStatus:"TRIAL",planEffectiveAt:new Date("2026-09-18T00:00:00Z"),planExpiresAt:new Date("2026-10-17T00:00:00Z"),maxStaffOverride:null,maxCustomersOverride:null,maxMonthlyBookingsOverride:null,maxMonthlyReportsOverride:null,maxReminderSendsOverride:null,maxStoresOverride:null};
beforeEach(()=>{vi.clearAllMocks();m.store.mockResolvedValue(trial);m.customer.mockResolvedValue(1);m.staff.mockResolvedValue(2);m.course.mockResolvedValue(37);m.steam.mockResolvedValue(4);m.spa.mockResolvedValue(7);});
describe("trial source and quota agreement",()=>{
 it.each([['course',37],['spa',7],['steamfoot',4]])("uses the %s booking source",async(module,n)=>{m.module.mockResolvedValue(module);const r=await getTrialStatus("store");expect(r.bookings.current).toBe(n);expect(m.course).toHaveBeenCalledTimes(module==='course'?1:0);expect(m.steam).toHaveBeenCalledTimes(module==='steamfoot'?1:0);expect(m.spa).toHaveBeenCalledTimes(module==='spa'?1:0);if(module==='course'){expect(r.staff).toEqual({current:2,limit:3});expect(m.course.mock.calls[0][0].where).toEqual(courseMonthlyBookingWhere("store"));expect(m.staff).toHaveBeenCalledWith({where:{storeId:"store",status:"ACTIVE"}});}});
 it("keeps cancelled reservations in quota and uses Taipei creation-month boundaries",()=>{const before=courseMonthlyBookingWhere("s",new Date("2026-09-30T15:59:59Z"));const after=courseMonthlyBookingWhere("s",new Date("2026-09-30T16:00:00Z"));expect(before.createdAt.gte).toEqual(new Date("2026-08-31T16:00:00Z"));expect(before.createdAt.lte).toEqual(new Date("2026-09-30T15:59:59.999Z"));expect(after.createdAt.gte).toEqual(new Date("2026-09-30T16:00:00Z"));expect(before).not.toHaveProperty('status');expect(before).not.toHaveProperty('session');});
 it("does not query another store for no-store HQ context",async()=>{expect((await getTrialStatus()).isFree).toBe(false);expect(m.store).not.toHaveBeenCalled();});
});
describe("cash wording is read only and never invents reconciliation",()=>{
 it.each([[180,-20,'已結帳・短少 NT$20'],[220,20,'已結帳・多出 NT$20'],[200,0,'已結帳・帳款相符'],[null,0,'已結帳・尚未完成實點核對'],[200,null,'已結帳・尚未完成實點核對']] as const)("actual %s difference %s",(actual,diff,label)=>expect(courseCashStatus('CLOSED',actual,diff)).toBe(label));
 it("open drawer is not reconciled",()=>expect(courseCashStatus('OPEN',200,0)).toBe('已開店'));
});
