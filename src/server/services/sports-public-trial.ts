import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { normalizePhone } from "@/lib/normalize";
import { getTrialSettings, clampTrialTotal, resolveCustomerBookingWindow } from "@/lib/shop-config";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import { courseSchedulingModeAllowed } from "@/lib/course-scheduling-modes";
import { courseTransaction } from "./course-access";
import { reserveCourseInTransaction } from "./course-booking";
import { assertSportsProductionReady } from "./sports-production-readiness";
import { readSportsSessionRule } from "./sports-staging-schedule";
import { resolveTrialBookingChatLink } from "./trial-booking-chat-link";
import { onboardCourseLineMember } from "./course-line-onboarding";
import { resolveVerifiedLineCustomer } from "./verified-line-customer";
import { courseChargeSnapshot } from "@/lib/course-charge-settings";
import { probeStoreLineRecipient } from "@/lib/line";

import { requireSportsPublicTrialStore } from "./sports-public-trial-store";

export type SportsTrialSlot = { courseId?: string; id: string; name: string; startsAt: string; endsAt: string; price: number; remaining: number };

function quotedPrice(snapshot: unknown, rulePrice: number, settings: Awaited<ReturnType<typeof getTrialSettings>>) {
  if (snapshot) {
    const quote = courseChargeSnapshot.safeParse(snapshot);
    if (!quote.success || quote.data.trialPrice === null) return null;
    return quote.data.trialPrice;
  }
  return clampTrialTotal(rulePrice, 1, settings);
}

export async function readSportsPublicTrial(slug: string) {
  const store = await requireSportsPublicTrialStore(slug);
  await assertStoreSubscriptionWritable(store.id);
  const [settings, rule, config] = await Promise.all([
    getTrialSettings(store.id), coursePrisma.courseBookingRule.findUnique({ where: { storeId: store.id } }),
    prisma.shopConfig.findUnique({ where: { storeId: store.id }, select: { bookingWindowDays: true, bookingOpensAt: true, bookableUntilDate: true } }),
  ]);
  const slots: SportsTrialSlot[] = [];
  if (!settings.trialEnabled || !courseSchedulingModeAllowed(rule, "OPEN")) return { store, slots };
  await assertSportsProductionReady(coursePrisma, store.id);
  const now = new Date(), window = resolveCustomerBookingWindow(config, now);
  if (window.opensAt && now < window.opensAt) return { store, slots };
  const sessions = await coursePrisma.courseSession.findMany({ where: {
    storeId: store.id, isTrial: true, cancelledAt: null, releasedAt: null,
    bookingAudience: { not: "ASSIGNED" }, enrollmentMode: { not: "ASSIGNED" },
    teacherAttendance: { notIn: ["LEAVE", "NO_SHOW"] },
    startsAt: { gt: new Date(now.getTime() + (rule?.bookingLeadMinutes ?? 0) * 60000), lte: window.closesAt },
    template: { isActive: true, visibility: "PUBLIC" },
  }, select: { id: true, templateId: true, nameSnapshot: true, startsAt: true, endsAt: true, capacity: true, chargeSnapshot: true,
    _count: { select: { bookings: { where: { status: { not: "CANCELLED" } } } } },
  }, orderBy: { startsAt: "asc" }, take: 200 });
  if (!sessions.length) return { store, slots };
  const rules = await coursePrisma.$queryRaw<Array<{ sessionId: string; enrollment: string; planId: string | null; trialPrice: number }>>`SELECT "sessionId",enrollment,"planId","trialPrice" FROM "SportsStagingSessionRule" WHERE "storeId"=${store.id} AND "sessionId"=ANY(${sessions.map(s => s.id)}::text[]) AND enrollment='OPEN' AND "planId" IS NULL`;
  const bySession = new Map(rules.map(r => [r.sessionId, r]));
  for (const session of sessions) {
    const sessionRule = bySession.get(session.id);
    if (!sessionRule || sessionRule.enrollment !== "OPEN" || sessionRule.planId !== null || session._count.bookings >= session.capacity) continue;
    const price = quotedPrice(session.chargeSnapshot, sessionRule.trialPrice, settings);
    if (price === null) continue;
    slots.push({ id: session.id, courseId: session.templateId, name: session.nameSnapshot, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(),
      price, remaining: session.capacity - session._count.bookings });
  }
  return { store, slots };
}

const inputSchema = z.object({
  sessionId: z.string().min(1).max(100), requestKey: z.string().uuid(),
  expectedPrice: z.number().int().min(0).max(1000000),
  name: z.string().trim().min(1).max(50), phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{8}$/)),
  consent: z.literal(true), entry: z.string().min(1).max(512),
}).strict();

