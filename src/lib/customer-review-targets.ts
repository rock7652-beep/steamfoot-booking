/** Exact, owner-authorized identities in the isolated #1310 database. */
export const CUSTOMER_REVIEW_TARGETS = {
  steamfoot: { label: "蒸足", userId: "staging-user-owner", staffId: "staging-staff-owner", storeId: "staging-store", slug: "staging", industryModule: "STEAMFOOT", page: "bookings" },
  spa: { label: "SPA", userId: "spa-demo-user-owner", staffId: "spa-demo-owner", storeId: "demo-store", slug: "demo", industryModule: "SPA", page: "customers" },
  exercise: { label: "運動", userId: "cmu6dappt0002l804k8dvyv19", staffId: "cmu6dappt0004l804my3ll2oy", storeId: "store-course-start-0918-a", slug: "course-start-0918-a", industryModule: "COURSE", page: "courses?view=customers" },
  music: { label: "音樂", userId: "cmufcwavn0003l5044cxf6w7p", staffId: "cmufcwavn0005l504kka385k3", storeId: "store-lubymusic", slug: "lubymusic", industryModule: "COURSE", page: "courses?view=customers" },
} as const;
export type CustomerReviewModule = keyof typeof CUSTOMER_REVIEW_TARGETS;
export function customerReviewTarget(module: unknown) {
  return typeof module === "string" && Object.hasOwn(CUSTOMER_REVIEW_TARGETS, module)
    ? CUSTOMER_REVIEW_TARGETS[module as CustomerReviewModule] : null;
}
export function customerReviewTargetForUser(userId: unknown) {
  return Object.values(CUSTOMER_REVIEW_TARGETS).find(target => target.userId === userId) ?? null;
}
export function customerReviewDestination(module: CustomerReviewModule) {
  const target = CUSTOMER_REVIEW_TARGETS[module];
  return `/s/${target.slug}/admin/dashboard/${target.page}`;
}
