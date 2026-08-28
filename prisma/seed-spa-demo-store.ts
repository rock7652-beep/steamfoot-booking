/**
 * Deterministic SPA Demo tenant seed.
 *
 * Preflight only (default): npm run seed:demo:spa
 * Apply after an explicit production-data approval:
 *   npm run seed:demo:spa -- --apply
 *
 * The script only upserts allowlisted ids under demo-store. It never deletes,
 * pauses, or updates a formal store.
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { parseTaiwanDateToDbDate } from "../src/lib/date-utils";
import { SPA_INDUSTRY_MODULE } from "../src/lib/industry-modules";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_STORE,
} from "../src/lib/spa-demo-store";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PASSWORD_HASH = hashSync("demo1234", 10);
const SPA_DEMO_FULL_ACCESS_PLAN = "ALLIANCE" as const;
const SPA_DEMO_DIGITAL_BUTLER_FEATURE = "digital_butler";

const STAFF = [
  { id: "spa-demo-owner", userId: "spa-demo-user-owner", email: "demo-spa-owner@steamfoot.tw", displayName: "林沐晴 店長", role: "OWNER" as const, isOwner: true, colorCode: "#8b6f5a" },
  { id: "spa-demo-staff-08", userId: "spa-demo-user-08", email: "demo-spa-08@steamfoot.tw", displayName: "08號 陳語安", role: "PARTNER" as const, isOwner: false, colorCode: "#c79275" },
  { id: "spa-demo-staff-10", userId: "spa-demo-user-10", email: "demo-spa-10@steamfoot.tw", displayName: "10號 張若琳", role: "PARTNER" as const, isOwner: false, colorCode: "#8fa89b" },
  { id: "spa-demo-staff-16", userId: "spa-demo-user-16", email: "demo-spa-16@steamfoot.tw", displayName: "16號 王心瑜", role: "PARTNER" as const, isOwner: false, colorCode: "#b49ab8" },
] as const;

const CUSTOMERS = [
  { id: "spa-demo-customer-lin", name: "林小姐", phone: "0911000001", staffId: "spa-demo-staff-08", stage: "TRIAL" as const, note: "首次到店，肩頸容易緊繃" },
  { id: "spa-demo-customer-zhang", name: "張小姐", phone: "0911000002", staffId: "spa-demo-staff-10", stage: "ACTIVE" as const, note: "偏好力道中等，避開左肩舊傷" },
  { id: "spa-demo-customer-zhou", name: "周小姐", phone: "0911000003", staffId: "spa-demo-staff-16", stage: "ACTIVE" as const, note: "單次服務，現場付款" },
  { id: "spa-demo-customer-wang", name: "王小姐", phone: "0911000004", staffId: "spa-demo-staff-08", stage: "ACTIVE" as const, note: "希望加強腰背" },
  { id: "spa-demo-customer-li", name: "李小姐", phone: "0911000005", staffId: "spa-demo-staff-10", stage: "ACTIVE" as const, note: "療程將於 9/30 到期" },
  { id: "spa-demo-customer-xu", name: "許小姐", phone: "0911000006", staffId: "spa-demo-staff-16", stage: "ACTIVE" as const, note: "固定每兩週保養" },
  { id: "spa-demo-customer-wu", name: "吳小姐", phone: "0911000007", staffId: "spa-demo-staff-08", stage: "ACTIVE" as const, note: "已完成服務" },
] as const;

const PLAN_IDS = Object.fromEntries(
  SPA_INDUSTRY_MODULE.services.map((service) => [service.name, `spa-demo-plan-${service.key}`]),
) as Record<string, string>;

const WALLET_DEFS = [
  { id: "spa-demo-wallet-zhang", customerId: "spa-demo-customer-zhang", planName: "深層芳療 10 次", total: 10, remaining: 6, expiry: "2027-02-28" },
  { id: "spa-demo-wallet-li", customerId: "spa-demo-customer-li", planName: "舒壓療程 5 次", total: 5, remaining: 3, expiry: "2026-09-30" },
  { id: "spa-demo-wallet-xu", customerId: "spa-demo-customer-xu", planName: "年度保養 12 次", total: 12, remaining: 8, expiry: "2027-06-30" },
  { id: "spa-demo-wallet-wu", customerId: "spa-demo-customer-wu", planName: "舒壓療程 3 次", total: 3, remaining: 1, expiry: "2026-10-31" },
] as const;

const BOOKING_CUSTOMERS: Record<string, string> = {
  "spa-demo-booking-lin": "spa-demo-customer-lin",
  "spa-demo-booking-zhang": "spa-demo-customer-zhang",
  "spa-demo-booking-zhou": "spa-demo-customer-zhou",
  "spa-demo-booking-wang": "spa-demo-customer-wang",
  "spa-demo-booking-li": "spa-demo-customer-li",
  "spa-demo-booking-xu": "spa-demo-customer-xu",
  "spa-demo-booking-before": "spa-demo-customer-wu",
};

const BOOKING_PLANS: Record<string, string> = {
  "spa-demo-booking-lin": "新客舒壓體驗 60 分鐘",
  "spa-demo-booking-zhang": "全身芳療單次 90 分鐘",
  "spa-demo-booking-zhou": "全身芳療單次 90 分鐘",
  "spa-demo-booking-wang": "全身芳療單次 90 分鐘",
  "spa-demo-booking-li": "舒壓療程 5 次",
  "spa-demo-booking-xu": "年度保養 12 次",
  "spa-demo-booking-before": "舒壓療程 3 次",
};

const BOOKING_WALLETS: Record<string, string | undefined> = {
  "spa-demo-booking-zhang": "spa-demo-wallet-zhang",
  "spa-demo-booking-li": "spa-demo-wallet-li",
  "spa-demo-booking-xu": "spa-demo-wallet-xu",
  "spa-demo-booking-before": "spa-demo-wallet-wu",
};

const PERMISSIONS = [
  "customer.read", "customer.create", "customer.update",
  "booking.read", "booking.create", "booking.update",
  "wallet.read", "wallet.create", "plans.edit",
  "business_hours.view", "business_hours.manage", "staff.view",
] as const;

async function preflight() {
  const collisions = await prisma.store.findMany({
    where: { OR: [{ id: SPA_DEMO_STORE.id }, { slug: SPA_DEMO_STORE.slug }] },
    select: { id: true, slug: true, isDemo: true },
  });
  if (collisions.length > 1) throw new Error("SPA_DEMO_STORE_ID_OR_SLUG_COLLISION");
  if (collisions[0]) assertSpaDemoStoreIdentity(collisions[0]);

  for (const identity of STAFF) {
    const user = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true, staff: { select: { storeId: true } } },
    });
    if (user && user.id !== identity.userId) {
      throw new Error(`SPA_DEMO_STAFF_EMAIL_ID_COLLISION:${identity.email}`);
    }
    if (user?.staff && user.staff.storeId !== SPA_DEMO_STORE.id) {
      throw new Error(`SPA_DEMO_STAFF_EMAIL_BELONGS_TO_FORMAL_STORE:${identity.email}`);
    }
  }

  const [staffRows, customerRows, planRows, walletRows, bookingRows] = await Promise.all([
    prisma.staff.findMany({ where: { id: { in: STAFF.map((item) => item.id) } }, select: { id: true, storeId: true } }),
    prisma.customer.findMany({ where: { id: { in: CUSTOMERS.map((item) => item.id) } }, select: { id: true, storeId: true } }),
    prisma.servicePlan.findMany({ where: { id: { in: Object.values(PLAN_IDS) } }, select: { id: true, storeId: true } }),
    prisma.customerPlanWallet.findMany({ where: { id: { in: WALLET_DEFS.map((item) => item.id) } }, select: { id: true, storeId: true } }),
    prisma.booking.findMany({ where: { id: { in: SPA_DEMO_BOOKINGS.map((item) => item.id) } }, select: { id: true, storeId: true } }),
  ]);
  for (const row of [...staffRows, ...customerRows, ...planRows, ...walletRows, ...bookingRows]) {
    if (row.storeId !== SPA_DEMO_STORE.id) {
      throw new Error(`SPA_DEMO_ALLOWLIST_ID_BELONGS_TO_FORMAL_STORE:${row.id}`);
    }
  }
}

async function applySeed() {
  await prisma.$transaction(async (tx) => {
    await tx.store.upsert({
      where: { id: SPA_DEMO_STORE.id },
      create: {
        id: SPA_DEMO_STORE.id,
        slug: SPA_DEMO_STORE.slug,
        name: SPA_DEMO_STORE.name,
        isDemo: true,
        plan: SPA_DEMO_FULL_ACCESS_PLAN,
        planStatus: "ACTIVE",
        digitalButlerEnabled: true,
      },
      update: {
        slug: SPA_DEMO_STORE.slug,
        name: SPA_DEMO_STORE.name,
        isDemo: true,
        plan: SPA_DEMO_FULL_ACCESS_PLAN,
        planStatus: "ACTIVE",
        digitalButlerEnabled: true,
      },
    });
    await tx.storeFeatureEntitlement.upsert({
      where: {
        uq_store_feature_entitlement: {
          storeId: SPA_DEMO_STORE.id,
          featureKey: SPA_DEMO_DIGITAL_BUTLER_FEATURE,
        },
      },
      create: {
        storeId: SPA_DEMO_STORE.id,
        featureKey: SPA_DEMO_DIGITAL_BUTLER_FEATURE,
        status: "ENABLED",
        source: "HQ_OVERRIDE",
        note: "SPA Demo 全功能展示授權",
      },
      update: {
        status: "ENABLED",
        source: "HQ_OVERRIDE",
        startsAt: null,
        expiresAt: null,
        note: "SPA Demo 全功能展示授權",
      },
    });
    await tx.shopConfig.upsert({
      where: { storeId: SPA_DEMO_STORE.id },
      create: { storeId: SPA_DEMO_STORE.id, shopName: SPA_DEMO_STORE.name, address: SPA_DEMO_STORE.address, mapUrl: SPA_DEMO_STORE.mapUrl, dutySchedulingEnabled: true },
      update: { shopName: SPA_DEMO_STORE.name, address: SPA_DEMO_STORE.address, mapUrl: SPA_DEMO_STORE.mapUrl, dutySchedulingEnabled: true },
    });

    for (const identity of STAFF) {
      await tx.user.upsert({
        where: { email: identity.email },
        create: { id: identity.userId, email: identity.email, name: identity.displayName, passwordHash: PASSWORD_HASH, role: identity.role },
        update: { name: identity.displayName, role: identity.role },
      });
      await tx.staff.upsert({
        where: { userId: identity.userId },
        create: { id: identity.id, userId: identity.userId, storeId: SPA_DEMO_STORE.id, displayName: identity.displayName, colorCode: identity.colorCode, isOwner: identity.isOwner },
        update: { displayName: identity.displayName, colorCode: identity.colorCode, isOwner: identity.isOwner },
      });
      for (const permission of PERMISSIONS) {
        await tx.staffPermission.upsert({
          where: { staffId_permission: { staffId: identity.id, permission } },
          create: { staffId: identity.id, permission, granted: true },
          update: { granted: true },
        });
      }
    }

    for (const [sortOrder, service] of SPA_INDUSTRY_MODULE.services.entries()) {
      await tx.servicePlan.upsert({
        where: { id: PLAN_IDS[service.name] },
        create: { id: PLAN_IDS[service.name], storeId: SPA_DEMO_STORE.id, name: service.name, category: service.category, price: service.price, sessionCount: service.sessions, validityDays: service.validityDays, sortOrder, isActive: true },
        update: { name: service.name, category: service.category, price: service.price, sessionCount: service.sessions, validityDays: service.validityDays, sortOrder, isActive: true },
      });
    }

    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      const isOpen = !SPA_INDUSTRY_MODULE.booking.closedWeekdays.includes(dayOfWeek);
      await tx.businessHours.upsert({
        where: { storeId_dayOfWeek: { storeId: SPA_DEMO_STORE.id, dayOfWeek } },
        create: { storeId: SPA_DEMO_STORE.id, dayOfWeek, isOpen, openTime: isOpen ? "10:00" : null, closeTime: isOpen ? "21:00" : null, slotInterval: 30, defaultCapacity: 1 },
        update: { isOpen, openTime: isOpen ? "10:00" : null, closeTime: isOpen ? "21:00" : null, slotInterval: 30, defaultCapacity: 1 },
      });
    }

    for (const customer of CUSTOMERS) {
      await tx.customer.upsert({
        where: { id: customer.id },
        create: { id: customer.id, storeId: SPA_DEMO_STORE.id, name: customer.name, phone: customer.phone, assignedStaffId: customer.staffId, customerStage: customer.stage, selfBookingEnabled: true, serviceNote: customer.note },
        update: { name: customer.name, phone: customer.phone, assignedStaffId: customer.staffId, customerStage: customer.stage, selfBookingEnabled: true, serviceNote: customer.note },
      });
    }

    for (const wallet of WALLET_DEFS) {
      const service = SPA_INDUSTRY_MODULE.services.find((candidate) => candidate.name === wallet.planName);
      if (!service) throw new Error(`SPA_DEMO_PLAN_MISSING:${wallet.planName}`);
      await tx.customerPlanWallet.upsert({
        where: { id: wallet.id },
        create: { id: wallet.id, storeId: SPA_DEMO_STORE.id, customerId: wallet.customerId, planId: PLAN_IDS[wallet.planName], purchasedPrice: service.price, totalSessions: wallet.total, remainingSessions: wallet.remaining, startDate: parseTaiwanDateToDbDate("2026-07-01"), expiryDate: parseTaiwanDateToDbDate(wallet.expiry), status: "ACTIVE" },
        update: { remainingSessions: wallet.remaining, expiryDate: parseTaiwanDateToDbDate(wallet.expiry), status: "ACTIVE" },
      });
      for (let sessionNo = 1; sessionNo <= wallet.total; sessionNo += 1) {
        const completed = sessionNo <= wallet.total - wallet.remaining;
        await tx.walletSession.upsert({
          where: { walletId_sessionNo: { walletId: wallet.id, sessionNo } },
          create: { id: `${wallet.id}-session-${sessionNo}`, walletId: wallet.id, sessionNo, status: completed ? "COMPLETED" : "AVAILABLE", completedAt: completed ? parseTaiwanDateToDbDate("2026-08-01") : null },
          update: { status: completed ? "COMPLETED" : "AVAILABLE", completedAt: completed ? parseTaiwanDateToDbDate("2026-08-01") : null },
        });
      }
    }

    for (const booking of SPA_DEMO_BOOKINGS) {
      const planName = BOOKING_PLANS[booking.id];
      const bookingStatus = booking.status === "已完成" ? "COMPLETED" : "CONFIRMED";
      await tx.booking.upsert({
        where: { id: booking.id },
        create: {
          id: booking.id,
          storeId: SPA_DEMO_STORE.id,
          customerId: BOOKING_CUSTOMERS[booking.id],
          bookingDate: parseTaiwanDateToDbDate(booking.date),
          slotTime: booking.time,
          revenueStaffId: booking.providerId,
          serviceStaffId: booking.providerId,
          bookedByType: "STAFF",
          bookedByStaffId: "spa-demo-owner",
          bookingType: booking.status === "新客體驗" ? "FIRST_TRIAL" : BOOKING_WALLETS[booking.id] ? "PACKAGE_SESSION" : "SINGLE",
          servicePlanId: PLAN_IDS[planName],
          customerPlanWalletId: BOOKING_WALLETS[booking.id] ?? null,
          bookingStatus,
          notes: `SPA_DEMO|${booking.note}`,
        },
        update: {
          bookingDate: parseTaiwanDateToDbDate(booking.date),
          slotTime: booking.time,
          serviceStaffId: booking.providerId,
          servicePlanId: PLAN_IDS[planName],
          customerPlanWalletId: BOOKING_WALLETS[booking.id] ?? null,
          bookingStatus,
          notes: `SPA_DEMO|${booking.note}`,
        },
      });
    }
  });
}

export async function runSpaDemoSeed(apply: boolean) {
  await preflight();
  if (!apply) {
    return { applied: false, staff: 0, customers: 0, previewBookings: 0 };
  }
  await applySeed();
  await preflight();
  const counts = await Promise.all([
    prisma.staff.count({ where: { storeId: SPA_DEMO_STORE.id } }),
    prisma.customer.count({ where: { storeId: SPA_DEMO_STORE.id } }),
    prisma.booking.count({ where: { storeId: SPA_DEMO_STORE.id, id: { in: SPA_DEMO_BOOKINGS.map((booking) => booking.id) } } }),
  ]);
  const fullAccess = await prisma.store.findUnique({
    where: { id: SPA_DEMO_STORE.id },
    select: {
      slug: true,
      isDemo: true,
      plan: true,
      planStatus: true,
      digitalButlerEnabled: true,
      featureEntitlements: {
        where: { featureKey: SPA_DEMO_DIGITAL_BUTLER_FEATURE },
        select: { featureKey: true, status: true, startsAt: true, expiresAt: true },
      },
    },
  });
  if (!fullAccess) throw new Error("SPA_DEMO_FULL_ACCESS_VERIFICATION_FAILED");
  assertSpaDemoStoreIdentity({ id: SPA_DEMO_STORE.id, ...fullAccess });
  if (
    fullAccess.plan !== SPA_DEMO_FULL_ACCESS_PLAN ||
    fullAccess.planStatus !== "ACTIVE" ||
    !fullAccess.digitalButlerEnabled ||
    fullAccess.featureEntitlements.length !== 1 ||
    fullAccess.featureEntitlements[0]?.status !== "ENABLED" ||
    fullAccess.featureEntitlements[0]?.startsAt !== null ||
    fullAccess.featureEntitlements[0]?.expiresAt !== null
  ) {
    throw new Error("SPA_DEMO_FULL_ACCESS_VERIFICATION_FAILED");
  }
  return { applied: true, staff: counts[0], customers: counts[1], previewBookings: counts[2] };
}

async function main() {
  console.log(`SPA Demo Seed: ${SPA_DEMO_STORE.name} (${SPA_DEMO_STORE.id})`);
  const result = await runSpaDemoSeed(APPLY);
  if (!result.applied) {
    console.log("Preflight passed. Dry run only; no data was written. Add --apply after explicit approval.");
    return;
  }
  console.log(`Applied and verified: staff=${result.staff}, customers=${result.customers}, previewBookings=${result.previewBookings}`);
}

if (!process.env.NEXT_RUNTIME) {
  main()
    .catch((error) => {
      console.error("SPA Demo Seed failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