export async function submitSportsPublicTrial(slug: string, input: unknown) {
  const d = inputSchema.parse(input), store = await requireSportsPublicTrialStore(slug);
  const config = getConfiguredStoreLine(slug);
  if (!config || config.storeId !== store.id) throw new AppError("FORBIDDEN", "本店 LINE 入口尚未設定");
  await assertStoreSubscriptionWritable(store.id);
  // The token's entropy proves ownership of a retry, without extending its
  // validity for a new booking. Do not return raw booking/customer records.
  const fingerprint = createHash("sha256").update(JSON.stringify(d)).digest("hex");
  const key = `sports-public:${d.requestKey}`;
  const receipt = { sessionId: d.sessionId, price: d.expectedPrice };
  const previous = await coursePrisma.courseBooking.findUnique({ where: { storeId_requestKey: { storeId: store.id, requestKey: key } } });
  if (previous) {
    if (previous.groupKey !== fingerprint) throw new AppError("CONFLICT", "預約請求已使用，請重新開啟表單");
    return receipt;
  }
  const entry = await resolveTrialBookingChatLink(d.entry);
  if (!entry || entry.storeId !== store.id || entry.channel !== "LINE" || entry.verifiedLogin || !/^U[0-9a-f]{32}$/.test(entry.chatIdentity))
    throw new AppError("FORBIDDEN", "請從本店 LINE 重新開啟體驗預約");
  if ((await probeStoreLineRecipient(store.id, entry.chatIdentity)).status !== "COMPATIBLE")
    throw new AppError("FORBIDDEN", "無法核對本店 LINE 身分，請聯繫店家");
  const identityProvider = storeLineIdentityProvider(config);
  const identity = { storeId: store.id, lineUserId: entry.chatIdentity, identityProvider };
  let member = await resolveVerifiedLineCustomer(store.id, entry.chatIdentity, { identityProvider });
  if (!member) {
    // Do not create a first-time membership for a closed/unavailable offer.
    // The transaction below remains authoritative if capacity changes later.
    const offer = (await readSportsPublicTrial(slug)).slots.find(slot => slot.id === d.sessionId);
    if (!offer || offer.price !== d.expectedPrice)
      throw new AppError("CONFLICT", "體驗課程或價格已更新，請重新整理後再選擇");
    const result = await onboardCourseLineMember({ ...identity, name: d.name, phone: d.phone, lineName: null });
    if (result.status !== "ok") throw new AppError("FORBIDDEN", "此資料需由門市核對，請聯繫店家協助預約");
    member = await resolveVerifiedLineCustomer(store.id, entry.chatIdentity, { identityProvider });
  }
  if (!member) throw new AppError("FORBIDDEN", "無法確認本店預約身分，請聯繫店家");
  const [settings, limits] = await Promise.all([getTrialSettings(store.id), getStoreLimitsByStoreId(store.id)]);
  await courseTransaction(store.id, async tx => {
    // Both retries and one-time capability redemption are protected by the
    // shared course store lock. Capacity checks and token use commit together.
    const committed = await tx.courseBooking.findUnique({ where: { storeId_requestKey: { storeId: store.id, requestKey: key } } });
    if (committed) {
      if (committed.groupKey !== fingerprint) throw new AppError("CONFLICT", "預約請求已使用");
      return;
    }
    const links = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "TrialBookingLink" WHERE id=${entry.linkId} AND "storeId"=${store.id} AND "consumedAt" IS NULL AND "expiresAt">NOW() FOR UPDATE`;
    if (links.length !== 1) throw new AppError("FORBIDDEN", "預約連結已失效，請重新開啟");
    const customers = await tx.$queryRaw<Array<{ id: string; lineLinkStatus: string }>>`SELECT c.id,c."lineLinkStatus"::text FROM "Customer" c
      JOIN "CustomerIdentityLink" l ON l."customerId"=c.id AND l."storeId"=c."storeId"
      JOIN "Account" a ON a."userId"=l."userId" AND a.provider=l.provider AND a."providerAccountId"=l."providerAccountId"
      JOIN "User" u ON u.id=l."userId"
      WHERE c.id=${member.id} AND c."storeId"=${store.id} AND c."mergedIntoCustomerId" IS NULL
      AND l.provider=${identityProvider} AND l."providerAccountId"=${entry.chatIdentity}
      AND l."userId"=${member.userId} AND u.status::text='ACTIVE'
      AND EXISTS (SELECT 1 FROM "Store" s WHERE s.id=c."storeId" AND s."industryModule"::text='COURSE' AND s."archivedAt" IS NULL AND s."operatingStatus"::text IN ('ACTIVE','TRIAL'))
      AND EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" e WHERE e."storeId"=c."storeId" AND e."featureKey"='business.fitness' AND e.status::text='ENABLED')
      AND NOT EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" e WHERE e."storeId"=c."storeId" AND e."featureKey"='business.music' AND e.status::text='ENABLED')`;
    if (!customers.length || customers[0].lineLinkStatus === "BLOCKED") throw new AppError("FORBIDDEN", "此身分需由門市核對");
    const currentSettings = await tx.$queryRaw<Array<Awaited<ReturnType<typeof getTrialSettings>>>>`SELECT "trialEnabled","trialDefaultPrice"::int AS "trialDefaultPrice","trialAllowPriceEdit","trialMinPrice"::int AS "trialMinPrice","trialMaxPrice"::int AS "trialMaxPrice" FROM "ShopConfig" WHERE "storeId"=${store.id}`;
    const pricing = currentSettings[0] ?? settings;
    if (!pricing.trialEnabled) throw new AppError("FORBIDDEN", "店家體驗功能已關閉");
    await assertSportsProductionReady(tx, store.id);
    const rule = await readSportsSessionRule(tx, store.id, d.sessionId);
    const session = await tx.courseSession.findFirst({ where: { id: d.sessionId, storeId: store.id }, select: { chargeSnapshot: true } });
    if (!rule || rule.enrollment !== "OPEN" || rule.planId !== null || !session || quotedPrice(session.chargeSnapshot, rule.trialPrice, pricing) !== d.expectedPrice)
      throw new AppError("CONFLICT", "體驗課程或價格已更新，請重新整理後再選擇");
    await reserveCourseInTransaction(tx, { storeId: store.id, userId: member.userId, name: member.name, customerId: member.id }, {
      sessionId: d.sessionId, customerId: member.id, cardId: null, trialPrice: d.expectedPrice, requestKey: key, groupKey: fingerprint,
    }, limits.maxMonthlyBookings, { sportsMemberTrial: true });
    await tx.$executeRaw`UPDATE "TrialBookingLink" SET "consumedAt"=NOW() WHERE id=${entry.linkId} AND "storeId"=${store.id}`;
  });
  return receipt;
}
