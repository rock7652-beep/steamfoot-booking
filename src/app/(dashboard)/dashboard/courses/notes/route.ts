import {getCurrentUser} from "@/lib/session";
import {getActiveStoreForRead} from "@/lib/store";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {saveCourseCustomerNote} from "@/server/actions/course-customer-note";
const headers={"Cache-Control":"private, no-store"};
/** Keep note writes out of the browser's serialized background Server Action queue. */
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({success:false,error:"請從本站送出。"},{status:403,headers});
 try{
  const user=await getCurrentUser();if(!user)return Response.json({success:false,error:"請先登入。"},{status:401,headers});
  const storeId=await getActiveStoreForRead(user);if(!storeId||!(await sportsNativePreview(storeId)))return Response.json({success:false,error:"此入口僅適用運動模組。"},{status:403,headers});
  const body=await request.text();if(body.length>10000)return Response.json({success:false,error:"內容過長。"},{status:400,headers});
  const result=await saveCourseCustomerNote(JSON.parse(body));return Response.json(result,{headers});
 }catch{return Response.json({success:false,error:"尚未完成儲存，請確認連線後重試。"},{status:400,headers});}
}
