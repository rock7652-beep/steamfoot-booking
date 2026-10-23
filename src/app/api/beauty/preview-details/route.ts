import {NextRequest,NextResponse} from 'next/server';
import {beautyPreviewSelection,readBeautyPreview} from '@/server/beauty/frontend-preview';
import {handleActionError} from '@/lib/errors';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 try{
  const q=request.nextUrl.searchParams;
  const selection=beautyPreviewSelection.parse({storeId:q.get('storeId'),personId:q.get('personId'),role:q.get('role')});
  const raw=q.get('input')??'null';if(raw.length>20000)throw Error('資料過長');
  const data=await readBeautyPreview(selection,q.get('kind')??'',JSON.parse(raw));
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const result=handleActionError(error);return NextResponse.json({success:false,error:result.success?'讀取失敗':result.error},{status:403,headers:{'Cache-Control':'private, no-store'}});}
}
