import { describe, expect, it } from "vitest";
import { courseBookingBrowse } from "@/lib/course-booking-browse";
import { studentMakeupsHref, studentReturnHref } from "@/lib/music-student-navigation";

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
