import {withReadRequestMemo} from '@/server/services/read-request-memo';
import {OperationTiming} from '@/lib/operation-timing';
import {loadCourseRosterCustomer} from '@/server/actions/course-roster-customer';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 const raw=new URL(request.url).searchParams.get('args');
 if(!raw||raw.length>4000)return Response.json({success:false,error:'參數無效'},{status:400,headers});
 let input:unknown;try{input=JSON.parse(raw);}catch{return Response.json({success:false,error:'參數無效'},{status:400,headers});}
 return withReadRequestMemo(()=>withPermissionRequestSession(async()=>{
  const timing=new OperationTiming('roster-customer-read');
  try{const result=await timing.measure('workspace',()=>loadCourseRosterCustomer(input));return Response.json(result,{headers:{...headers,'Server-Timing':timing.serverTiming()}});}
  finally{timing.finish();}
 }));
}
