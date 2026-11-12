import {readCourseStaffTeaching} from '@/server/actions/course-staff';
import {withPermissionRequestSession} from '@/lib/permission-request-session';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 const staffId=new URL(request.url).searchParams.get('staffId');
 if(!staffId||staffId.length>180)return Response.json({success:false,error:'參數無效'},{status:400,headers});
 return Response.json(await withPermissionRequestSession(()=>readCourseStaffTeaching(staffId)),{headers});
}
