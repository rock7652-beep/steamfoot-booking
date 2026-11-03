import "server-only";
import { AppError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";
import { resolveSportsCoachCompensation } from "@/lib/sports-coach-compensation";

type Session = { id: string; templateId: string; coachId: string; startsAt: Date; endsAt: Date };
type Client = Pick<Prisma.TransactionClient, "courseCompensation" | "courseCompensationSnapshot">;

/** Call inside the existing scheduling transaction, after its authorization/locks. */
export async function captureSportsCoachCompensation(tx: Client, storeId: string, session: Session) {
  const key = { storeId, templateId: session.templateId };
  const individual = await tx.courseCompensation.findUnique({ where: { storeId_templateId_staffId: { ...key, staffId: session.coachId } } });
  const shared = !individual || Array.isArray(individual.rules) && individual.rules.length === 0
    ? await tx.courseCompensation.findUnique({ where: { storeId_templateId_staffId: { ...key, staffId: "" } } }) : null;
  const selected = resolveSportsCoachCompensation(individual, shared);
  if (!selected) return false;
  const durationMinutes = (session.endsAt.getTime() - session.startsAt.getTime()) / 60000;
  const rule = { ...selected.rule, calculationVersion: 3, source: selected.source, durationMinutes };
  const captured = { staffId: session.coachId, rule, revision: selected.revision, durationMinutes };
  await tx.courseCompensationSnapshot.upsert({ where: { sessionId: session.id }, create: { sessionId: session.id, storeId, ...captured }, update: captured });
  return true;
}

/** Time-only moves keep the captured rate; changing coach selects their own rate. */
export async function moveSportsCoachCompensation(tx: Client, storeId: string, session: Session, previousCoachId: string, previousTemplateId = session.templateId) {
  if (session.coachId !== previousCoachId || session.templateId !== previousTemplateId) {
    if (!await captureSportsCoachCompensation(tx, storeId, session))throw new AppError("VALIDATION","新教練的計酬設定待核對");
    return;
  }
  const snapshot = await tx.courseCompensationSnapshot.findUnique({ where: { sessionId: session.id } });
  if (!snapshot) return;
  const durationMinutes = (session.endsAt.getTime() - session.startsAt.getTime()) / 60000;
  await tx.courseCompensationSnapshot.update({ where: { sessionId: session.id }, data: { durationMinutes, rule: { ...(snapshot.rule as Prisma.JsonObject), durationMinutes } } });
}
