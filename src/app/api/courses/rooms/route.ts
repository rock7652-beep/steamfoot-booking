import { AppError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { courseRoomCreateInput } from "@/lib/course-room-input";
import { handleCourseActionError } from "@/server/services/course-resources";
import { createCourseRoomWithReceipt } from "@/server/services/course-room-create";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ success: false, error: "請從本站重新送出。" }, { status: 403, headers });
  }
  let input;
  try {
    const body = await request.text();
    if (body.length > 20000) throw new Error("payload too large");
    input = courseRoomCreateInput.parse(JSON.parse(body));
  } catch {
    return Response.json({ success: false, error: "欄位格式有誤，請確認填寫內容。" }, { status: 400, headers });
  }
  try {
    const saved = await createCourseRoomWithReceipt(input);
    // In a Route Handler this marks the next visit stale, without waiting for
    // the current page's RSC tree (schedule, roster, layout) to render again.
    let syncWarning = false;
    try {
      revalidatePath("/dashboard/courses");
      revalidatePath("/hq/dashboard/courses");
      revalidatePath("/dashboard");
    } catch { syncWarning = true; }
    return Response.json({ success: true, data: saved.room, storeId: saved.storeId, syncWarning }, { headers });
  } catch (error) {
    const uncertain = !(error instanceof AppError);
    return Response.json({ ...handleCourseActionError(error), uncertain }, { status: uncertain ? 503 : 400, headers });
  }
}
