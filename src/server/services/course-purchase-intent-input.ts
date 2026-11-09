import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { courseCheckoutSchema } from "@/lib/course-checkout";
import { parseTaipeiDateTime } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";

const identity = z.object({
  planId: z.string().min(1).max(100), customerId: z.string().min(1).max(100),
  bookingId: z.string().min(1).max(100).optional(), requestKey: z.string().uuid(),
  expiresDate: z.string().refine(v => !!parseTaipeiDateTime(v, "00:00")),
});
export function parseCoursePurchaseIntentInput(input: unknown) {
  return { ...identity.parse(input), ...courseCheckoutSchema.parse(input) };
}
export type CoursePurchaseIntentInput = ReturnType<typeof parseCoursePurchaseIntentInput>;

/** Versioned, domain-separated keyed digest: never retain raw payment inputs. */
export function coursePurchaseIntentHmac(input: CoursePurchaseIntentInput): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new AppError("FORBIDDEN", "購買核對服務尚未設定，請聯絡管理員");
  return "v1:" + createHmac("sha256", secret).update("course-purchase-intent:v1\0").update(JSON.stringify(input)).digest("hex");
}
export function sameCoursePurchaseIntentHmac(a: string | null, b: string): boolean {
  if (!a || !/^v1:[0-9a-f]{64}$/.test(a) || !/^v1:[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a.slice(3), "hex"), Buffer.from(b.slice(3), "hex"));
}
