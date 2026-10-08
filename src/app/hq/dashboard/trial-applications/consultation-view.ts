import { z } from "zod";
import { CONSULTATION_LEAD_STATUSES, isSafeConsultationUrl } from "@/lib/consultation-lead";
import { applicationStatuses } from "@/lib/trial-application";

export const LEGACY_CONSULTATION_SHEET = "https://docs.google.com/spreadsheets/d/1VHUCglOH0jRpWbdVAnIw39UVe7ULbag33JHs1Bw7oG4/edit#gid=2026091501";
export const CONSULTATION_PAGE_SIZE = 20;
export const sheetStatusLabels: Record<string, string> = {
  NOT_SENT_PREVIEW: "測試未送：未傳 Sheet／未寄通知",
  PENDING: "Sheet 尚未確認收件",
  SENDING: "Sheet 傳送中／等待確認",
  CONFIRMED: "Sheet 已確認收件",
  UNKNOWN: "Sheet 結果不明，請先查核，勿重送",
};
export type ConsultationSearch = {
  stage: "consultations" | "applications";
  q: string;
  status?: string;
  page: number;
  application?: string;
  lead?: string;
  activityPage: number;
};
export type ConsultationSearchParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const boundedPage = (value: string) => Math.min(10000, Math.max(1, Math.floor(Number(value)) || 1));
export function parseConsultationSearch(params: ConsultationSearchParams): ConsultationSearch {
  const application = single(params.application).slice(0, 100) || undefined;
  const stage = params.stage === "applications" || (application && params.stage !== "consultations") ? "applications" : "consultations";
  const choices = stage === "applications" ? applicationStatuses : CONSULTATION_LEAD_STATUSES;
  const status = single(params.status);
  return {
    stage,
    q: single(params.q).trim().slice(0, 200),
    status: Object.hasOwn(choices, status) ? status : undefined,
    page: boundedPage(single(params.page)),
    application,
    lead: single(params.lead).slice(0, 100) || undefined,
    activityPage: boundedPage(single(params.activityPage)),
  };
}
export function consultationHref(search: Partial<ConsultationSearch>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `/hq/dashboard/trial-applications?${query}`;
}
/** Never invent contact details or interpolate untrusted text into URI schemes. */
export function suppliedPhoneHref(value: string | null | undefined) {
  if (!value || !/^\+?[\d ()\-.]+$/.test(value.trim())) return null;
  const compact = value.trim().replace(/[ ()\-.]/g, "");
  return /^\+?\d{6,18}$/.test(compact) ? `tel:${compact}` : null;
}
export function suppliedEmailHref(value: string | null | undefined) {
  if (!value || /[\r\n\u0000-\u001f\u007f]/.test(value)) return null;
  const parsed = z.string().trim().email().max(200).safeParse(value);
  return parsed.success ? `mailto:${encodeURIComponent(parsed.data)}` : null;
}
export function suppliedWebHref(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return null;
  const supplied = value.trim();
  return isSafeConsultationUrl(supplied) ? supplied : null;
}
export function suppliedLineHref(value: string | null | undefined) {
  const href = suppliedWebHref(value);
  if (!href) return null;
  const url = new URL(href);
  return url.protocol === "https:" && ["line.me", "lin.ee"].includes(url.hostname) && url.pathname !== "/" ? href : null;
}
export function originalFields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function fieldText(value: unknown) {
  if (typeof value === "string") return value || "尚未提供";
  if (Array.isArray(value)) return value.filter(item => typeof item === "string").join("、") || "尚未提供";
  return "尚未提供";
}
