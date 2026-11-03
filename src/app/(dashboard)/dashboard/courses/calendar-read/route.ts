import {getCurrentUser} from "@/lib/session";
import {getActiveStoreForRead} from "@/lib/store";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {loadSportsCalendar} from "@/server/actions/sports-calendar";

const headers = {"Cache-Control": "private, no-store"};
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({success:false,error:"來源不正確"},{status:403,headers});
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({success:false,error:"請先登入"},{status:401,headers});
    const storeId = await getActiveStoreForRead(user);
    if (!storeId || !(await sportsNativePreview(storeId))) return Response.json({success:false,error:"此入口僅適用運動模組"},{status:403,headers});
    const body = await request.text();
    if (body.length > 200) return Response.json({success:false,error:"請求過長"},{status:400,headers});
    const data = JSON.parse(body);
    if (typeof data?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return Response.json({success:false,error:"日期不正確"},{status:400,headers});
    // Existing reader rechecks booking.read, entitlement, store scope and date. No fixed-series expansion.
    return Response.json(await loadSportsCalendar(data.date),{headers});
  } catch { return Response.json({success:false,error:"讀取失敗，請重試"},{status:400,headers}); }
}
