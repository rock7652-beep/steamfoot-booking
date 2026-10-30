import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {key} from '@/lib/beauty/contracts';
import {AppError,handleActionError} from '@/lib/errors';
import {beautyManager} from '@/server/beauty/access';
import {withBeautyReadScope} from '@/server/beauty/request-scope';
import {readBeautyCollection} from '@/server/actions/beauty';
import {readBeautyCollectionPurchaseIntent} from '@/server/actions/beauty-collection-intent';
import {traceBeautyRead,beautyReadTimingHeader} from '@/server/beauty/read-timing';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
const schema=z.object({store:key,operation:z.enum(['quote','status']),ids:z.array(key).min(1).max(12).refine(ids=>new Set(ids).size===ids.length),requestKey:z.string().uuid().optional()}).strict();
export async function POST(request:NextRequest){
 try{
  const input=schema.parse(await request.json());
  const result=await withBeautyReadScope(()=>traceBeautyRead('collection.'+input.operation+'.http',async()=>{
   const actor=await beautyManager('transaction.create');
   if(actor.storeId!==input.store)throw new AppError('FORBIDDEN','門市已切換，請重新開啟收款');
   // Reuse the original booking/feature/visibility/transaction gates. No writes are exposed here.
   return input.operation==='quote'?readBeautyCollection(input.ids):readBeautyCollectionPurchaseIntent({expectedStoreId:input.store,ids:input.ids,...(input.requestKey?{requestKey:input.requestKey}:{})});
  }));
  return NextResponse.json(result.value,{headers:{...headers,'Server-Timing':beautyReadTimingHeader(result.timing),'X-Read-Trace':result.timing.traceId}});
 }catch(error){const result=handleActionError(error);return NextResponse.json({success:false,error:result.success?'讀取失敗':result.error},{status:403,headers});}
}
