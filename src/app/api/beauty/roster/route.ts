import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {AppError,handleActionError} from '@/lib/errors';
import {beautyRosterContext,beautyRosterWhere,beautyRosterVersion,loadBeautyRoster} from '@/server/beauty/roster-read';
import {traceBeautyRead,beautyReadTimingHeader} from '@/server/beauty/read-timing';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:NextRequest){
 try{
  const p=request.nextUrl.searchParams,scope=z.string().min(1).max(200).parse(p.get('scope')),expected=z.string().min(1).max(180).parse(p.get('store'));
  const known=z.string().regex(/^[a-f0-9]{64}$/).nullable().parse(p.get('version'));
  const result=await traceBeautyRead(known?'roster.version':'roster.full',async()=>{
   const ctx=await beautyRosterContext();
   if(ctx.a.storeId!==expected)throw new AppError('FORBIDDEN','店家已切換，請重新開啟');
   const where=await beautyRosterWhere(ctx,scope),version=await beautyRosterVersion(ctx,where);
   if(known===version)return {success:true as const,version,unchanged:true as const};
   // Version is captured BEFORE the payload. A concurrent write cannot hide behind a newer token.
   const full=await loadBeautyRoster(ctx,where,version);
   return {...full,version,unchanged:false as const};
  });
  return NextResponse.json(result.value,{headers:{...headers,'Server-Timing':beautyReadTimingHeader(result.timing),'X-Read-Trace':result.timing.traceId}});
 }catch(e){const r=handleActionError(e);return NextResponse.json({success:false,error:r.success?'讀取失敗':r.error},{status:403,headers});}
}
