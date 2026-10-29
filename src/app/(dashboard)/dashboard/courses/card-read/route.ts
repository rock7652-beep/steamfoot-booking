import {readCourseCards} from '@/server/queries/course-card-browser';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 const raw=new URL(request.url).searchParams.get('args');
 if(!raw||raw.length>4000)return Response.json({success:false,error:'參數無效'},{status:400,headers});
 let input:unknown;
 try{input=JSON.parse(raw);}catch{return Response.json({success:false,error:'參數無效'},{status:400,headers});}
 // Both wallet/customer grants, visibility and tenant checks stay in the loader.
 return Response.json(await readCourseCards(input),{headers});
}
