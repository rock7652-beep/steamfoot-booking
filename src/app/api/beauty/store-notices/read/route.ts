import {NextRequest,NextResponse} from 'next/server';
import {loadBeautyStoreNotices} from '@/server/actions/beauty-store-notices';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

// The existing loader validates the store, session, permissions and feature gates.
export async function POST(request:NextRequest){
 try{
  const result=await loadBeautyStoreNotices(await request.json());
  return NextResponse.json(result,{headers});
 }catch{
  return NextResponse.json({success:false,error:'通知讀取失敗'},{status:400,headers});
 }
}
