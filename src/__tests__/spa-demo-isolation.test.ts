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
    const manager = readFileSync(
      "src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx",
      "utf8",
    );

    expect(customer).not.toContain("ModulePreviewSwitcher");
    expect(manager).not.toContain("ModulePreviewSwitcher");
    expect(manager).toContain("桌機、iPad 與手機共用同一套排程");
    expect(manager).toContain('aria-label="預約右側操作面板"');
    expect(manager).toContain('className="overflow-x-auto"');
    expect(manager).not.toContain("請使用 iPad 或桌機開啟");
    expect(manager).not.toContain("md:hidden");
    expect(manager).toContain("完成服務並收費");
    expect(manager).toContain("完成服務並扣次");
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

    const { getSpaDemoPreviewData } = await import("@/server/queries/spa-demo-preview");
    const result = await getSpaDemoPreviewData();

    expect(result.source).toBe("database");
    expect(prisma.staff.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: SPA_DEMO_STORE.id,
        id: { in: SPA_DEMO_PROVIDERS.map((provider) => provider.id) },
      }),
    }));
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: SPA_DEMO_STORE.id }),
    }));
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

    const { getSpaDemoPreviewData } = await import("@/server/queries/spa-demo-preview");
    await expect(getSpaDemoPreviewData()).rejects.toThrow("SPA_DEMO_CROSS_STORE_RELATION_REJECTED");
  });
});
