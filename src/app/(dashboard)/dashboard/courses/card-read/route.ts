import {readCourseCards} from '@/server/queries/course-card-browser';
import {loadCourseCardProgress} from '@/server/actions/course-card-progress';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
import type {CourseCardsReadResult} from '@/lib/course-card-read-client';
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
  const progress:NonNullable<CourseCardsReadResult['progress']>=[];
  // Only the displayed page. Each progress read retains its own booking grant,
  // tenant, customer visibility and shared-card checks; no persistent server cache.
  for(let offset=0;offset<result.rows.length;offset+=2){
   progress.push(...await Promise.all(result.rows.slice(offset,offset+2).map(async card=>({cardId:card.id,result:await loadCourseCardProgress({cardId:card.id,customerId:args.customerId,expectedStoreId:progressStoreId,dataScope:args.dataScope})}))));
  }
  return Response.json({...result,progress},{headers});
 });
}
