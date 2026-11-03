import "server-only";
import { Prisma } from "@prisma/client";
import { musicReceiptScopeSql as existingReceiptScope } from "./music-finance-scope";
import { musicRetirementSql } from "./music-retirement-sql";
// Reuse the existing GitHub provenance lists without copying private identities.
export * from "./music-finance-scope";
export function musicReceiptScopeSql(storeId:string,kind:"purchase"|"refund"|"trial",value?:string) {
 const archived=musicRetirementSql(storeId,kind==="trial"?"CourseBooking":"CoursePurchase",kind==="purchase"?"id":kind==="refund"?'"purchaseId"':'"bookingId"');
 return Prisma.sql`${archived} ${existingReceiptScope(storeId,kind,value)}`;
}
