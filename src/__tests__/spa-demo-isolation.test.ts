import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { assertStoreAccess, getStoreFilter } from "@/lib/manager-visibility";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_OWNER_STAFF_ID,
  SPA_DEMO_PROVIDERS,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";

describe("SPA Demo tenant isolation", () => {
  it("keeps the staff sync preview outside production", () => {
    const source = readFileSync("src/app/(liff)/liff/staff-preview/page.tsx", "utf8");
    const schedule = readFileSync(
      "src/app/(liff)/liff/_components/spa-staff-schedule-preview.tsx",
      "utf8",
    );
    expect(source).toContain('process.env.VERCEL_ENV === "production"');
    expect(source).toContain("getSpaDemoPreviewData");
    expect(schedule).toContain("booking.providerId === provider.id");
    expect(schedule).toContain("booking.date === selectedDate");
    expect(schedule).toContain('aria-label="行程日期"');
  });

  it("accepts only the immutable demo id + slug + isDemo identity", () => {
    expect(() => assertSpaDemoStoreIdentity({ id: "demo-store", slug: "demo", isDemo: true })).not.toThrow();
    expect(() => assertSpaDemoStoreIdentity({ id: "demo-store", slug: "demo", isDemo: false })).toThrow("SPA_DEMO_STORE_IDENTITY_MISMATCH");
    expect(() => assertSpaDemoStoreIdentity({ id: "formal-store", slug: "demo", isDemo: true })).toThrow("SPA_DEMO_STORE_IDENTITY_MISMATCH");
    expect(() => assertSpaDemoStoreIdentity({ id: "demo-store", slug: "formal", isDemo: true })).toThrow("SPA_DEMO_STORE_IDENTITY_MISMATCH");
  });

  it("blocks formal staff from Demo and Demo staff from formal stores", () => {
    expect(() => assertStoreAccess({ role: "OWNER", storeId: "formal-store" }, SPA_DEMO_STORE.id)).toThrow(AppError);
    expect(() => assertStoreAccess({ role: "OWNER", storeId: SPA_DEMO_STORE.id }, "formal-store")).toThrow(AppError);
    expect(getStoreFilter({ role: "OWNER", storeId: SPA_DEMO_STORE.id })).toEqual({ storeId: SPA_DEMO_STORE.id });
    expect(getStoreFilter({ role: "OWNER", storeId: "formal-store" })).toEqual({ storeId: "formal-store" });
  });

  it("allows headquarters to select the Demo store through an explicit store view", () => {
    expect(getStoreFilter({ role: "ADMIN" }, SPA_DEMO_STORE.id)).toEqual({ storeId: SPA_DEMO_STORE.id });
  });

  it("keeps the Seed opt-in, idempotent, and free of destructive operations", () => {
    const source = readFileSync("prisma/seed-spa-demo-store.ts", "utf8");
    expect(source).toContain('process.argv.includes("--apply")');
    expect(source).toContain("assertSpaDemoStoreIdentity");
    expect(source).toContain("SPA_DEMO_STAFF_EMAIL_BELONGS_TO_FORMAL_STORE");
    expect(source).toContain("SPA_DEMO_ALLOWLIST_ID_BELONGS_TO_FORMAL_STORE");
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain('const SPA_DEMO_FULL_ACCESS_PLAN = "ALLIANCE"');
    expect(source).toContain('const SPA_DEMO_DIGITAL_BUTLER_FEATURE = "digital_butler"');
    expect(source).toContain('source: "HQ_OVERRIDE"');
    expect(source).toContain("identity.isOwner ? ALL_PERMISSIONS : PROVIDER_PERMISSIONS");
    expect(source).toContain("SPA_DEMO_FULL_ACCESS_VERIFICATION_FAILED");
    expect(source).not.toMatch(/\.(delete|deleteMany|updateMany)\s*\(/);
  });

  it("gives the isolated Demo owner full navigation and exposes complete provider profiles", () => {
    const permissions = readFileSync("src/lib/permissions.ts", "utf8");
    const sidebar = readFileSync("src/components/sidebar.tsx", "utf8");
    const staffPage = readFileSync("src/app/(dashboard)/dashboard/staff/page.tsx", "utf8");
    const staffWorkspace = readFileSync("src/app/(dashboard)/dashboard/staff/staff-workspace.tsx", "utf8");
    const schedule = readFileSync("src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx", "utf8");

    expect(SPA_DEMO_OWNER_STAFF_ID).toBe("spa-demo-owner");
    expect(permissions).toContain("staffId === SPA_DEMO_OWNER_STAFF_ID");
    expect(sidebar.indexOf('href: "/dashboard/staff"')).toBeLessThan(
      sidebar.indexOf('href: "/dashboard/settings"'),
    );
    expect(staffPage).toContain("StaffWorkspace");
    expect(staffWorkspace).toContain("專業項目");
    expect(staffWorkspace).toContain("固定班表");
    expect(staffWorkspace).toContain("請假／臨時加班");
    expect(staffWorkspace).toContain("不必逐時段新增");
    expect(staffWorkspace).toContain("緊急聯絡人");
    expect(schedule).toContain("sticky top-0 z-30");
    expect(schedule).toContain('className="min-h-[460px] flex-1 overflow-auto"');
    expect(SPA_DEMO_PROVIDERS.every((provider) => provider.specialties && provider.emergencyContact.phone)).toBe(true);
  });

  it("keeps customer mobile and manager tablet/desktop previews separate", () => {
    const customer = readFileSync(
      "src/app/(liff)/liff/design-preview/page.tsx",
      "utf8",
    );
    const customerBooking = readFileSync(
      "src/app/(liff)/liff/design-preview/booking/page.tsx",
      "utf8",
    );
    const manager = readFileSync(
      "src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx",
      "utf8",
    );
    expect(customer).not.toContain("ModulePreviewSwitcher");
    expect(customer).not.toContain("SpaServiceComposerPreview");
    expect(customer).toContain("bookingHref");
    expect(customerBooking).toContain("SpaServiceComposerPreview");
    expect(customerBooking).toContain("initialCompletedBooking");
    expect(customerBooking).toContain("SPA_DEMO_LIVE_FLOW_BOOKING_IDS");
    expect(manager).not.toContain("ModulePreviewSwitcher");
    expect(manager).not.toContain("桌機、iPad 與手機共用同一套排程");
    expect(manager).toContain('"預約右側操作面板"');
    expect(manager).toContain('aria-label="每日營運與帳務總覽"');
    expect(manager).toContain('"每日帳務右側明細面板"');
    expect(manager).toContain('aria-label="查詢日期"');
    expect(manager).toContain('"每日帳務核對右側面板"');
    expect(manager).toContain("確認本日帳務");
    expect(manager).toContain("整組付款只計算一次");
    expect(manager).toContain("DailyGroupDetail");
    expect(manager).toContain('className="overflow-x-auto"');
    expect(manager).not.toContain("請使用 iPad 或桌機開啟");
    expect(manager).not.toContain("md:hidden");
    expect(manager).toContain("完成服務與結帳");
    expect(manager).not.toContain("確認到店");
    expect(manager).not.toContain("開始服務");
  });

  it("keeps daily reconciliation durable and restricted to the Demo store", () => {
    const action = readFileSync(
      "src/server/actions/spa-demo-daily-reconciliation.ts",
      "utf8",
    );
    const query = readFileSync(
      "src/server/queries/spa-demo-daily-reconciliation.ts",
      "utf8",
    );

    expect(action).toContain('process.env.VERCEL_ENV === "production"');
    expect(action).toContain("storeId: SPA_DEMO_STORE.id");
    expect(action).toContain('triggeredBy: "spa_demo_manager"');
    expect(action).toContain('summary.reconciliationStatus !== "READY"');
    expect(query).toContain("storeId: SPA_DEMO_STORE.id");
    expect(query).toContain('triggeredBy: "spa_demo_manager"');
  });

  it("connects one fixed Demo customer booking to manager and provider views", () => {
    const composer = readFileSync(
      "src/app/(liff)/liff/_components/spa-service-composer-preview.tsx",
      "utf8",
    );
    const action = readFileSync(
      "src/server/actions/spa-demo-customer-booking.ts",
      "utf8",
    );
    const previewQuery = readFileSync(
      "src/server/queries/spa-demo-preview.ts",
      "utf8",
    );
    const providerPage = readFileSync(
      "src/app/(service-workspace)/staff-schedule/page.tsx",
      "utf8",
    );
    const checkout = readFileSync(
      "src/server/actions/spa-demo-checkout.ts",
      "utf8",
    );
    const manager = readFileSync(
      "src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx",
      "utf8",
    );
    const management = readFileSync(
      "src/server/actions/spa-demo-booking-management.ts",
      "utf8",
    );

    expect(composer).toContain("createSpaDemoCustomerBooking");
    expect(composer).toContain("確認預約");
    expect(composer).toContain("不指定");
    expect(composer).toContain("1. 人數");
    expect(composer).toContain("2. 每位服務");
    expect(composer).toContain("4. 可約時段");
    expect(composer).toContain("assignedProviders.length !== people");
    expect(composer).toContain("guestSummaries.reduce");
    expect(composer).toContain("套用第 1 位服務");
    expect(composer).toContain("findSpaPartyProviderAssignment");
    expect(composer).toContain("completedBooking");
    expect(composer).toContain("預約完成");
    expect(composer).toContain("服務與結帳完成");
    expect(composer).toContain("整組已結帳");
    expect(composer).toContain("儲值金餘額");
    expect(composer).toContain("返回會員中心");
    expect(composer).toContain("修改預約");
    expect(composer).toContain("取消預約");
    expect(composer).toContain("取消整組預約");
    expect(composer).toContain("cancelSpaDemoBooking");
    expect(composer).toContain('bookingOperation: isEditing ? "UPDATE" : "CREATE"');
    expect(composer).toContain("SpaBookingNotificationCard");
    expect(composer).toContain('useState("")');
    expect(composer).toContain("isSpaProviderAvailable");
    expect(composer).not.toContain('id: "spa-demo-staff-08"');
    expect(composer).not.toContain("最新預約");
    expect(composer).not.toContain("姓名");
    expect(action).not.toContain("data.customerName");
    expect(action).toContain("SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME");
    expect(action).toContain('bookingSource: z.enum(["CUSTOMER", "MANAGER"])');
    expect(action).toContain('bookingOperation: z.enum(["CREATE", "UPDATE"])');
    expect(action).toContain('bookedByType: data.bookingSource === "MANAGER" ? "STAFF" : "CUSTOMER"');
    expect(action).toContain('process.env.VERCEL_ENV === "production"');
    expect(action).toContain("SPA_DEMO_LIVE_FLOW_CUSTOMER_ID");
    expect(action).toContain("SPA_DEMO_LIVE_FLOW_BOOKING_ID");
    expect(action).toContain("SPA_DEMO_LIVE_FLOW_BOOKING_IDS");
    expect(action).toContain("guests: z.array");
    expect(action).toContain("new Set(providerIds).size !== people");
    expect(action).toContain("guestServices[index]");
    expect(action).toContain('startsWith: "spa-demo-transaction-live-split-"');
    expect(action).toContain("excludeBookingIds: SPA_DEMO_LIVE_FLOW_BOOKING_IDS");
    expect(action).toContain("getSpaDemoBookableProviders");
    expect(action).toContain("isSpaProviderAvailable");
    expect(action).toContain('storeId: SPA_DEMO_STORE.id');
    expect(action).toContain('bookingStatus: "CONFIRMED"');
    expect(action).toContain('revalidatePath("/dashboard/bookings")');
    expect(action).toContain('revalidatePath("/staff-schedule")');
    expect(action).toContain("saveSpaDemoBookingNotification");
    expect(previewQuery).toContain("SPA_DEMO_LIVE_FLOW_BOOKING_ID");
    expect(providerPage).toContain("serviceStaffId: user.staffId");
    expect(checkout).toContain('process.env.VERCEL_ENV === "production"');
    expect(checkout).toContain("z.enum(SPA_DEMO_LIVE_FLOW_BOOKING_IDS)");
    expect(checkout).toContain('storeId: SPA_DEMO_STORE.id');
    expect(checkout).toContain('bookingStatus: "COMPLETED"');
    expect(checkout).toContain("storedValueLedgerEntry.create");
    expect(checkout).toContain('parsed.data.settlement === "PACKAGE" ? "SESSION_DEDUCTION" : "SINGLE_PURCHASE"');
    expect(checkout).toContain('status: "RESERVED"');
    expect(checkout).toContain('status: "COMPLETED"');
    expect(checkout).toContain("remainingSessions: { gte: partySize }");
    expect(checkout).toContain("take: partySize");
    expect(checkout).toContain("bookingIds: group.map");
    expect(checkout).toContain("SPA_DEMO_GROUP_INCOMPLETE");
    expect(checkout).toContain("completeSpaDemoGuestBooking");
    expect(checkout).toContain("guestInputSchema");
    expect(checkout).toContain("此位尚未結帳");
    expect(checkout).toContain("同行者尚未連結會員，請改用現金或刷卡");
    expect(checkout).toContain('revalidatePath("/liff/staff-preview")');
    expect(manager).toContain("完成服務與結帳");
    expect(manager).toContain("整組完成並結帳");
    expect(manager).toContain("同行預約");
    expect(manager).toContain("selectedGroupBookings");
    expect(manager).toContain("整組付款");
    expect(manager).toContain("分開付款");
    expect(manager).toContain("完成此位並結帳");
    expect(manager).toContain("主要聯絡人儲值金");
    expect(manager).toContain("主要聯絡人");
    expect(manager).toContain("建立整組預約");
    expect(manager).toContain('bookingSource: "MANAGER"');
    expect(manager).toContain("findSpaPartyProviderAssignment");
    expect(manager).toContain("修改預約");
    expect(manager).toContain("取消此位");
    expect(manager).toContain("取消整組");
    expect(manager).toContain("cancelSpaDemoBooking");
    expect(management).toContain('process.env.VERCEL_ENV === "production"');
    expect(management).toContain('scope: z.enum(["GUEST", "GROUP"])');
    expect(management).toContain("FOR UPDATE");
    expect(management).toContain('storeId: SPA_DEMO_STORE.id');
    expect(management).toContain('bookingStatus: "CANCELLED"');
    expect(management).toContain('revalidatePath("/liff/staff-preview")');
    expect(management).toContain("saveSpaDemoBookingNotification");
    expect(manager).not.toContain("確認到店");
    expect(manager).not.toContain("開始服務");
  });
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findFirst: vi.fn() },
    staff: { findMany: vi.fn() },
    booking: { findMany: vi.fn() },
    storedValueWallet: { findFirst: vi.fn() },
    customerPlanWallet: { findFirst: vi.fn() },
    messageLog: { findFirst: vi.fn() },
  },
}));

