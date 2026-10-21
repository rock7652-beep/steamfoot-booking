import { beautySandboxSameOrigin } from "../../../../../../scripts/beauty-sandbox-qa-scope.mjs";
import { closeCashDrawerAction, reopenCashDrawerAction } from "@/server/actions/cash-drawer";
import { createCashDrawerCashbookEntry } from "@/server/services/cash-drawer-form";
const headers = { "Cache-Control": "private, no-store" };

/** Same authenticated actions, with a finite JSON response instead of a page/RSC render. */
export async function POST(request: Request) {
  if (!beautySandboxSameOrigin(request.url, request.headers.get("origin"), process.env)) {
    return Response.json({ success: false, error: "請從本站重新送出。" }, { status: 403, headers });
  }
  let form: FormData;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > 40000) throw new Error("payload too large");
    form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body }).formData();
    if ([...form.values()].some(v => typeof v !== "string")) throw new Error("files not accepted");
  } catch {
    return Response.json({ success: false, error: "欄位格式有誤，請重新核對。" }, { status: 400, headers });
  }
  const kind = form.get("kind"), sessionId = String(form.get("sessionId") ?? "");
  const result = kind === "CASHBOOK" ? await createCashDrawerCashbookEntry(form)
    : kind === "CLOSE" ? await closeCashDrawerAction({ sessionId, closingActualCash: Number(form.get("closingActualCash")), note: String(form.get("note") || "") || undefined })
    : kind === "REOPEN" ? await reopenCashDrawerAction({ sessionId, reason: String(form.get("reason") ?? "") })
    : { success: false as const, error: "不支援的操作" };
  return Response.json(result, { status: result.success ? 200 : 400, headers });
}
