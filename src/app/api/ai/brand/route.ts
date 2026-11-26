import { z } from "zod";
import { brandManagementRuntime, brandManagementError } from "@/server/ai/brand-management";
import { assertAiPreview } from "../../../../../scripts/ai-digital-butler-preview-scope.mjs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store",Vary:"Cookie"};
export async function GET(request:Request) {
  try { assertAiPreview(); } catch { return Response.json({success:false,error:"此入口尚未開放。"},{status:404,headers}); }
  if(new URL(request.url).search) return Response.json({success:false,error:"不接受服務或門市覆寫。"},{status:400,headers});
  try { return Response.json({success:true,snapshot:await brandManagementRuntime().snapshot()},{headers}); }
  catch(e) { return Response.json(brandManagementError(e),{status:403,headers}); }
}
export async function POST(request:Request) {
  try { assertAiPreview(); } catch { return Response.json({success:false,error:"此入口尚未開放。"},{status:404,headers}); }
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")return Response.json({success:false,error:"來源驗證失敗。"},{status:403,headers});
  if(!request.headers.get("content-type")?.startsWith("application/json")||Number(request.headers.get("content-length")??0)>8192)return Response.json({success:false,error:"請求格式無效。"},{status:400,headers});
  try {
    const runtime=brandManagementRuntime();await runtime.assertAccess();
    const reader=request.body?.getReader();if(!reader)throw Error("INPUT_REQUIRED");
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192){await reader.cancel();throw Error("INPUT_LIMIT");}chunks.push(part.value);}
    const raw=Buffer.concat(chunks).toString("utf8");
    const body=z.object({command:z.enum(["review","knowledge","setting","handoffs","resume","handoff","test"]),input:z.unknown()}).strict().parse(JSON.parse(raw));
    const handlers={review:runtime.reviewKnowledge,knowledge:runtime.changeKnowledge,setting:runtime.saveSetting,handoffs:runtime.readHandoffs,resume:runtime.resume,handoff:runtime.setHandoff,test:runtime.test};
    return Response.json(await handlers[body.command](body.input),{headers});
  } catch(e) { return Response.json(brandManagementError(e),{status:403,headers}); }
}