describe("SPA Demo preview database scoping", () => {
  it("pins all data reads to demo-store", async () => {
    process.env.SPA_DEMO_DATABASE_PREVIEW_ENABLED = "true";
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.store.findFirst).mockResolvedValue({
      id: SPA_DEMO_STORE.id,
      slug: SPA_DEMO_STORE.slug,
      name: SPA_DEMO_STORE.name,
      isDemo: true,
      shopConfig: { address: SPA_DEMO_STORE.address, mapUrl: SPA_DEMO_STORE.mapUrl },
    } as never);
    vi.mocked(prisma.staff.findMany).mockResolvedValue([]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([]);
    vi.mocked(prisma.storedValueWallet.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.customerPlanWallet.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.messageLog.findFirst).mockResolvedValue(null);

    const { getSpaDemoPreviewData } = await import("@/server/queries/spa-demo-preview");
    const result = await getSpaDemoPreviewData();

    expect(result.source).toBe("database");
    expect(prisma.staff.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: SPA_DEMO_STORE.id,
        status: "ACTIVE",
        isOwner: false,
      }),
    }));
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: SPA_DEMO_STORE.id }),
    }));
    expect(prisma.messageLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { startsWith: "spa-demo-message-live-flow" },
        storeId: SPA_DEMO_STORE.id,
        customerId: "spa-demo-customer-live-flow",
      }),
    }));
  });

  it("keeps Preview notification simulation isolated from production", () => {
    const delivery = readFileSync(
      "src/server/services/spa-demo-booking-notification.ts",
      "utf8",
    );
    const reminderRoute = readFileSync(
      "src/app/api/cron/spa-demo-reminders/route.ts",
      "utf8",
    );
    expect(delivery).toContain('process.env.VERCEL_ENV === "production"');
    expect(delivery).toContain("SPA_DEMO_SIMULATED_DELIVERY");
    expect(delivery).toContain("SPA_DEMO_LIVE_FLOW_CUSTOMER_ID");
    expect(reminderRoute).toContain('process.env.VERCEL_ENV === "production"');
    expect(reminderRoute).toContain('request.nextUrl.searchParams.get("simulate") === "1"');
  });

  it("fails closed when a Demo booking points at a formal-store relation", async () => {
    process.env.SPA_DEMO_DATABASE_PREVIEW_ENABLED = "true";
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.store.findFirst).mockResolvedValue({
      id: SPA_DEMO_STORE.id,
      slug: SPA_DEMO_STORE.slug,
      name: SPA_DEMO_STORE.name,
      isDemo: true,
      shopConfig: null,
    } as never);
    vi.mocked(prisma.staff.findMany).mockResolvedValue([]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([{
      id: "spa-demo-booking-lin",
      bookingDate: new Date("2026-08-29T00:00:00.000Z"),
      slotTime: "10:00",
      bookingStatus: "CONFIRMED",
      bookingType: "FIRST_TRIAL",
      notes: null,
      serviceStaffId: null,
      customer: { name: "正式顧客", storeId: "formal-store" },
      servicePlan: null,
      customerPlanWallet: null,
    }] as never);
    vi.mocked(prisma.storedValueWallet.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.customerPlanWallet.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.messageLog.findFirst).mockResolvedValue(null);

    const { getSpaDemoPreviewData } = await import("@/server/queries/spa-demo-preview");
    await expect(getSpaDemoPreviewData()).rejects.toThrow("SPA_DEMO_CROSS_STORE_RELATION_REJECTED");
  });
});
