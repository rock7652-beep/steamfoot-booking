import { toLocalDateStr } from "@/lib/date-utils";

export function auditTimeLabel(value: Date, previous?: Date) {
  const time = value.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, hour: "2-digit", minute: "2-digit" });
  return previous && toLocalDateStr(value) === toLocalDateStr(previous)
    ? time : `${toLocalDateStr(value).slice(5).replace("-", "/")} ${time}`;
}

export function auditReturnQuery(value?: string) {
  // Return only to this center; never accept a destination supplied by a URL.
  if (!value || value.length > 2000) return null;
  const allowed = new Set(["tab", "dateFrom", "dateTo", "actor", "module", "q", "page", "login"]);
  const result = new URLSearchParams();
  for (const [key, content] of new URLSearchParams(value)) {
    if (allowed.has(key)) result.set(key, content);
  }
  return `/dashboard/operation-audits?${result}`;
}
