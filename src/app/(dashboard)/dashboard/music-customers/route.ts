import { courseManagerRead } from "@/server/services/course-access";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
import { getCourseCustomerPage } from "@/server/queries/course-customer-page";
import { checkPermission } from "@/lib/permissions";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const headers={"Cache-Control":"private, no-store"};
 try{
  const params=new URL(request.url).searchParams;
  if(params.toString().length>4000)return Response.json({success:false},{status:400,headers});
  const {user,storeId}=await courseManagerRead("customer.read",{reuseVerifiedStore:true});
  if(!musicDataSeparationEnabled(storeId))return Response.json({success:false},{status:403,headers});
  const canReadCards=await checkPermission(user.role,user.staffId,"wallet.read");
  const data=await getCourseCustomerPage(storeId,user.role,user.staffId,params,canReadCards,new Date(),true);
  return Response.json({success:true,data},{headers});
 }catch{return Response.json({success:false},{status:403,headers});}
}
