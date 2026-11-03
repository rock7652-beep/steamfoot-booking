import "server-only";
import { Prisma } from "@prisma/client";
import { musicDataScope, LEGACY_MUSIC_CUSTOMER_IDS, LEGACY_MUSIC_SESSION_IDS } from "./music-data-scope";
// Read-only audit 2026-10-15: five purchases linked to verified synthetic students.
// Explicit purchase IDs prevent classifying future real purchases by customer alone.
export const LEGACY_MUSIC_PURCHASE_IDS = [
 "cmul2h4zv000bjs04804252xg", "cmul2m279000fjs04604xlb6h", "cmulad12p0003jv0479yo2wri",
 "cmulgwve00003le0474ulfyjw", "cmv8t1epm0003jq06gek4wyrf",
];
export function musicPurchaseWhere(storeId:string,value?:string|null) {
 const scope=musicDataScope(storeId,value??undefined);
 return scope ? {id:scope==="legacy"?{in:LEGACY_MUSIC_PURCHASE_IDS}:{notIn:LEGACY_MUSIC_PURCHASE_IDS}} : {};
}
export function musicTrialBookingWhere(storeId:string,value?:string|null) {
 const scope=musicDataScope(storeId,value??undefined);
 const legacy={OR:[{sessionId:{in:LEGACY_MUSIC_SESSION_IDS}},{customerId:{in:LEGACY_MUSIC_CUSTOMER_IDS}}]};
 return scope ? scope==="legacy" ? legacy : {AND:[{sessionId:{notIn:LEGACY_MUSIC_SESSION_IDS}},{OR:[{customerId:null},{customerId:{notIn:LEGACY_MUSIC_CUSTOMER_IDS}}]}]} : {};
}
export function musicReceiptScopeSql(storeId:string,kind:"purchase"|"refund"|"trial",value?:string) {
 const scope=musicDataScope(storeId,value);if(!scope)return Prisma.empty;
 const match=kind==="purchase"?Prisma.sql`id = ANY(${LEGACY_MUSIC_PURCHASE_IDS}::text[])`
 :kind==="refund"?Prisma.sql`"purchaseId" = ANY(${LEGACY_MUSIC_PURCHASE_IDS}::text[])`
 :Prisma.sql`"bookingId" IN (SELECT b.id FROM "CourseBooking" b WHERE b."storeId"=${storeId} AND (b."sessionId" = ANY(${LEGACY_MUSIC_SESSION_IDS}::text[]) OR b."customerId" = ANY(${LEGACY_MUSIC_CUSTOMER_IDS}::text[])))`;
 return Prisma.sql`AND COALESCE((${match}),false) = ${scope==="legacy"}`;
}
