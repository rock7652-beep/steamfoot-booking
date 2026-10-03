export const BUSINESS_PROFILE_FEATURE_PREFIX = "business.";

export type CourseBusinessProfile = "FITNESS" | "MUSIC";
export type StoreBusinessProfile = CourseBusinessProfile | null;

export const BUSINESS_PROFILE_FEATURES: Record<CourseBusinessProfile, string> = {
  FITNESS: "business.fitness",
  MUSIC: "business.music",
};

export const BUSINESS_PROFILE_LABELS: Record<CourseBusinessProfile, string> = {
  FITNESS: "運動教室",
  MUSIC: "音樂教室",
};

export function getBusinessProfileFeatureKey(profile: CourseBusinessProfile): string {
  return BUSINESS_PROFILE_FEATURES[profile];
}

export function resolveCourseBusinessProfile(
  featureKeys: readonly string[] | null | undefined,
): CourseBusinessProfile {
  if (featureKeys?.includes(BUSINESS_PROFILE_FEATURES.MUSIC)) return "MUSIC";
  return "FITNESS";
}

export function getStoreBusinessLabel(
  industryModule: "STEAMFOOT" | "SPA" | "COURSE",
  featureKeys?: readonly string[] | null,
): string {
  if (industryModule === "STEAMFOOT") return "蒸足門市";
  if (industryModule === "SPA") return "SPA／美容美體";
  return BUSINESS_PROFILE_LABELS[resolveCourseBusinessProfile(featureKeys)];
}
