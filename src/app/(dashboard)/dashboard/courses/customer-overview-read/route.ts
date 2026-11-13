import {withReadRequestMemo} from '@/server/services/read-request-memo';
import {OperationTiming} from '@/lib/operation-timing';
import {readCourseCustomerOverview} from '@/server/queries/customer-overview';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
import {courseManagerRead} from '@/server/services/course-access';
import {handleActionError} from '@/lib/errors';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
 const raw=new URL(request.url).searchParams.get('args');
 if(!raw||raw.length>4000)return Response.json({success:false,error:'參數無效'},{status:400,headers});
 let input:unknown;try{input=JSON.parse(raw);}catch{return Response.json({success:false,error:'參數無效'},{status:400,headers});}
 return withReadRequestMemo(()=>withPermissionRequestSession(async()=>{
  const timing=new OperationTiming('customer-primary-read');
  try{
   const actor=await timing.measure('authorization',()=>courseManagerRead('customer.read'));
   if(!input||typeof input!=='object'||!('storeId' in input)||input.storeId!==actor.storeId)return Response.json({success:false,error:'門市已變更，請重新開啟'},{status:403,headers});
   const result=await readCourseCustomerOverview(input,timing);
   return Response.json(result,{headers:{...headers,'Server-Timing':timing.serverTiming()}});
  }catch(error){const r=handleActionError(error);return Response.json({success:false,error:r.success?'讀取失敗，請重試':r.error},{status:403,headers});}finally{timing.finish();}
 }));
}
