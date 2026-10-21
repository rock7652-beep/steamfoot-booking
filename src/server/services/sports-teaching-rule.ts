import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/course-client";
import type { SportsTeachingRule } from "@/lib/sports-teaching-rule";
import { sportsCompensation } from "@/lib/sports-staging-types";
import { AppError } from "@/lib/errors";

export function sportsTeachingTemplateId(storeId: string, subjectId: string) {
  return "sports_item_" + createHash("sha256").update(JSON.stringify([storeId, subjectId])).digest("hex");
}
export async function readSportsTeachingRule(tx: Prisma.TransactionClient, storeId: string, subjectId: string) {
  const templateId = sportsTeachingTemplateId(storeId, subjectId);
  const template = await tx.courseTemplate.findFirst({ where: { id: templateId, storeId } });
  if (!template) return undefined;
  const coaches = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Staff" WHERE "storeId"=${storeId} AND status::text='ACTIVE' AND "courseCoachEnabled"=true AND ${templateId}=ANY("courseQualifiedTemplateIds") ORDER BY id`;
  const fee = await tx.courseCompensation.findUnique({ where: { storeId_templateId_staffId: { storeId, templateId, staffId: "" } } });
  const parsed = sportsCompensation.safeParse((fee?.rules as unknown[])?.[0]);
  return { pointCost: template.pointCost, coachIds: coaches.map(c => c.id), expectedCoachIds: coaches.map(c => c.id), compensation: parsed.success ? parsed.data : { mode: "SHARE" as const, value: 60 }, expectedCompensation: parsed.success ? parsed.data : null };
}

/** Same canonical template is used by both enrollment modes and staff management. */
export async function saveSportsTeachingRule(tx: Prisma.TransactionClient, storeId: string, subject: { id: string; name: string }, rule: SportsTeachingRule, replay = false) {
  const templateId = sportsTeachingTemplateId(storeId, subject.id);
  const current = await readSportsTeachingRule(tx, storeId, subject.id);
  const sorted = (ids: string[]) => JSON.stringify([...new Set(ids)].sort());
  const same = current && current.pointCost === rule.pointCost && sorted(current.coachIds) === sorted(rule.coachIds) && JSON.stringify(current.compensation) === JSON.stringify(rule.compensation);
  if (replay) {
    if (!same) throw new AppError("CONFLICT", "教學項目規則已有更新，請重新開啟核對");
    return;
  }
  if (current && (sorted(current.coachIds) !== sorted(rule.expectedCoachIds) || JSON.stringify(current.expectedCompensation) !== JSON.stringify(rule.expectedCompensation)) && !same)
    throw new AppError("CONFLICT", "教練或計酬設定已有更新，請重新開啟核對");
  if(same&&current?.expectedCompensation!==null)return;
  const coaches = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Staff" WHERE "storeId"=${storeId} AND status::text='ACTIVE' AND "courseCoachEnabled"=true AND id=ANY(${rule.coachIds}::text[])`;
  if (coaches.length !== new Set(rule.coachIds).size) throw new AppError("VALIDATION", "請選擇本店有效授課教練");
  const removed = current?.coachIds.filter(id => !rule.coachIds.includes(id)) ?? [];
  if (removed.length && await tx.courseSession.count({ where: { storeId, templateId, coachId: { in: removed }, cancelledAt: null, endsAt: { gt: new Date() } } }))
    throw new AppError("CONFLICT", "教練仍有未結束課次，請先交接再移除資格");
  await tx.courseTemplate.upsert({ where: { id: templateId }, create: { id: templateId, storeId, name: `${subject.name} · ${templateId.slice(-6)}`, musicSubjectId: subject.id, classType: "GROUP", durationMinutes: 60, capacity: 8, pointCost: rule.pointCost }, update: { pointCost: rule.pointCost } });
  await tx.$executeRaw`UPDATE "Staff" SET "courseQualifiedTemplateIds"=array_remove("courseQualifiedTemplateIds",${templateId}),"updatedAt"=NOW() WHERE "storeId"=${storeId} AND id=ANY(${removed}::text[])`;
  await tx.$executeRaw`UPDATE "Staff" SET "courseQualificationsConfirmed"=true,"courseQualifiedTemplateIds"=array_append(array_remove("courseQualifiedTemplateIds",${templateId}),${templateId}),"updatedAt"=NOW() WHERE "storeId"=${storeId} AND id=ANY(${rule.coachIds}::text[])`;
  if(!current?.expectedCompensation||JSON.stringify(current.compensation)!==JSON.stringify(rule.compensation))await tx.courseCompensation.upsert({ where: { storeId_templateId_staffId: { storeId, templateId, staffId: "" } }, create: { storeId, templateId, staffId: "", rules: [rule.compensation] }, update: { rules: [rule.compensation], revision: { increment: 1 } } });
}
