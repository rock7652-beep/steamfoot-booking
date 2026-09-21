import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { courseFeePaymentInput, courseFeeVoidInput, fixedCourseFee } from "@/lib/course-fee-payment";
import { lockCourseCashDay } from "./course-assignment-checkout";

/** Caller authenticates the owner, checks cashbook.create and holds the course store lock. */
export async function recordCourseFeePayment(tx: Prisma.TransactionClient, actor: {storeId: string; userId: string}, input: unknown) {
  const d = courseFeePaymentInput.parse(input);
  const {storeId, userId} = actor;
  const previous = await tx.$queryRaw<Array<{sessionId: string; amount: number; method: string; note: string; voidedAt: Date | null}>>`
    SELECT "sessionId", amount, method, note, "voidedAt" FROM "CourseFeePayment"
    WHERE "storeId"=${storeId} AND "requestKey"=${d.requestKey}`;
  if (previous[0]) {
    const p = previous[0];
    if (p.voidedAt) throw new AppError("CONFLICT", "原付款已更正，請重新開啟登錄");
    if (p.sessionId !== d.sessionId || p.amount !== d.expectedAmount || p.method !== d.method || p.note !== d.note)
      throw new AppError("CONFLICT", "此付款請求已使用，請重新核對");
    return;
  }
  const rows = await tx.$queryRaw<Array<{name: string; staffId: string; coachId: string; staffName: string; rule: unknown; endsAt: Date; cancelledAt: Date | null}>>`
    SELECT s."nameSnapshot" AS name, c."staffId", s."coachId", f."displayName" AS "staffName", c.rule, s."endsAt", s."cancelledAt"
    FROM "CourseSession" s JOIN "CourseCompensationSnapshot" c ON c."sessionId"=s.id AND c."storeId"=s."storeId"
    JOIN "Staff" f ON f.id=c."staffId" AND f."storeId"=s."storeId"
    WHERE s.id=${d.sessionId} AND s."storeId"=${storeId} FOR UPDATE OF s, c`;
  const row = rows[0];
  if (!row || row.cancelledAt || row.endsAt > new Date() || row.coachId !== row.staffId)
    throw new AppError("BUSINESS_RULE", "請核對已結束、未取消課次及授課教練");
  const amount = fixedCourseFee(row.rule);
  if (amount === null || amount !== d.expectedAmount || !Number.isSafeInteger(amount))
    throw new AppError("CONFLICT", "授課費與畫面不一致或需人工核對，尚未登錄付款");
  const paid = await tx.$queryRaw<Array<{id: string}>>`SELECT id FROM "CourseFeePayment" WHERE "storeId"=${storeId} AND "sessionId"=${d.sessionId} AND "voidedAt" IS NULL`;
  if (paid.length) throw new AppError("CONFLICT", "這堂課已登錄付款，請重新整理查看");
  const day = new Date(toLocalDateStr() + "T00:00:00Z");
  if (d.method === "CASH") await lockCourseCashDay(tx, storeId, day);
  const id = crypto.randomUUID();
  await tx.$executeRaw`INSERT INTO "CourseFeePayment" (id,"storeId","sessionId","staffId","staffNameSnapshot",amount,method,note,"requestKey","actorUserId")
    VALUES (${id},${storeId},${d.sessionId},${row.staffId},${row.staffName},${amount},${d.method},${d.note},${d.requestKey},${userId})`;
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt")
    VALUES (${"course-fee:" + id},${storeId},${day},'EXPENSE',${d.method}::"CashbookPaymentMethod",'課程授課費',${amount},${row.name + "／" + row.staffName + "／" + d.note},${row.staffId},${userId},NOW())`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt")
    VALUES (${crypto.randomUUID()},${userId},'CourseFeePayment',${id},'RECORD_PAYMENT',${JSON.stringify({storeId,sessionId:d.sessionId,staffId:row.staffId,amount,method:d.method,note:d.note,externalPaymentExecuted:false})}::jsonb,NOW())`;
}

/** Correct an erroneous registration; retain the payment and reverse its original entry. */
export async function voidCourseFeePayment(tx: Prisma.TransactionClient, actor: {storeId:string;userId:string}, input:unknown) {
  const d=courseFeeVoidInput.parse(input), {storeId,userId}=actor;
  const rows=await tx.$queryRaw<Array<{amount:number;method:string;voidedAt:Date|null;voidReason:string|null}>>`
    SELECT amount,method,"voidedAt","voidReason" FROM "CourseFeePayment" WHERE id=${d.paymentId} AND "storeId"=${storeId} FOR UPDATE`;
  const payment=rows[0];
  if(!payment)throw new AppError("NOT_FOUND","找不到本店付款");
  if(payment.voidedAt){if(payment.voidReason!==d.reason)throw new AppError("CONFLICT","此筆已更正，請重新核對");return;}
  const entries=await tx.$queryRaw<Array<{amount:unknown;entryDate:Date;type:string;paymentMethod:string}>>`
    SELECT amount,"entryDate",type::text,"paymentMethod"::text FROM "CashbookEntry" WHERE id=${"course-fee:"+d.paymentId} AND "storeId"=${storeId} FOR UPDATE`;
  const entry=entries[0];
  if(!entry||Number(entry.amount)!==payment.amount||entry.type!=="EXPENSE"||entry.paymentMethod!==payment.method)throw new AppError("CONFLICT","原支出與付款不一致，請先核對");
  if(payment.method==="CASH")await lockCourseCashDay(tx,storeId,entry.entryDate);
  await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt")
    SELECT ${"course-fee-void:"+d.paymentId},"storeId","entryDate",'INCOME',"paymentMethod",'授課費誤登沖回',amount,${d.reason},"staffId",${userId},NOW() FROM "CashbookEntry" WHERE id=${"course-fee:"+d.paymentId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "CourseFeePayment" SET "voidedAt"=NOW(),"voidReason"=${d.reason},"voidedBy"=${userId} WHERE id=${d.paymentId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt")
    VALUES (${crypto.randomUUID()},${userId},'CourseFeePayment',${d.paymentId},'VOID_REGISTRATION',${JSON.stringify({storeId,reason:d.reason,amount:payment.amount,externalPaymentExecuted:false})}::jsonb,NOW())`;
}
