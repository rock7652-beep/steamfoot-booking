import { AppError, handleActionError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { musicSubjectSaveInput } from "@/lib/music-subject-save";
import { saveMusicSubjectWithReceipt } from "@/server/services/music-subject-save";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({success:false,error:"請從本站重新送出。"},{status:403,headers});
  let input;
  try {
    const body = await request.text();
    if (body.length > 20000) throw new Error("payload too large");
    input = musicSubjectSaveInput.parse(JSON.parse(body));
  } catch {
    return Response.json({success:false,error:"欄位格式有誤，請確認填寫內容。"},{status:400,headers});
  }
  try {
    const saved = await saveMusicSubjectWithReceipt(input);
    let syncWarning = false;
    try { revalidatePath("/dashboard/courses"); revalidatePath("/hq/dashboard/courses"); }
    catch { syncWarning = true; }
    return Response.json({success:true,...saved,syncWarning},{headers});
  } catch (error) {
    const uncertain = !(error instanceof AppError);
    return Response.json({...handleActionError(error),uncertain},{status:uncertain?503:400,headers});
  }
}
