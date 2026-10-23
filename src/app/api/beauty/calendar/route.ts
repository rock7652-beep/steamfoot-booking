import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {beautyCalendar} from '@/server/beauty/queries';
import {getStoreContext} from '@/lib/store-context';
import {AppError,handleActionError} from '@/lib/errors';
import {dayRange,toLocalDateStr} from '@/lib/date-utils';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:NextRequest){
 try{
  const p=request.nextUrl.searchParams,date=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).parse(p.get('date')),calendar=z.enum(['day','week','month']).parse(p.get('calendar'));
  if(Number.isNaN(+dayRange(date).start)||toLocalDateStr(dayRange(date).start)!==date)throw new AppError('VALIDATION','日期不正確');
  const store=await getStoreContext();if(!store||store.storeSlug!==p.get('store'))throw new AppError('FORBIDDEN','店家已切換，請重新開啟');
  const native=z.enum(['0','1']).parse(p.get('native')??'0')==='1';
  if(native&&calendar!=='month')throw new AppError('VALIDATION','原版課表須讀取完整月份');
  const at=performance.now(),data=native?await beautyCalendar(date,calendar,true):await beautyCalendar(date,calendar);
  return NextResponse.json({success:true,data:{date:data.date,calendar:data.calendar,items:data.items,calendarDays:data.calendarDays,rentals:data.rentals}},{headers:{...headers,'Server-Timing':`calendar;dur=${(performance.now()-at).toFixed(1)}`}});
 }catch(e){const r=handleActionError(e);return NextResponse.json({success:false,error:r.success?'讀取失敗':r.error},{status:403,headers});}
}
