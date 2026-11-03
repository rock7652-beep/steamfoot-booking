import {syncSportsPermanentCalendar} from "@/server/actions/sports-series";

const headers={"Cache-Control":"private, no-store"};
/** Preserve the existing authorized sync transaction, without a Server Action RSC render. */
export async function POST(request:Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({success:false,error:"來源不正確"},{status:403,headers});
  try {
    const body=await request.text();
    if(body.length>200)return Response.json({success:false,error:"請求過長"},{status:400,headers});
    const data=JSON.parse(body);
    if(typeof data?.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(data.date))return Response.json({success:false,error:"日期不正確"},{status:400,headers});
    return Response.json(await syncSportsPermanentCalendar(data.date),{headers});
  } catch {return Response.json({success:false,error:"課表同步失敗，請重試"},{status:400,headers});}
}
