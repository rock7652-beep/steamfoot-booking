import "server-only";
import { z } from "zod";

/** Direct mutation transport: no RSC response and no shared response caching. */
export function settingsSavePOST<T>(schema:z.ZodType<T,z.ZodTypeDef,unknown>, save:(input:T)=>Promise<{success:boolean;uncertain?:boolean}>) {
  const headers={"Cache-Control":"private, no-store"};
  return async function POST(request:Request) {
    if(request.headers.get("origin")!==new URL(request.url).origin)
      return Response.json({success:false,error:"請從本站重新送出。"},{status:403,headers});
    let input:T;
    try{const body=await request.text();if(body.length>40000)throw new Error("payload too large");input=schema.parse(JSON.parse(body));}
    catch{return Response.json({success:false,error:"欄位格式有誤，請重新開啟後再編輯。"},{status:400,headers});}
    const started=performance.now();
    try{const result=await save(input);console.info("[SETTINGS_SAVE_ROUTE_PERF]",{outcome:result.success?"saved":"error",totalMs:Math.round(performance.now()-started)});return Response.json(result,{status:result.success?200:result.uncertain?503:400,headers});}
    catch{return Response.json({success:false,uncertain:true,error:"尚未確認儲存結果，請重試核對。"},{status:503,headers});}
  };
}
