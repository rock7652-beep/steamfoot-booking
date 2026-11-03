import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getStoreContext} from '@/lib/store-context';
import {AppError,handleActionError} from '@/lib/errors';
import {readBeautyCardHistory,readBeautyOwnIncome,readBeautyWorkRecords} from '@/server/actions/beauty-portal';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
/** Read-only transport: never asks the Server Action protocol to rerender the portal. */
export async function GET(request:NextRequest){
 try{
  const p=request.nextUrl.searchParams,kind=z.enum(['history','income','records']).parse(p.get('kind'));
  const expected=z.string().min(1).max(100).parse(p.get('store'));
  const context=await getStoreContext();
  if(!context||context.storeSlug!==expected)throw new AppError('FORBIDDEN','店家已切換，請重新開啟本店入口');
  // Each existing reader rechecks the session, store, feature and actual member/technician.
  const result=kind==='history'
   ? await readBeautyCardHistory(z.string().min(1).max(100).parse(p.get('card')))
   : kind==='income'
   ? await readBeautyOwnIncome(z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).parse(p.get('month')))
   : await readBeautyWorkRecords({month:p.get('month'),pending:z.enum(['0','1']).parse(p.get('pending'))==='1',search:p.get('search')??'',page:z.coerce.number().int().min(0).max(10000).parse(p.get('page')??'0')});
  return NextResponse.json(result,{status:result.success?200:403,headers});
 }catch(e){const r=handleActionError(e);return NextResponse.json({success:false,error:r.success?'讀取失敗':r.error},{status:403,headers});}
}
