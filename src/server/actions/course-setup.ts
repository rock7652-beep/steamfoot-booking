"use server";
import { cookies } from "next/headers";
import { courseManagerRead } from "@/server/services/course-access";
import { courseSetupCookieName } from "@/server/queries/course-setup";
export async function saveCourseSetupReminder(mode:"show"|"later"|"never") {
  try {
    if(!["show","later","never"].includes(mode))return {success:false as const,error:"提醒設定不正確"};
    const {user,storeId,isChildStoreView}=await courseManagerRead("booking.read");
    if(isChildStoreView||!["OWNER","ADMIN"].includes(user.role))return {success:false as const,error:"請由本店店長設定"};
    const jar=await cookies();
    jar.set(courseSetupCookieName(storeId,user.id),JSON.stringify({mode,login:jar.get("course-setup-login-v1")?.value??"existing-session"}),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:31536000});
    return {success:true as const};
  } catch { return {success:false as const,error:"提醒未儲存，請重試"}; }
}
