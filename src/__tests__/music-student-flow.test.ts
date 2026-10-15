import { describe, expect, it } from "vitest";
import { courseBookingBrowse } from "@/lib/course-booking-browse";
import { studentMakeupsHref, studentReturnHref, studentCourseHref } from "@/lib/music-student-navigation";

describe("student booking browse", () => {
  const now = new Date("2026-10-15T04:00:00Z");
  it("keeps legacy browsing descending and selects live future bookings ascending", () => {
    expect(courseBookingBrowse({}, now).order).toBe("desc");
    const upcoming = courseBookingBrowse({mode:"upcoming"}, now);
    expect(upcoming.order).toBe("asc");
    expect(upcoming.where).toEqual({AND:[{session:{startsAt:{}}},{status:"RESERVED",session:{endsAt:{gt:now},cancelledAt:null,releasedAt:null}}]});
    expect(courseBookingBrowse({mode:"history"}, now).where).toEqual({AND:[{session:{startsAt:{}}},{NOT:{status:"RESERVED",session:{endsAt:{gt:now},cancelledAt:null,releasedAt:null}}}]});
  });
  it("retains date limits and rejects invalid ranges or modes", () => {
    expect(courseBookingBrowse({mode:"upcoming",from:"2026-10-16"},now).where).toMatchObject({AND:[{session:{startsAt:{gte:new Date("2026-10-15T16:00:00Z")}}},{}]});
    expect(()=>courseBookingBrowse({mode:"unknown"},now)).toThrow();
    expect(()=>courseBookingBrowse({from:"2026-10-17",to:"2026-10-16"},now)).toThrow();
  });
});
describe("student makeup return context", () => {
  it("returns from a specific class to the original student's bookings without carrying actions", () => {
    const url=new URL(studentCourseHref("student-1","2026-10-15","session:1","search=abc&page=2&action=delete"),"https://example.test");
    expect(url.searchParams.get("session")).toBe("session:1");
    expect(url.searchParams.get("action")).toBe("booking");
    const back=new URL(studentReturnHref(url.searchParams.get("returnStudentId")!,url.searchParams.get("returnStudentQuery")!,"bookings"),"https://example.test");
    expect(Object.fromEntries(back.searchParams)).toEqual({view:"customers",search:"abc",page:"2",customerId:"student-1",studentTab:"bookings"});
  });
  it("round trips search, filters and page while retaining the selected student", () => {
    const href=studentMakeupsHref("student-1","search=hello%20world&status=active&page=3&sort=name&label=VIP");
    const query=new URL(href,"https://example.test").searchParams;
    const result=new URL(studentReturnHref("student-1",query.get("returnQuery")!),"https://example.test");
    expect(Object.fromEntries(result.searchParams)).toEqual({view:"customers",search:"hello world",status:"active",page:"3",sort:"name",label:"VIP",customerId:"student-1",studentTab:"makeups"});
  });
  it("does not accept external redirects, unrelated actions or a different student", () => {
    const result=studentReturnHref("correct","returnTo=https://evil.test&action=delete&customerId=wrong&view=plans&studentTab=info");
    expect(result).toBe("/dashboard/courses?view=customers&customerId=correct&studentTab=makeups");
  });
});


describe("student cohort navigation", () => {
  it("keeps legacy classification on both destinations and round-trip student links", () => {
    const query = "dataScope=legacy&search=demo&page=2&action=delete";
    for (const [href, returnKey, tab] of [
      [studentCourseHref("student-1", "2026-10-15", "session-1", query), "returnStudentQuery", "bookings"],
      [studentMakeupsHref("student-1", query), "returnQuery", "makeups"],
    ] as const) {
      const target = new URL(href, "https://example.test");
      expect(target.searchParams.get("dataScope")).toBe("legacy");
      const back = new URL(studentReturnHref("student-1", target.searchParams.get(returnKey)!, tab), "https://example.test");
      expect(Object.fromEntries(back.searchParams)).toEqual({view:"customers",search:"demo",page:"2",dataScope:"legacy",customerId:"student-1",studentTab:tab});
    }
  });
  it("does not propagate unknown classification values", () => {
    expect(studentMakeupsHref("student-1", "dataScope=all")).not.toContain("dataScope");
    expect(studentCourseHref("student-1", "2026-10-15", "session-1", "dataScope=all")).not.toContain("dataScope");
  });
});
