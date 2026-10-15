import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { settlementConfirmInput } from "@/lib/course-monthly-settlement";
import { readCourseMonthlySettlement } from "./course-monthly-settlement";

/** Caller authenticates, authorizes monthly confirmation and holds the store lock. */
export async function confirmCourseMonth(tx: Prisma.TransactionClient, actor: {storeId:string;userId:string}, input: unknown) {
  const d=settlementConfirmInput.parse(input);
  const report=await readCourseMonthlySettlement(tx,actor.storeId,d.month);
  if(report.fingerprint!==d.fingerprint)throw new AppError("CONFLICT","明細已變更，請重新整理核對");
  const last=report.revisions[0];
  if(last?.fingerprint===report.fingerprint)return;
  if((last?.revision??0)!==d.revision)throw new AppError("CONFLICT","已有新版月結，請重新整理");
  if(report.lines.some(l=>l.issue))throw new AppError("BUSINESS_RULE","仍有待核對明細，不能確認月結");
  await tx.$executeRaw`INSERT INTO "CourseMonthlySettlement" (id,"storeId",month,revision,fingerprint,snapshot,"actorUserId",reason) VALUES (${crypto.randomUUID()},${actor.storeId},${d.month},${d.revision+1},${d.fingerprint},${JSON.stringify(report.lines)}::jsonb,${actor.userId},${d.reason})`;
}
