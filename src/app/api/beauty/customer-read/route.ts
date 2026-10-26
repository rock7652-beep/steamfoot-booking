import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {beautyManager} from '@/server/beauty/access';
import {AppError,handleActionError} from '@/lib/errors';
import {readBeautyCustomerSupport} from '@/server/beauty/customer-support-read';
import {readBeautyNativeSingleServices,browseBeautyNativeCards,readBeautyNativeCardReservations,readBeautyNativeCustomerBookings,readBeautyNativeCustomerPurchases,beautyNativeCheckoutCashStatus} from '@/server/actions/beauty-native-customers';
import {traceBeautyRead,beautyReadTimingHeader,beautyReadStep} from '@/server/beauty/read-timing';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
const schema=z.object({store:z.string().min(1).max(180),operation:z.enum(['cards','reservations','bookings','purchases','support','cash','services']),input:z.unknown(),offset:z.number().int().nonnegative().optional(),range:z.object({from:z.string().optional(),to:z.string().optional()}).optional()});
export async function POST(request:NextRequest){
 try{
  const d=schema.parse(await request.json());
  const result=await traceBeautyRead('customer.'+d.operation,async()=>{
   const actor=await beautyReadStep('scope_authorization',()=>beautyManager('customer.read'));
   if(actor.storeId!==d.store)throw new AppError('FORBIDDEN','店家已切換，請重新開啟');
   if(d.operation==='support')return readBeautyCustomerSupport(z.string().min(1).max(180).parse(d.input));
   return beautyReadStep('data',()=>beautyReadStepPort());
   async function beautyReadStepPort(){
    if(d.operation==='services')return readBeautyNativeSingleServices(d.input,d.offset);
    if(d.operation==='cards')return browseBeautyNativeCards(d.input);
    if(d.operation==='reservations')return readBeautyNativeCardReservations(d.input);
    if(d.operation==='bookings')return readBeautyNativeCustomerBookings(z.string().parse(d.input),d.offset,d.range);
    if(d.operation==='purchases')return readBeautyNativeCustomerPurchases(d.input,d.offset,d.range);
    return beautyNativeCheckoutCashStatus();
   }
  });
  return NextResponse.json(result.value,{headers:{...headers,'Server-Timing':beautyReadTimingHeader(result.timing),'X-Read-Trace':result.timing.traceId}});
 }catch(e){const r=handleActionError(e);return NextResponse.json({success:false,error:r.success?'讀取失敗':r.error},{status:403,headers});}
}
