import {describe,it,expect} from "vitest";
import {studentCourseHref,studentReturnHref,studentScheduleHref,monthlyReturnHref} from "@/lib/music-student-navigation";
describe("course workflow return context",()=>{
 it("retains music subject, method, expanded periods and list filters across a lesson visit",()=>{
  const query=new URLSearchParams({search:"test",page:"2",studentSubject:"guitar",studentMethod:"individual",studentPeriods:"card:1,card:2"}).toString();
  const lesson=new URL(studentCourseHref("person","2026-10-24","lesson",query),"https://example.test");
  const back=new URL(studentReturnHref("person",lesson.searchParams.get("returnStudentQuery")!),lesson.origin);
  for(const [key,value] of new URLSearchParams(query))expect(back.searchParams.get(key)).toBe(value);
  expect(back.searchParams.get("studentTab")).toBe("courses");
 });
 it("returns sports to its booking records rather than music tuition",()=>{
  const query=new URLSearchParams({studentTab:"records",studentRecords:"bookings"}).toString();
  expect(studentReturnHref("person",query)).toContain("studentTab=records");
  expect(studentReturnHref("person",query)).toContain("studentRecords=bookings");
 });
 it("passes customer/template hints but never payment, term or balance instructions",()=>{
  const url=new URL(studentScheduleHref("person","paid=500&remaining=99&studentSubject=guitar","template"),"https://example.test");
  expect(url.searchParams.get("scheduleCustomer")).toBe("person");
  expect(url.searchParams.get("scheduleTemplate")).toBe("template");
  expect(url.search).not.toMatch(/paid|remaining/);
 });
 it("accepts only an internal monthly return route with a valid month",()=>{
  expect(monthlyReturnHref("returnMonthlyMonth=https://evil.test")).toBeNull();
  expect(monthlyReturnHref("returnMonthlyMonth=2026-13")).toBeNull();
  expect(monthlyReturnHref("returnMonthlyMonth=2026-10&returnMonthly_settlementTeacher=t1&returnMonthly_settlementCategory=FEE&url=https://evil.test")).toBe("/dashboard/service-fee-calculator?month=2026-10&settlementTeacher=t1&settlementCategory=FEE");
 });
});
