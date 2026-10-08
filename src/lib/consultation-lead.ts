import { z } from "zod";

export const CONSULTATION_LEAD_STATUSES = {
  NEW: "待聯繫",
  CONTACTED: "已聯繫",
  FOLLOW_UP: "追蹤中",
  CLOSED: "已結案",
} as const;

export const consultationLeadStatusSchema = z.enum(["NEW", "CONTACTED", "FOLLOW_UP", "CLOSED"]);
export type ConsultationLeadStatus = z.infer<typeof consultationLeadStatusSchema>;

/** Syntactic link validation only. Never resolve DNS, fetch, scrape, or infer links. */
export function isSafeConsultationUrl(value: string, allowedHosts?: readonly string[]): boolean {
  if (!/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    // Reject all IP literals, single-label/private hostnames, and local DNS suffixes.
    // Public hostnames can still resolve privately; these values are never fetched server-side.
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return false;
    if (!host.split(".").every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return false;
    if (/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid)$/.test(host)) return false;
    return !allowedHosts || allowedHosts.includes(host);
  } catch {
    return false;
  }
}

function optionalPublicUrl(allowedHosts?: readonly string[]) {
  return z.string().trim().max(2000).refine(
    (value) => !value || isSafeConsultationUrl(value, allowedHosts),
    "Use a public HTTPS URL on the supported website",
  ).optional();
}

const text = z.string().trim().max(2000).optional();
export const payloadSchema = z.object({
  requestId: z.string().uuid(),
  storeName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  industry: z.string().trim().min(1).max(200),
  storeCount: text, staffCount: text, members: text, hasSystem: text,
  systemName: text, otherNeed: text, contactWay: text, time: text,
  bookingMode: z.enum(["固定時段，每個時段可接待固定人數", "依服務項目，安排技師／芳療師與服務時間", "依課表安排個別課或團體課", "不確定，希望協助判斷"]).optional(),
  courseFormat: z.enum(["個別課", "團體課", "兩者都有", "尚未確定"]).optional(),
  phone: text, lineId: text, source: text, medium: text, campaign: text,
  content: text, landing: text, pageUrl: text, referrer: text, device: text,
  websiteUrl: optionalPublicUrl(),
  facebookUrl: optionalPublicUrl(["facebook.com", "www.facebook.com", "m.facebook.com"]),
  instagramUrl: optionalPublicUrl(["instagram.com", "www.instagram.com"]),
  formVersion: z.literal("fitness-v2").optional(),
  priorityNeed: z.string().trim().max(200).optional(),
  needs: z.array(z.string().trim().min(1).max(200)).min(1),
  replaceReason: z.array(z.string().max(200)).max(20),
}).superRefine((data, ctx) => {
  const fitness = data.formVersion === "fitness-v2" && data.source === "fitness-intake";
  const noContact = fitness && data.contactWay === "目前暫不考慮";
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (data.courseFormat && !["運動教室／健身／瑜伽", "音樂／才藝／教育服務"].includes(data.industry)) invalid("Classroom industry required");
  if (data.formVersion && !fitness) invalid("Invalid form source");
  if (!fitness && data.needs.length > 3) invalid("Legacy forms allow three needs");
  if (new Set(data.needs).size !== data.needs.length) invalid("Duplicate needs");
  if (!noContact && (!data.contactName || !(data.phone || data.lineId))) invalid("Contact required");
  if (fitness) {
    if (!["申請體驗帳號", "預約 20 分鐘線上示範", "先透過 LINE 了解", "目前暫不考慮"].includes(data.contactWay || "")) invalid("Invalid intent");
    const unknown = data.needs.includes("還不確定，想先聊聊");
    if (unknown ? data.needs.length !== 1 || Boolean(data.priorityNeed) : !data.priorityNeed || !data.needs.includes(data.priorityNeed)) invalid("Invalid priority");
  }
});

export type ConsultationPayload = z.infer<typeof payloadSchema>;

export function isConsultationNoContact(payload: {
  formVersion?: unknown;
  source?: unknown;
  contactWay?: unknown;
}): boolean {
  return payload.formVersion === "fitness-v2"
    && payload.source === "fitness-intake"
    && payload.contactWay === "目前暫不考慮";
}

/** Retain the existing fitness opt-out semantics before any persistence or delivery. */
export function sanitizeConsultationPayload(payload: ConsultationPayload): ConsultationPayload {
  if (!isConsultationNoContact(payload)) return { ...payload };
  return { ...payload, contactName: "", phone: "", lineId: "", time: "" };
}
