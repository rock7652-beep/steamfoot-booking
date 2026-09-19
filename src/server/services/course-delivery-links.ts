import { deriveBaseUrl } from "@/lib/base-url";
import { getConfiguredStoreLine } from "@/lib/store-line-config";

export function deriveCourseBaseUrl(): string {
  const configured = process.env.COURSE_TRIAL_ORIGIN?.trim();
  if (!configured) return deriveBaseUrl();
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("課程試用網址必須是固定 HTTPS origin");
  return url.origin;
}
export function courseMemberNotificationUrl(slug: string, view: "bookings" | "plans", date?: string, legacyPath: "home" | "book" = "home"): URL {
  const config = getConfiguredStoreLine(slug);
  const url = config ? new URL("https://liff.line.me/" + config.liffId) : new URL("/s/" + encodeURIComponent(slug) + (legacyPath === "book" ? "/book" : ""), deriveCourseBaseUrl());
  url.searchParams.set(config ? "courseView" : "view", view);
  if (date) {
    url.searchParams.set(config ? "courseDate" : "date", date);
    if (!config) url.searchParams.set("month", date.slice(0, 7));
  }
  return url;
}
