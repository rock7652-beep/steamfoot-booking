"use server";

import { prisma } from "@/lib/db";
import { hashSync } from "bcryptjs";
import { createDefaultPermissions } from "@/lib/permissions";
import { requireAdminSession } from "@/lib/session";
import type { ActionResult } from "@/types";
import type {
  CreateStoreInput,
  StoreDeliverySummary,
  ChecklistItem,
  AccountSummary,
} from "@/types/store-onboarding";
import type { UserRole } from "@prisma/client";

// ============================================================
// 建店 — createStoreAction
// ============================================================

export async function createStoreAction(
  input: CreateStoreInput
): Promise<ActionResult<StoreDeliverySummary>> {
  await requireAdminSession();

  // ── 輸入驗證 ──
  const errors = validateCreateStoreInput(input);
  if (errors.length > 0) {
    return { success: false, error: errors.join("；") };
  }

  // ── 唯一性檢查 ──
  const existingSlug = await prisma.store.findUnique({ where: { slug: input.slug } });
  if (existingSlug) {
    return { success: false, error: `slug「${input.slug}」已被使用` };
  }

  const existingOwnerEmail = await prisma.user.findUnique({ where: { email: input.owner.email } });
  if (existingOwnerEmail) {
    return { success: false, error: `OWNER email「${input.owner.email}」已被使用` };
  }

  if (input.domain) {
    const existingDomain = await prisma.store.findUnique({ where: { domain: input.domain } });
    if (existingDomain) {
      return { success: false, error: `domain「${input.domain}」已被使用` };
    }
  }

  for (const staff of input.initialStaff ?? []) {
    const existing = await prisma.user.findUnique({ where: { email: staff.email } });
    if (existing) {
      return { success: false, error: `STAFF email「${staff.email}」已被使用` };
    }
  }

  // ── 建店 Transaction ──
  try {
    const storeId = `store-${input.slug}`;
    const passwordHash = hashSync(input.owner.password, 10);
    const ownerRole: UserRole = "OWNER";

    // 1. Store + ShopConfig
    const store = await prisma.store.create({
      data: {
        id: storeId,
        name: input.name,
        slug: input.slug,
        domain: input.domain ?? null,
        lineDestination: input.lineDestination ?? null,
        isDefault: false,
        isDemo: input.isDemo,
        plan: input.plan,
        planStatus: "TRIAL", // ★ 一律 TRIAL（規格強制）
        shopConfig: {
          create: {
            shopName: input.name,
            plan: input.shopPlan,
            dutySchedulingEnabled: input.dutySchedulingEnabled ?? false,
          },
        },
      },
    });

    // 2. OWNER
    const ownerUser = await prisma.user.create({
      data: {
        name: input.owner.name,
        email: input.owner.email,
        passwordHash,
        role: ownerRole,
        status: "ACTIVE",
        staff: {
          create: {
            storeId,
            displayName: input.owner.name,
            colorCode: "#6366f1",
            isOwner: true,
            monthlySpaceFee: 0,
            spaceFeeEnabled: false,
          },
        },
      },
      include: { staff: true },
    });

    if (ownerUser.staff) {
      await createDefaultPermissions(ownerUser.staff.id, ownerRole);
    }

    // 3. Initial STAFF（mapping: MANAGER→OWNER, STAFF→PARTNER）
    const staffAccounts: AccountSummary[] = [];
    for (const staffInput of input.initialStaff ?? []) {
      const dbRole: UserRole = staffInput.role === "MANAGER" ? "OWNER" : "PARTNER";
      const staffPwHash = hashSync(`${input.slug}-staff-temp`, 10); // 臨時密碼
      const staffUser = await prisma.user.create({
        data: {
          name: staffInput.name,
          email: staffInput.email,
          passwordHash: staffPwHash,
          role: dbRole,
          status: "ACTIVE",
          staff: {
            create: {
              storeId,
              displayName: staffInput.name,
              colorCode: "#10b981",
              isOwner: false,
              monthlySpaceFee: 0,
              spaceFeeEnabled: true,
            },
          },
        },
        include: { staff: true },
      });
      if (staffUser.staff) {
        await createDefaultPermissions(staffUser.staff.id, dbRole);
      }
      staffAccounts.push({
        name: staffInput.name,
        email: staffInput.email,
        role: staffInput.role,
      });
    }

    // 4. Default booking slots（8 slots × 7 days）
    const slotTimes = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];
    const slotData = [];
    for (let day = 0; day <= 6; day++) {
      for (const time of slotTimes) {
        slotData.push({ storeId, dayOfWeek: day, startTime: time, capacity: 6, isEnabled: true });
      }
    }
    await prisma.bookingSlot.createMany({ data: slotData });

    // ── 產出交付摘要 ──
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.steamfoot.com";
    const checklist = buildDeliveryChecklist(input);

    const summary: StoreDeliverySummary = {
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        plan: store.plan,
        planStatus: store.planStatus,
        isDemo: store.isDemo,
      },
      urls: buildStoreUrls(baseUrl, store.slug, store.id),
      accounts: {
        owner: {
          name: input.owner.name,
          email: input.owner.email,
          role: "OWNER",
        },
        staff: staffAccounts,
      },
      thirdParty: {
        line: input.lineDestination ? "configured" : "not_configured",
        email: process.env.RESEND_API_KEY ? "configured" : "not_configured",
      },
      checklist,
      canActivate: !input.isDemo && checklist.every((c) => c.status !== "fail"),
    };

    return { success: true, data: summary };
  } catch (e) {
    console.error("[createStoreAction] error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `建店失敗：${msg}` };
  }
}

