import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {beautyManager} from '@/server/beauty/access';
import {AppError,handleActionError} from '@/lib/errors';
import {readBeautyCustomerSupport} from '@/server/beauty/customer-support-read';
import {readBeautyNativeProgressBatch,readBeautyNativeCardProgress,readBeautyNativeSingleServices,browseBeautyNativeCards,readBeautyNativeCardReservations,readBeautyNativeCustomerBookings,readBeautyNativeCustomerPurchases,beautyNativeCheckoutCashStatus} from '@/server/actions/beauty-native-customers';
import {traceBeautyRead,beautyReadTimingHeader,beautyReadStep} from '@/server/beauty/read-timing';
import {withBeautyReadScope} from '@/server/beauty/request-scope';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
const schema=z.object({store:z.string().min(1).max(180),operation:z.enum(['overview','progress','cards','reservations','bookings','purchases','support','cash','services']),input:z.unknown(),offset:z.number().int().nonnegative().optional(),range:z.object({from:z.string().optional(),to:z.string().optional(),mode:z.enum(["all","upcoming"]).optional()}).optional()});
export async function POST(request:NextRequest){
 try{
  const d=schema.parse(await request.json());
  const result=await withBeautyReadScope(()=>traceBeautyRead('customer.'+d.operation,async()=>{
   const actor=await beautyReadStep('scope_authorization',()=>beautyManager('customer.read'));
   if(actor.storeId!==d.store)throw new AppError('FORBIDDEN','店家已切換，請重新開啟');
   if(d.operation==='overview'){
    const input=z.object({customerId:z.string().min(1).max(100),storeId:z.string(),cards:z.boolean(),bookings:z.boolean()}).parse(d.input);
    if(input.storeId!==d.store)throw new AppError('FORBIDDEN','店家已切換，請重新開啟');
    const [cards,next]=await Promise.all([input.cards?browseBeautyNativeCards({customerId:input.customerId,search:'',history:false,page:0}):undefined,input.bookings?readBeautyNativeCustomerBookings(input.customerId,0,{mode:'upcoming'}):undefined]);
    const progress=cards?.success&&input.bookings?await readBeautyNativeProgressBatch({cardIds:cards.rows.map(c=>c.id),customerId:input.customerId,expectedStoreId:d.store}):undefined;
    return {success:true,cards,next,beautyProgress:progress?.success?progress.rows:cards?.success&&progress?cards.rows.map(c=>({cardId:c.id,result:progress})):undefined};
   }
   if(d.operation==='support')return readBeautyCustomerSupport(z.string().min(1).max(180).parse(d.input));
   return beautyReadStep('data',()=>beautyReadStepPort());
   async function beautyReadStepPort(){
    if(d.operation==='progress')return readBeautyNativeCardProgress(d.input);
    if(d.operation==='services')return readBeautyNativeSingleServices(d.input,d.offset);
    if(d.operation==='cards')return browseBeautyNativeCards(d.input);
    if(d.operation==='reservations')return readBeautyNativeCardReservations(d.input);
    if(d.operation==='bookings')return readBeautyNativeCustomerBookings(z.string().parse(d.input),d.offset,d.range);
    if(d.operation==='purchases')return readBeautyNativeCustomerPurchases(d.input,d.offset,d.range);
    return beautyNativeCheckoutCashStatus();
   }
  }));
  return NextResponse.json(result.value,{headers:{...headers,'Server-Timing':beautyReadTimingHeader(result.timing),'X-Read-Trace':result.timing.traceId}});
 }catch(e){const r=handleActionError(e);return NextResponse.json({success:false,error:r.success?'讀取失敗':r.error},{status:403,headers});}
}
