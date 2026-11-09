import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { adjustmentMonth, type MonthlyAdjustment } from "@/lib/staff-monthly-adjustment";
type Reader = Pick<Prisma.TransactionClient,"$queryRaw">;
export async function readMonthlyAdjustments(storeId:string, month:string, db:Reader=prisma) {
  adjustmentMonth.parse(month);
  return db.$queryRaw<MonthlyAdjustment[]>`SELECT id,COALESCE("staffId","technicianId") AS "staffId",month,date,direction,amount,reason,revision FROM "StaffMonthlyAdjustment" WHERE "storeId"=${storeId} AND month=${month} AND "deletedAt" IS NULL ORDER BY date,id`;
}
export async function readAdjustmentMonth(storeId:string,month:string,db:Reader=prisma,source:string="course") {
  const rows=await db.$queryRaw<Array<{locked:boolean;revision:number}>>`SELECT locked,revision FROM "StaffAdjustmentMonth" WHERE "storeId"=${storeId} AND month=${month}`;
  if(rows[0])return rows[0];
  if(source==="steamfoot")return {locked:false,revision:0};
  const confirmed=source==="beauty"
    ? await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "BeautySettlement" WHERE "storeId"=${storeId} AND month=${month} LIMIT 1`
    : await db.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseMonthlySettlement" WHERE "storeId"=${storeId} AND month=${month} LIMIT 1`;
  return {locked:confirmed.length>0,revision:0};
}
export async function assertAdjustmentMonthOpen(db:Reader,storeId:string,month:string,source:string="course") {
  if((await readAdjustmentMonth(storeId,month,db,source)).locked) throw new AppError("CONFLICT","此月份已結算，請先重新開啟月結。");
}
// Caller holds Store FOR UPDATE, the same lock used by course month confirmation.
export async function setAdjustmentMonthLock(db:Pick<Prisma.TransactionClient,"$executeRaw">,storeId:string,month:string,locked:boolean) {
  await db.$executeRaw`INSERT INTO "StaffAdjustmentMonth" ("storeId",month,locked) VALUES (${storeId},${month},${locked}) ON CONFLICT ("storeId",month) DO UPDATE SET locked=EXCLUDED.locked,revision="StaffAdjustmentMonth".revision+1`;
}
