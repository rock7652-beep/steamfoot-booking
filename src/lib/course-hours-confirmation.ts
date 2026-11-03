/** Store-level onboarding evidence; provisioning default hours is not confirmation. */
export const COURSE_HOURS_CONFIRMED = "COURSE_HOURS_CONFIRMED";
export const courseHoursConfirmationId = (storeId: string) => `course-hours-confirmed:${storeId}`;