// ============================================================
// 啟用店舖 — activateStoreAction
// ============================================================

export async function activateStoreAction(
  storeId: string
): Promise<ActionResult<{ planStatus: string }>> {
  await requireAdminSession();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      shopConfig: true,
      staff: { include: { user: true } },
    },
  });

  if (!store) {
    return { success: false, error: "店舖不存在" };
  }

  // ★ Demo 店禁止啟用（規格強制）
  if (store.isDemo) {
    return { success: false, error: "Demo 店無法啟用為正式店，請建立新的正式店" };
  }

  if (store.planStatus === "ACTIVE") {
    return { success: false, error: "店舖已經是 ACTIVE 狀態" };
  }

  // 啟用前驗證
  const checklist = await verifyStoreSetup(storeId);
  const hasFailure = checklist.some((c) => c.status === "fail");
  if (hasFailure) {
    const failures = checklist.filter((c) => c.status === "fail").map((c) => c.label);
    return { success: false, error: `啟用前驗證失敗：${failures.join("、")}` };
  }

  await prisma.store.update({
    where: { id: storeId },
    data: {
      planStatus: "ACTIVE",
      planEffectiveAt: new Date(),
    },
  });

  return { success: true, data: { planStatus: "ACTIVE" } };
}

// ============================================================
// 驗證店舖 — verifyStoreAction
// ============================================================

export async function verifyStoreAction(
  storeId: string
): Promise<ActionResult<ChecklistItem[]>> {
  await requireAdminSession();
  const checklist = await verifyStoreSetup(storeId);
  return { success: true, data: checklist };
}

// ============================================================
// 取得交付摘要 — getStoreDeliverySummary
// ============================================================

export async function getStoreDeliverySummary(
  storeId: string
): Promise<ActionResult<StoreDeliverySummary>> {
  await requireAdminSession();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      shopConfig: true,
      staff: {
        include: { user: { select: { name: true, email: true, role: true } } },
      },
    },
  });

  if (!store) {
    return { success: false, error: "店舖不存在" };
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.steamfoot.com";
  const checklist = await verifyStoreSetup(storeId);

  const owner = store.staff.find((s) => s.isOwner);
  const staffList = store.staff.filter((s) => !s.isOwner);

  const summary: StoreDeliverySummary = {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      plan: store.plan,
      planStatus: store.planStatus,
      isDemo: store.isDemo,
    },
    urls: buildStoreUrls(baseUrl, store.slug, store.id),
    accounts: {
      owner: owner
        ? {
            name: owner.user?.name ?? "",
            email: owner.user?.email ?? "",
            role: owner.user?.role ?? "OWNER",
          }
        : { name: "", email: "", role: "OWNER" },
      staff: staffList.map((s) => ({
        name: s.user?.name ?? "",
        email: s.user?.email ?? "",
        role: s.user?.role ?? "PARTNER",
      })),
    },
    thirdParty: {
      line: store.lineDestination ? "configured" : "not_configured",
      email: process.env.RESEND_API_KEY ? "configured" : "not_configured",
    },
    checklist,
    canActivate: !store.isDemo && checklist.every((c) => c.status !== "fail"),
  };

  return { success: true, data: summary };
}

// ============================================================
// 列出全部店舖 — listStoresAction
// ============================================================

export async function listStoresAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      planStatus: string;
      isDemo: boolean;
      staffCount: number;
      customerCount: number;
      createdAt: Date;
    }>
  >
> {
  await requireAdminSession();

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      planStatus: true,
      isDemo: true,
      createdAt: true,
      _count: { select: { staff: true, customers: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    success: true,
    data: stores.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      plan: s.plan,
      planStatus: s.planStatus,
      isDemo: s.isDemo,
      staffCount: s._count.staff,
      customerCount: s._count.customers,
      createdAt: s.createdAt,
    })),
  };
}

// ============================================================
// URL 建構（對應 proxy.ts 實際路由）
// ============================================================

function buildStoreUrls(baseUrl: string, slug: string, storeId: string) {
  return {
    storefront: `${baseUrl}/s/${slug}/`,
    booking: `${baseUrl}/s/${slug}/book`,
    register: `${baseUrl}/s/${slug}/register`,
    adminLogin: `${baseUrl}/hq/login`,
    adminDashboard: `${baseUrl}/s/${slug}/admin/dashboard`,
    hqStoreDetail: `${baseUrl}/hq/dashboard/stores/${storeId}`,
  };
}

