import { isDeepStrictEqual } from "node:util";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  allowTrialRequest,
  trialApplicationDatabaseAllowed,
} from "@/server/services/trial-application-access";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { trialApplicationSchema } from "@/lib/trial-application";
import { notifyTrialApplication } from "@/server/services/trial-application-notification";
export const runtime = "nodejs";
const envelope = z
  .object({
    requestId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["save", "read"]),
    revision: z.number().int().positive().optional(),
    data: trialApplicationSchema.optional(),
    website: z.string().max(0).optional(),
  })
  .strict();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return reply({ error: "請從申請頁送出" }, 403);
  if (!trialApplicationDatabaseAllowed())
    return reply({ error: "預覽收件資料庫尚未設定；填寫內容會保留" }, 503);
  if (
    !allowTrialRequest(
      hash(req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"),
    )
  )
    return reply({ error: "操作較頻繁，請稍後再試" }, 429);
  if (Number(req.headers.get("content-length") ?? 0) > 3_000_000)
    return reply({ error: "資料過長" }, 413);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 3_000_000) return reply({ error: "資料過長" }, 413);
    body = envelope.safeParse(JSON.parse(raw));
  } catch {
    return reply({ error: "資料格式有誤" }, 400);
  }
  if (!body.success) return reply({ error: "請確認欄位內容" }, 400);
  const { requestId, token, action, data, revision } = body.data;
  try {
    let record = await prisma.trialApplication.findUnique({
      where: { requestId },
    });
    if (
      record &&
      !timingSafeEqual(
        Buffer.from(record.resumeTokenHash),
        Buffer.from(hash(token)),
      )
    )
      return reply({ error: "補件連結無效" }, 403);
    if (action === "read")
      return record
        ? reply({
            id: record.id,
            data: trialApplicationSchema.parse(record.payload),
            revision: record.revision,
            status: record.status,
          })
        : reply({ error: "找不到申請" }, 404);
    if (!data) return reply({ error: "請填申請資料" }, 400);
    if (record) {
      if (
        (revision === undefined || revision <= record.revision) &&
        isDeepStrictEqual(trialApplicationSchema.parse(record.payload), data)
      )
        return reply({
          id: record.id,
          revision: record.revision,
          status: record.status,
        });
      if (revision !== record.revision)
        return reply({ error: "資料已更新，請重新載入再補件" }, 409);
      const changed = await prisma.trialApplication.updateMany({
        where: { id: record.id, revision },
        data: {
          payload: data,
          storeName: data.storeName,
          contactEmail: data.email,
          revision: { increment: 1 },
          notificationStatus: "PENDING",
        },
      });
      if (!changed.count)
        return reply({ error: "資料已更新，請重新載入" }, 409);
      record = await prisma.trialApplication.findUniqueOrThrow({
        where: { requestId },
      });
    } else {
      // Different stores may share an email; only throttle repeated new requests for this same store.
      const recent = await prisma.trialApplication.count({
        where: {
          contactEmail: data.email,
          storeName: data.storeName,
          createdAt: { gte: new Date(Date.now() - 3_600_000) },
        },
      });
      if (recent >= 3)
        return reply({ error: "此門市已有近期申請，請使用原申請頁補件" }, 429);
      try {
        record = await prisma.trialApplication.create({
          data: {
            requestId,
            resumeTokenHash: hash(token),
            storeName: data.storeName,
            contactEmail: data.email,
            payload: data,
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        )
          throw error;
        record = await prisma.trialApplication.findUniqueOrThrow({
          where: { requestId },
        });
        if (
          !timingSafeEqual(
            Buffer.from(record.resumeTokenHash),
            Buffer.from(hash(token)),
          )
        )
          return reply({ error: "補件連結無效" }, 403);
        if (
          !isDeepStrictEqual(trialApplicationSchema.parse(record.payload), data)
        )
          return reply({ error: "申請已收件，請重新載入補件" }, 409);
      }
    }
    // A notification failure must never turn durable receipt into a failed save.
    try {
      if (record.notificationStatus === "PENDING") {
        const claim = await prisma.trialApplication.updateMany({
          where: {
            id: record.id,
            revision: record.revision,
            notificationStatus: "PENDING",
          },
          data: { notificationStatus: "SENDING" },
        });
        if (claim.count) {
          const notificationStatus = await notifyTrialApplication(record.id);
          await prisma.trialApplication.updateMany({
            where: {
              id: record.id,
              revision: record.revision,
              notificationStatus: "SENDING",
            },
            data: { notificationStatus },
          });
        }
      }
    } catch {
      try {
        await prisma.trialApplication.updateMany({
          where: {
            id: record.id,
            revision: record.revision,
            notificationStatus: "SENDING",
          },
          data: { notificationStatus: "FAILED" },
        });
      } catch {
        /* Durable receipt still succeeds. */
      }
    }
    return reply({
      id: record.id,
      revision: record.revision,
      status: record.status,
    });
  } catch {
    return reply({ error: "目前無法完成收件，資料已保留，請稍後再送出" }, 503);
  }
}
