import "server-only";
import {prisma} from "@/lib/db";
import {spaPrisma} from "@/lib/spa-db";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {AppError} from "@/lib/errors";
import {readServiceHoursState,serviceHoursReceipt} from "./service-hours-state";
/** Callers must resolve an authorized read store before invoking this helper. */
export async function loadServiceHoursForSettings(storeId:string,date:string){
 const industry=await getStoreIndustryModule(storeId);if(industry==="course")throw new AppError("FORBIDDEN","請使用課程營業設定");
 const read=async(tx:Parameters<typeof readServiceHoursState>[0])=>serviceHoursReceipt(await readServiceHoursState(tx,storeId),date);
 return industry==="spa"?spaPrisma.$transaction(read,{isolationLevel:"RepeatableRead"}):prisma.$transaction(read,{isolationLevel:"RepeatableRead"});
}