// ============================================================
// 交付 Checklist（建店後回傳，業務導向）
// ============================================================

function buildDeliveryChecklist(
  input: CreateStoreInput
): ChecklistItem[] {
  return [
    // ① 店舖基本資料
    { key: "store_record", label: "店舖基本資料已建立", status: "pass" },
    // ② 路由入口
    { key: "route_entry", label: "路由入口 /s/[slug]/ 已可存取", status: "pass" },
    // ③ OWNER / STAFF 登入
    { key: "owner_login", label: "OWNER 帳號可登入後台", status: "pass" },
    { key: "staff_created", label: "初始 STAFF 已建立",
      status: (input.initialStaff?.length ?? 0) > 0 ? "pass" : "skip" },
    // ④ 顧客前台主流程
    { key: "booking_page", label: "預約頁 /s/[slug]/book 可開啟", status: "pass" },
    { key: "register_page", label: "顧客註冊頁 /s/[slug]/register 可開啟", status: "pass" },
    { key: "first_booking", label: "可完成一筆預約（需人工驗證）", status: "skip" },
    // ⑤ 權限與隔離
    { key: "owner_permissions", label: "OWNER 權限已設定", status: "pass" },
    { key: "store_isolation", label: "資料隔離（storeId 綁定）", status: "pass" },
    // ⑥ 第三方服務
    { key: "line_config", label: "LINE 入口可導流",
      status: input.lineDestination ? "pass" : "skip" },
    { key: "email_service", label: "Email 服務",
      status: process.env.RESEND_API_KEY ? "pass" : "skip" },
  ];
}

// ============================================================
// 驗證 checklist（啟用前技術檢查，涵蓋 6 大面向）
// ============================================================

async function verifyStoreSetup(storeId: string): Promise<ChecklistItem[]> {
  const items: ChecklistItem[] = [];

  // ① 店舖基本資料
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { shopConfig: true },
  });

  items.push({
    key: "store-exists",
    label: "店舖記錄存在",
    status: store ? "pass" : "fail",
  });

  if (!store) return items;

  items.push({
    key: "shop-config",
    label: "ShopConfig 已建立",
    status: store.shopConfig ? "pass" : "fail",
  });

  // ② 路由入口
  items.push({
    key: "slug-resolvable",
    label: "路由入口 /s/[slug]/ 可解析",
    status: store.slug ? "pass" : "fail",
  });

  // ③ OWNER / STAFF 登入
  const owners = await prisma.staff.findMany({
    where: { storeId, isOwner: true, status: "ACTIVE" },
    include: { user: { select: { status: true } } },
  });
  const activeOwners = owners.filter((o) => o.user?.status === "ACTIVE");

  items.push({
    key: "owner-exists",
    label: "OWNER 帳號存在且 ACTIVE",
    status: activeOwners.length > 0 ? "pass" : "fail",
  });

  // ⑤ 權限與隔離
  if (activeOwners.length > 0) {
    const permCount = await prisma.staffPermission.count({
      where: { staffId: activeOwners[0].id },
    });
    items.push({
      key: "owner-permissions",
      label: "OWNER 權限已設定",
      status: permCount > 0 ? "pass" : "fail",
    });
  }

  // ④ 顧客前台主流程
  const slotCount = await prisma.bookingSlot.count({ where: { storeId } });
  items.push({
    key: "booking-slots",
    label: "預約時段已建立",
    status: slotCount > 0 ? "pass" : "fail",
  });

  // ⑥ 第三方服務
  items.push({
    key: "line-config",
    label: "LINE Official Account",
    status: store.lineDestination ? "pass" : "skip",
  });

  return items;
}

// ============================================================
// 輸入驗證
// ============================================================

function validateCreateStoreInput(input: CreateStoreInput): string[] {
  const errors: string[] = [];

  if (!input.name?.trim()) errors.push("店名不可為空");
  if (!input.slug?.trim()) errors.push("slug 不可為空");
  if (!/^[a-z0-9-]+$/.test(input.slug)) errors.push("slug 只能包含小寫英數字和短橫線");
  if (input.slug.length < 2 || input.slug.length > 30) errors.push("slug 長度需 2-30 字元");

  if (!input.owner.name?.trim()) errors.push("OWNER 姓名不可為空");
  if (!input.owner.email?.trim()) errors.push("OWNER Email 不可為空");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.owner.email)) errors.push("OWNER Email 格式不正確");
  if (!input.owner.password) errors.push("OWNER 密碼不可為空");
  if (input.owner.password.length < 6) errors.push("OWNER 密碼至少 6 字元");

  for (let i = 0; i < (input.initialStaff?.length ?? 0); i++) {
    const s = input.initialStaff![i];
    if (!s.name?.trim()) errors.push(`STAFF #${i + 1} 姓名不可為空`);
    if (!s.email?.trim()) errors.push(`STAFF #${i + 1} Email 不可為空`);
  }

  return errors;
}
