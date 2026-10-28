import {loadCourseStudentPurchase} from '@/server/actions/course-members';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

/** No mutations or cached financial data. The shared loader checks both grants,
 * active store membership and the booking's tenant before returning options. */
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const bookingId=params.get('bookingId');
 if(params.toString().length>500||!bookingId||bookingId.length>100)
  return Response.json({success:false,error:'預約不正確'},{status:400,headers});
 return Response.json(await loadCourseStudentPurchase(bookingId),{headers});
}
