import { normalizeAnnouncementImage } from "@/server/services/announcement-image";
import { beautySandboxSameOrigin } from "../../../../scripts/beauty-sandbox-qa-scope.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { announcementListSchema } from "@/lib/image-announcements";
import { handleActionError, AppError } from "@/lib/errors";

export const runtime = "nodejs";
const MAX_BODY = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    // Same-origin boundary for cookie-authenticated multipart writes.
    if (!beautySandboxSameOrigin(request.url, request.headers.get("origin"), process.env)) return NextResponse.json({ error: "請從後台操作" }, { status: 403 });
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    // Bind the submitted editor to its original store; changing the top-bar store
    // must never publish an old draft into the newly selected store.
    const declared = Number(request.headers.get("content-length"));
    if (declared > MAX_BODY) return NextResponse.json({ error: "圖片總大小過大，請縮小圖片後重試" }, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "缺少圖片資料");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return NextResponse.json({ error: "圖片總大小過大，請縮小圖片後重試" }, { status: 413 }); }
      chunks.push(value);
    }
    const body = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) }).formData();
    if (body.get("storeId") !== storeId) throw new AppError("FORBIDDEN", "門市已切換，請重新開啟圖片公告");
    const revision = Number(body.get("revision"));
    if (!Number.isSafeInteger(revision) || revision < 0) throw new AppError("VALIDATION", "版本有誤");
    const items = announcementListSchema.parse(JSON.parse(String(body.get("items"))));
    const uploads = new Map<string, { content: Uint8Array<ArrayBuffer>; mimeType: string }>();
    for (const item of items) {
      const file = body.get(item.id);
      if (file instanceof File) {
        if (!file.size || file.size > 700_000) throw new AppError("VALIDATION", "單張圖片請小於 700 KB");
        const content = new Uint8Array(await file.arrayBuffer());
        // Browser normalizes uploads to JPEG. Never accept SVG or arbitrary bytes.
        if (content[0] !== 0xff || content[1] !== 0xd8 || content[2] !== 0xff || content.at(-2) !== 0xff || content.at(-1) !== 0xd9) throw new AppError("VALIDATION", "圖片格式有誤，請重新上傳 JPG 或 PNG");
        uploads.set(item.id, { content: await normalizeAnnouncementImage(content), mimeType: "image/jpeg" });
      }
    }
    const result = await prisma.$transaction(async tx => {
      // Serialize first writes too, preventing concurrent saves from exceeding 5.
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
      const current = await tx.imageAnnouncementSet.findUnique({ where: { storeId } });
      if ((current?.revision ?? 0) !== revision) throw new AppError("BUSINESS_RULE", "圖片公告已由其他人更新，請重新整理後再操作");
      const existing = await tx.imageAnnouncementAsset.findMany({ where: { storeId }, select: { id: true } });
      for (const item of items) {
        const upload = uploads.get(item.id);
        if (upload) {
          if (existing.some(asset => asset.id === item.id)) throw new AppError("VALIDATION", "更換圖片時請使用新圖片");
          await tx.imageAnnouncementAsset.create({ data: { id: item.id, storeId, ...upload } });
        } else if (!existing.some(asset => asset.id === item.id)) throw new AppError("VALIDATION", "找不到圖片，請重新上傳");
      }
      await tx.imageAnnouncementSet.upsert({ where: { storeId }, create: { storeId, revision: 1, items }, update: { revision: { increment: 1 }, items } });
      await tx.imageAnnouncementAsset.deleteMany({ where: { storeId, id: { notIn: items.map(item => item.id) } } });
      return { revision: revision + 1, items };
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = handleActionError(error);
    return NextResponse.json({ error: result.success ? "儲存失敗" : result.error }, { status: error instanceof AppError && error.code === "FORBIDDEN" ? 403 : error instanceof AppError && error.code === "UNAUTHORIZED" ? 401 : 400 });
  }
}
