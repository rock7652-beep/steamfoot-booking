import "server-only";
import type {Prisma} from "@prisma/client";
export async function readSteamfootNoticeEnabled(db:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string) {
 const rows=await db.$queryRaw<Array<{enabled:boolean}>>`SELECT enabled FROM public."SteamfootNoticeSetting" WHERE "storeId"=${storeId}`;
 return rows[0]?.enabled??true;
}
