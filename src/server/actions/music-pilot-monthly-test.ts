"use server";
import { courseManager } from "@/server/services/course-access";
import { requireMusicFinance } from "@/server/services/music-finance-access";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError } from "@/lib/errors";
import { runMusicPilotMonthlyTest, type MonthlyPilotResult } from "@/server/services/music-pilot-monthly-test";
import { assertMusicOpeningPreviewEnvironment } from "../../../scripts/music-opening-preview-scope.mjs";
export type MonthlyPilotState={success:boolean;message:string;report?:MonthlyPilotResult};
/** Preview verification only; never expands the OWNER-only live payment actions. */
export async function testMusicPilotMonthly(_previous:MonthlyPilotState,form:FormData):Promise<MonthlyPilotState>{
  try{
    assertMusicOpeningPreviewEnvironment(process.env);
    if(form.get("confirmed")!=="yes")return {success:false,message:"請確認執行十人樣本測試，結束自動復原。"};
    const a=await courseManager("cashbook.create");
    if(a.storeId!=="store-lubymusic"||a.user.role!=="ADMIN")throw new AppError("FORBIDDEN","僅測試站管理者可執行自動復原驗證");
    await requireMusicFinance(a.user,a.storeId,"teacher.settlement.confirm");
    await requireMusicFinance(a.user,a.storeId,"teacher.settlement.pay");
    await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);
    await assertStoreSubscriptionWritable(a.storeId);
    const report=await runMusicPilotMonthlyTest({storeId:a.storeId,userId:a.user.id,name:a.user.name??"測試管理者"});
    return {success:true,message:"月結、發薪及點名更正驗證完成；原資料已自動復原。",report};
  }catch(e){return {success:false,message:e instanceof AppError?e.message:"測試未完成；交易已中止，未登錄實際發薪。請重新執行或聯絡管理者核對。"};}
}
