import "server-only";
import { toLocalDateStr } from "@/lib/date-utils";
import { resolvedCourseHours, type Hour, type Special } from "@/lib/course-business-hours";
import { serviceDayRule, readServiceHoursState } from "@/server/services/service-hours-state";
import { readCourseBusinessProfile } from "@/server/services/course-business-profile";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { readAiKnowledgeDocument } from "./knowledge-repository";
import { type AiModule } from "./contracts";
import type { AiSql } from "./repository";

export type { AiKnowledgeSnapshot } from "./knowledge-projection";
import { projectAiKnowledge, type AiAuthority } from "./knowledge-projection";
function lines(rows: { text: string }[], prefix: string) {
  if (!rows.length || rows.length > 6) return null;
  const text = `${prefix}\n${rows.map(row => row.text).join("\n")}`;
  return text.length <= 800 ? text : null; // No silent truncation of commercial facts.
}
/** Only public catalogue fields. Never member benefits, discounts, availability or private costs. */
export async function readAiAuthority(storeId: string, references: { hours: boolean; services: boolean; prices: boolean }, now: Date): Promise<AiAuthority> {
  const industry = await getStoreIndustryModule(storeId);
  return prisma.$transaction(async tx => {
    const storeModule: AiModule = industry === "steamfoot" ? "STEAMFOOT" : industry === "beauty" ? "BEAUTY" : await readCourseBusinessProfile(tx, storeId);
    const result: AiAuthority = { module: storeModule, hours: null, services: null, prices: null };
    if (references.hours) {
      const date = toLocalDateStr(now);
      const state = await readServiceHoursState(tx, storeId);
      const rule = industry === "course" ? resolvedCourseHours(date, state.hours as Hour[], state.specials as Special[]) : serviceDayRule(state, date);
      const closed = rule.status === "closed" || rule.status === "training";
      result.hours = state.hours.length || state.specials.some(row => row.date.toISOString().slice(0,10) === date)
        ? `${date}（台灣時間）${closed ? "不營業" : rule.periods.length ? `營業時間：${rule.periods.map(p => `${p.openTime}–${p.closeTime}`).join("、")}` : "營業時間尚未設定，請洽門市"}。此資訊不代表可預約名額。` : null;
    }
    if (references.services) {
      const services = industry === "steamfoot"
        ? await tx.$queryRaw<{ text: string }[]>`SELECT name AS text FROM "ServicePlan" WHERE "storeId"=${storeId} AND "isActive" AND "publicVisible" ORDER BY id LIMIT 7`
        : industry === "beauty" ? await tx.$queryRaw<{ text: string }[]>`SELECT name || '（' || duration || ' 分鐘）' AS text FROM "BeautyService" WHERE "storeId"=${storeId} AND active ORDER BY id LIMIT 7`
        : await tx.$queryRaw<{ text: string }[]>`SELECT name || '（' || "durationMinutes" || ' 分鐘）' AS text FROM "CourseTemplate" WHERE "storeId"=${storeId} AND "isActive" AND visibility='PUBLIC' ORDER BY id LIMIT 7`;
      result.services = lines(services, "目前公開服務／課程：");
    }
    if (references.prices) {
      const prices = industry === "steamfoot"
        ? await tx.$queryRaw<{ text: string }[]>`SELECT name || '：NT$' || price AS text FROM "ServicePlan" WHERE "storeId"=${storeId} AND "isActive" AND "publicVisible" ORDER BY id LIMIT 7`
        : industry === "beauty" ? await tx.$queryRaw<{ text: string }[]>`SELECT name || '：NT$' || price AS text FROM "BeautyPlan" WHERE "storeId"=${storeId} AND active AND "customerPurchasable" ORDER BY id LIMIT 7`
        : await tx.$queryRaw<{ text: string }[]>`SELECT name || '：NT$' || price AS text FROM "CoursePointPlan" WHERE "storeId"=${storeId} AND "isActive" AND "customerPurchasable" ORDER BY id LIMIT 7`;
      result.prices = lines(prices, "目前可公開購買的方案定價（優惠、個人權益與實際交易請洽門市）：");
    }
    return result;
  }, { isolationLevel: "RepeatableRead" });
}
export async function loadAiPublishedKnowledge(sql: AiSql, storeId: string, now = new Date()) {
  const document = await readAiKnowledgeDocument(sql, storeId);
  let authority: AiAuthority;
  try { authority = await readAiAuthority(storeId, document.published?.references ?? { hours: false, services: false, prices: false }, now); }
  catch {
    // Still require an authoritative module. Never fall back to the submitted module.
    authority = await readAiAuthority(storeId, { hours: false, services: false, prices: false }, now);
    return { module: authority.module, records: [], prohibitedTerms: document.published?.prohibitedTerms ?? [], fingerprint: `unavailable-${document.publishedVersion}` };
  }
  try { return projectAiKnowledge(storeId, document, authority, now); }
  catch { return { module: authority.module, records: [], prohibitedTerms: document.published?.prohibitedTerms ?? [], fingerprint: `unavailable-${document.publishedVersion}` }; }
}
