import {loadMusicPeriods} from '@/server/actions/music-periods';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 const customerId=new URL(request.url).searchParams.get('customerId');
 if(!customerId||customerId.length>200)return Response.json({success:false,error:'學員參數無效'},{status:400,headers});
 const started=performance.now();
 try{return Response.json(await loadMusicPeriods(customerId),{headers});}
 finally{console.info('[music-period-read-perf]',{durationMs:Math.round(performance.now()-started)});}
}
