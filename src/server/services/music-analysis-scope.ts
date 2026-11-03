import { Prisma as RetirementPrisma } from "@prisma/client";
import { musicRetirementSql } from "./music-retirement-sql";
import "server-only";
import { Prisma } from "../../../generated/course-client";
import { musicDataScope, LEGACY_MUSIC_CUSTOMER_IDS, LEGACY_MUSIC_SESSION_IDS } from "./music-data-scope";
export function musicBookingCustomerWhere(storeId:string,value?:string):Prisma.CourseBookingWhereInput {
 const scope=musicDataScope(storeId,value);if(!scope)return {};
 return scope==="legacy"?{customerId:{in:LEGACY_MUSIC_CUSTOMER_IDS}}:{OR:[{customerId:null},{customerId:{notIn:LEGACY_MUSIC_CUSTOMER_IDS}}]};
}
/** Fixed SQL aliases b (booking) and s (session); values are always bound. */
export function musicAttendanceScopeSql(storeId:string,value?:string) {
 const scope=musicDataScope(storeId,value);if(!scope)return RetirementPrisma.empty;
 const retired=musicRetirementSql(storeId,"CourseSession","s.id");
 return scope==="legacy"
 ? RetirementPrisma.sql`${retired} AND s.id = ANY(${LEGACY_MUSIC_SESSION_IDS}::text[]) AND b."customerId" = ANY(${LEGACY_MUSIC_CUSTOMER_IDS}::text[])`
 : RetirementPrisma.sql`${retired} AND NOT(s.id = ANY(${LEGACY_MUSIC_SESSION_IDS}::text[])) AND (b."customerId" IS NULL OR NOT(b."customerId" = ANY(${LEGACY_MUSIC_CUSTOMER_IDS}::text[])))`;
}
