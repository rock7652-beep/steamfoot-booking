import { NextRequest,NextResponse } from 'next/server';
import { readBeautyMemberPlanSnapshot } from '@/server/beauty/member-plan-snapshot';
import { AppError } from '@/lib/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:NextRequest){
  try {
    const slug=request.nextUrl.searchParams.get('store');
    if(!slug||slug.length>100)throw new AppError('VALIDATION','門市資料不正確');
    return NextResponse.json({success:true,data:await readBeautyMemberPlanSnapshot(slug)},{headers});
  } catch(error) {
    const denied=error instanceof AppError&&(error.code==='UNAUTHORIZED'||error.code==='FORBIDDEN');
    return NextResponse.json({success:false,error:denied?'會員或門市狀態已變更，請重新登入':'方案狀態暫時無法更新，請稍後再試'},{status:denied?403:503,headers});
  }
}
