"use server";
import { requireMusicHistoryIntegration } from "@/server/services/music-history-integration";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { commitMusicOperationalPilot } from "@/server/services/music-operational-pilot";
export type MusicOperationalPilotState={success:boolean;message:string};
export async function applyMusicOperationalPilot(_previous:MusicOperationalPilotState,form:FormData):Promise<MusicOperationalPilotState>{
  try{
    requireMusicHistoryIntegration();
    if(form.get("confirmed")!=="yes")return {success:false,message:"請先確認這是音樂教室的十人測試樣本。"};
    const result=await commitMusicOperationalPilot();
    revalidatePath("/dashboard/courses/source-pilot");revalidatePath("/dashboard/courses");revalidatePath("/dashboard/courses/opening-makeups");
    return {success:true,message:result.duplicate?"已核對同一批次，未重複增加堂數或預約。":"已銜接 7 個方案、28 堂課／46 筆預約及 1 堂待補課。舊收款保留原始日期。"};
  }catch(error){return {success:false,message:error instanceof AppError?error.message:"尚未取得完整匯入結果。請重新讀取此頁核對批次，勿另建不同批次。"};}
}
