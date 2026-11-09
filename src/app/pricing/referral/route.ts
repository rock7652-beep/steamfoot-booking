import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
import { subscriptionReferralsReady } from "@/server/services/subscription-referral/runtime";
export async function GET(request:Request){
  if(!await subscriptionReferralsReady())return new Response("推薦活動尚未開通，請稍後再試。",{status:503,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"}});
  const user=await getCurrentUser();
  if(user && !["ADMIN","OWNER"].includes(user.role))return new Response("推薦碼僅由店家老闆帳戶領取，請先切換到正確帳戶。",{status:403,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"}});
  let destination="/hq/login?intent=subscription-referral";
  if(user?.role==="ADMIN")destination="/hq/dashboard/stores/referrals";
  else if(user?.role==="OWNER"){
    const storeId=await getActiveStoreForRead(user);
    const store=storeId?await prisma.store.findUnique({where:{id:storeId},select:{slug:true}}):null;
    if(store&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(store.slug))destination=`/s/${store.slug}/admin/dashboard/settings/subscription-referrals`;
  }
  const response=NextResponse.redirect(new URL(destination,request.url));response.headers.set("Cache-Control","no-store");response.headers.set("X-Robots-Tag","noindex, nofollow");return response;
}
