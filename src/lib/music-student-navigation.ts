const listKeys = ["search", "status", "visit", "referral", "staff", "sort", "label", "page", "studentSubject", "studentMethod", "studentPeriods", "studentRecords", "returnCourseSession", "returnCourseDate"] as const;
export function studentReturnHref(customerId: string, query = "", _tab: "makeups" | "bookings" | "courses" = "courses") {
  const source = new URLSearchParams(query);
  const next = new URLSearchParams({ view: "customers" });
  for (const key of listKeys) {
    const value = source.get(key);
    if (value && value.length <= 1000) next.set(key, value);
  }
  if (source.get("dataScope") === "legacy") next.set("dataScope", "legacy");
  next.set("customerId", customerId);
  next.set("studentTab", source.get("studentTab") === "records" ? "records" : "courses");
  return `/dashboard/courses?${next}`;
}
/** Hints only. The schedule form and write action revalidate eligibility and capacity. */
export function studentScheduleHref(customerId: string, query: string, templateId = "") {
  const target = new URLSearchParams({action:"schedule",scheduleCustomer:customerId,returnStudentId:customerId,returnStudentQuery:studentReturnHref(customerId,query).split("?")[1]});
  if (templateId) target.set("scheduleTemplate",templateId);
  return `/dashboard/courses?${target}`;
}
export function monthlyReturnHref(query: string) {
  const source=new URLSearchParams(query),month=source.get("returnMonthlyMonth");
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const target=new URLSearchParams({month});
  for(const key of ["teacherId","salaryData","settlementTeacher","settlementCategory","settlementPerson"]){const value=source.get(`returnMonthly_${key}`);if(value&&value.length<=100)target.set(key,value);}
  return `/dashboard/service-fee-calculator?${target}`;
}
export function studentCourseHref(customerId: string, date: string, sessionId: string, query: string) {
  const safe = studentReturnHref(customerId, query, "bookings").split("?")[1];
  const target = new URLSearchParams({date, action:"booking", session:sessionId, returnStudentId:customerId, returnStudentQuery:safe});
  if (new URLSearchParams(safe).get("dataScope") === "legacy") target.set("dataScope", "legacy");
  return `/dashboard/courses?${target}`;
}
export function studentMakeupsHref(customerId: string, query: string) {
  const safe = studentReturnHref(customerId, query).split("?")[1];
  const target = new URLSearchParams({ customerId, returnQuery: safe });
  if (new URLSearchParams(safe).get("dataScope") === "legacy") target.set("dataScope", "legacy");
  return `/dashboard/courses/makeups?${target}`;
}
