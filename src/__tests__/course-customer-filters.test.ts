import {expect,it} from "vitest";
import {normalizeCourseCustomerFilters} from "@/lib/course-customer-filters";
it("drops retired hidden filters but preserves module scope and visible conditions without mutating input",()=>{
 const source=new URLSearchParams("view=customers&dataScope=legacy&search=A&label=vip&staff=manager&sort=points&page=2&visit=never&referral=has&status=lead");
 const result=normalizeCourseCustomerFilters(source);
 expect(result.has("visit")).toBe(false);expect(result.has("referral")).toBe(false);expect(result.has("status")).toBe(false);
 for(const key of ["view","dataScope","search","label","staff","sort","page"])expect(result.get(key)).toBe(source.get(key));
 expect(source.get("visit")).toBe("never");
});
it.each(["linked","unlinked"])("retains valid LINE status %s",status=>expect(normalizeCourseCustomerFilters(new URLSearchParams({status})).get("status")).toBe(status));
