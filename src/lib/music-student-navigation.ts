const listKeys = ["search", "status", "visit", "referral", "staff", "sort", "label", "page"] as const;
export function studentReturnHref(customerId: string, query = "", tab: "makeups" | "bookings" = "makeups") {
  const source = new URLSearchParams(query);
  const next = new URLSearchParams({ view: "customers" });
  for (const key of listKeys) {
    const value = source.get(key);
    if (value && value.length <= 1000) next.set(key, value);
  }
  if (source.get("dataScope") === "legacy") next.set("dataScope", "legacy");
  next.set("customerId", customerId);
  next.set("studentTab", tab);
  return `/dashboard/courses?${next}`;
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
