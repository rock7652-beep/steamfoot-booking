import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/course-client";
import type { z } from "zod";
import { sportsFeeSetup } from "@/lib/sports-staging-types";
import { AppError } from "@/lib/errors";
import { requireSportsStaging } from "@/lib/sports-staging";
import { enqueueOperationAudit } from "./operation-audit-outbox";
export async function prepareSportsFee(
  tx: Prisma.TransactionClient,
  storeId: string,
  userId: string,
  planId: string,
  d: z.infer<typeof sportsFeeSetup>,
  unit: "POINT" | "SESSION",
) {
  requireSportsStaging(storeId);
  const {assertSportsProductionReady}=await import("./sports-production-readiness");
  await assertSportsProductionReady(tx,storeId);
  const subject = await tx.musicSubject.findFirst({
    where: { id: d.subject, storeId, isActive: true },
  });
  if (!subject) throw new AppError("VALIDATION", "請選上架教學項目");
  const prior = await tx.coursePointPlan.findFirst({
    where: { id: planId, storeId },
  });
  const oldTemplate = prior?.templateIds[0]
    ? await tx.courseTemplate.findFirst({
        where: { id: prior.templateIds[0], storeId },
      })
    : null;
  const same =
    oldTemplate &&
    oldTemplate.musicSubjectId === d.subject &&
    oldTemplate.pointCost === (unit === "POINT" ? d.cost : 1);
  const key = same
    ? oldTemplate.id
    : "sports_rule_" +
      createHash("sha256").update(`${storeId}:${d.requestKey}`).digest("hex");
  const template =
    (await tx.courseTemplate.findFirst({ where: { id: key, storeId } })) ??
    (await tx.courseTemplate.create({
      data: {
        id: key,
        storeId,
        name: `${subject.name} · ${key.slice(-6)}`,
        musicSubjectId: subject.id,
        classType: "GROUP",
        durationMinutes: 60,
        capacity: 8,
        pointCost: unit === "POINT" ? d.cost : 1,
      },
    }));
  for (const coachId of d.coachIds) {
    const staff = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "Staff" WHERE id=${coachId} AND "storeId"=${storeId} AND status::text='ACTIVE' AND "courseCoachEnabled"=true`;
    if (!staff.length) throw new AppError("VALIDATION", "授課教練不屬於本店");
    await tx.$executeRaw`UPDATE "Staff" SET "courseQualificationsConfirmed"=true,"courseQualifiedTemplateIds"=array_append(array_remove("courseQualifiedTemplateIds",${template.id}),${template.id}) WHERE id=${coachId} AND "storeId"=${storeId}`;
  }
  await enqueueOperationAudit(
    {
      actorUserId: userId,
      storeId,
      module: "FITNESS",
      targetType: "CourseTemplate",
      targetId: template.id,
      action: "SPORTS_FEE_RULE",
      summary: "設定收費適用課程與教練資格",
    },
    tx,
    d.requestKey,
  );
  return { templateId: template.id, storeCost: prior?.storeCost ?? 0 };
}
