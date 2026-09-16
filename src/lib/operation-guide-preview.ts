import "server-only";

export function isOperationGuidePreview() {
  // Keep the existing helper name for callers; the guide is now released.
  if (process.env.VERCEL_ENV === "production") return true;
  return process.env.VERCEL_ENV === "preview" ||
    (process.env.NODE_ENV === "development" && process.env.OPERATION_GUIDE_PREVIEW === "true");
}
