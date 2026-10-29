import { z } from "zod";
import { courseManagerRead } from "@/server/services/course-access";
import { musicNativeWorkflowEnabled } from "@/server/services/music-native-workflow";
import { fixedMusicPeriodsEnabled } from "@/server/services/music-lesson-periods";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { withPermissionRequestSession } from "@/lib/permission-request-session";

const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
export async function GET(request:Request) {
 return withPermissionRequestSession(async()=>{
  try {
   const customerId=z.string().min(1).max(100).parse(new URL(request.url).searchParams.get("customerId"));
   const actor=await courseManagerRead("customer.read");
   if(!musicNativeWorkflowEnabled(actor.storeId)||!fixedMusicPeriodsEnabled(actor.storeId))return Response.json({success:false},{status:403,headers});
   const [cards,bookings]=await Promise.all([checkPermission(actor.user.role,actor.user.staffId,"wallet.read"),checkPermission(actor.user.role,actor.user.staffId,"booking.read")]);
   if(!cards&&!bookings)return Response.json({success:false},{status:403,headers});
   const customer=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(actor.user.role,actor.user.staffId,actor.storeId),id:customerId,storeId:actor.storeId,mergedIntoCustomerId:null},select:{id:true}});
   if(!customer)return Response.json({success:false},{status:403,headers});
   const latest=await coursePrisma.coursePointCard.findFirst({where:{storeId:actor.storeId,members:{some:{storeId:actor.storeId,customerId}},NOT:{requestKey:{startsWith:"music-leave-makeup:"}}},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true}});
   return Response.json({success:true,revision:latest?.id??""},{headers});
  }catch{return Response.json({success:false},{status:403,headers});}
 });
}
