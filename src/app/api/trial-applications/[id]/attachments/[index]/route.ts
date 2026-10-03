import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { trialApplicationSchema } from "@/lib/trial-application";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const user = await getCurrentUser();
  if (
    !user ||
    user.role !== "ADMIN" ||
    !(await checkPermission(user.role, user.staffId, "staff.manage"))
  )
    return new Response("無權限", { status: 403 });
  if (!trialApplicationDatabaseAllowed())
    return new Response("預覽附件尚未連接獨立資料庫", { status: 503 });
  const { id, index } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[0-2]$/.test(index))
    return new Response("找不到附件", { status: 404 });
  const record = await prisma.trialApplication.findUnique({ where: { id } });
  const parsed = trialApplicationSchema.safeParse(record?.payload);
  const file = parsed.success
    ? parsed.data.attachments[Number(index)]
    : undefined;
  if (!file) return new Response("找不到附件", { status: 404 });
  return new Response(Buffer.from(file.content, "base64"), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
