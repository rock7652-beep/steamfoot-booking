import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { sportsProductionEnabled, sportsProductionRulesEnvironment } from "../../../scripts/sports-production-scope.mjs";
import { verifySportsProductionReadiness, verifySportsBookingReadiness } from "../../../scripts/sports-production-readiness.mjs";
import { verifySportsPermanentReadiness, verifySportsPermanentBookingCatalog } from "../../../scripts/sports-permanent-readiness.mjs";
type CatalogClient = Pick<Prisma.TransactionClient, "$queryRawUnsafe" | "$executeRawUnsafe">;
export async function assertSportsProductionReady(tx: CatalogClient, storeId: string) {
 if(!sportsProductionEnabled(storeId))return;
 await tx.$executeRawUnsafe("SET LOCAL search_path=pg_catalog,public");
 await verifySportsProductionReadiness(sql=>tx.$queryRawUnsafe<Array<Record<string,unknown>>>(sql));
 await verifySportsPermanentReadiness(sql=>tx.$queryRawUnsafe<Array<Record<string,unknown>>>(sql));
}
/** Read-only booking access never grants scheduling rights. */
export async function assertSportsBookingReadReady(tx: CatalogClient, storeId: string) {
 if(!sportsProductionEnabled(storeId))return;
 await tx.$executeRawUnsafe("SET LOCAL search_path=pg_catalog,public");
 await verifySportsBookingReadiness(sql=>tx.$queryRawUnsafe<Array<Record<string,unknown>>>(sql));
 await verifySportsPermanentBookingCatalog(sql=>tx.$queryRawUnsafe<Array<Record<string,unknown>>>(sql));
}
export async function sportsRulesAvailable(tx: CatalogClient, storeId: string) {
 const {sportsStagingEnabled}=await import("@/lib/sports-staging");
 if((await sportsStagingEnabled(storeId)))return true;
 if(!sportsProductionRulesEnvironment())return false;
 const [row]=await tx.$queryRawUnsafe<Array<{present:boolean}>>("SELECT to_regclass('public.\"SportsStagingSessionRule\"') IS NOT NULL AS present");
 return row?.present===true;
}
