export const courseExpirySettingId = (storeId:string) => `course-expiry-reminder-enabled:${storeId}`;

// Keep plan overrides in the same store-scoped configuration store as the master switch.
export const courseExpiryPlanPrefix = (storeId: string) => `course-expiry-plan:${storeId}:`;
export const courseExpiryPlanId = (storeId: string, planId: string) => `${courseExpiryPlanPrefix(storeId)}${planId}`;
