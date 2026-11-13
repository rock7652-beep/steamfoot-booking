import {readCourseCards} from '@/server/queries/course-card-browser';
import {readCourseCardProgressBatch} from '@/server/services/course-card-progress-batch';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const raw=params.get('args');
 const progressStoreId=params.get('progressStoreId');
 if(progressStoreId!==null&&(!progressStoreId||progressStoreId.length>100))return Response.json({success:false,error:'參數無效'},{status:400,headers});
 if(!raw||raw.length>4000)return Response.json({success:false,error:'參數無效'},{status:400,headers});
 let input:unknown;
 try{input=JSON.parse(raw);}catch{return Response.json({success:false,error:'參數無效'},{status:400,headers});}
 // Both wallet/customer grants, visibility and tenant checks stay in the loader.
 return withPermissionRequestSession(async()=>{
  const result=await readCourseCards(input,false,undefined,true);
  const args=input as {customerId?:string;cardId?:string;dataScope?:'operational'|'legacy'};
  if(!result.success||!progressStoreId||!args.customerId||args.cardId)return Response.json(result,{headers});
  const progress=await readCourseCardProgressBatch({cardIds:result.rows.slice(0,20).map(card=>card.id),customerId:args.customerId,expectedStoreId:progressStoreId,dataScope:args.dataScope});
  return Response.json({...result,progress},{headers});
 });
}
