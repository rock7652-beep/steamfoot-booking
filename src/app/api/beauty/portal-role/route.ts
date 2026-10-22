import {NextRequest,NextResponse} from 'next/server';
import {beautyPortal} from '@/server/beauty/queries';
import {AppError,handleActionError} from '@/lib/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:NextRequest){
 try{
  const mode=request.nextUrl.searchParams.get('work'),slug=request.nextUrl.searchParams.get('store');
  if(!['0','1'].includes(mode??'')||!slug||slug.length>100)throw new AppError('VALIDATION','切換參數不正確');
  // beautyPortal always resolves the authenticated actor, store and current grants.
  // The supplied slug is only an integrity check, never an authorization source.
  const data=await beautyPortal(mode==='1');
  if(data.store.slug!==slug)throw new AppError('FORBIDDEN','店家已切換，請重新開啟本店入口');
  return NextResponse.json({success:true,data},{headers});
 }catch(e){const r=handleActionError(e);return NextResponse.json({success:false,error:r.success?'切換失敗':r.error},{status:403,headers});}
}
