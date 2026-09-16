import "server-only";

export function isOperationGuidePreview() {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.VERCEL_ENV === "preview" ||
    (process.env.NODE_ENV === "development" && process.env.OPERATION_GUIDE_PREVIEW === "true");
}
