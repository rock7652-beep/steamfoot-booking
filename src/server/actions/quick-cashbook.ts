"use server";

import { prisma } from "@/lib/db";
import { requirePermission, checkPermission, requireWritablePermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { getManagerReadFilter } from "@/lib/manager-visibility";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError, handleActionError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { getCashDrawerBalanceSummary, listClosedBusinessDates } from "@/server/queries/cash-drawer";
import { createCashbookEntry, updateCashbookEntry, deleteCashbookEntry } from "./cashbook";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";

async function context(storeId: string, write = false) {
  const user = write ? await requireWritablePermission("cashbook.create") : await requirePermission("cashbook.read");
  const active = await getActiveStoreForRead(user);
  if (!storeId || active !== storeId) throw new AppError("FORBIDDEN", "店別已變更，請重新開啟現金收支");
  if (write && await resolveWriteStoreId(user) !== storeId) throw new AppError("FORBIDDEN", "目前店別不可記帳");
  if (!(await hasStoreFeature(storeId, FEATURES.CASHBOOK))) throw new AppError("FORBIDDEN", "尚未開通現金收支");
  return user;
}

export async function fetchQuickCashbook(storeId: string, page = 1) {
  const startedAt = performance.now();
  const user = await context(storeId);
  const authorizedAt = performance.now();
  const today = toLocalDateStr();
  const date = new Date(today + "T00:00:00Z");
  const scope = getManagerReadFilter(user.role, user.staffId, "staffId", storeId);
  const where = { ...scope, storeId, entryDate: date };
  const currentPage = Number.isInteger(page) && page > 0 ? page : 1;
  // 已通過現金帳權限、門市與功能檢查；獨立讀取不再等待其他 UI 權限。
  const [entries, total, drawer, closedDates, viewContext, writePermission] = await Promise.all([
    prisma.cashbookEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (currentPage - 1) * 20, take: 20, include: { customer: { select: { id: true, name: true } } } }),
    prisma.cashbookEntry.count({ where }),
    (async () => {
      const canDrawer = await checkPermission(user.role, user.staffId, "cashDrawer.read") && await hasStoreFeature(storeId, FEATURES.CASH_DRAWER);
      const summary = canDrawer ? await getCashDrawerBalanceSummary(storeId, date) : { balance: null, balanceLabel: "今日尚未開店點錢" };
      return { canDrawer, ...summary };
    })(),
    listClosedBusinessDates(storeId, today, today),
    resolveStoreViewContextFromCookie(user),
    checkPermission(user.role, user.staffId, "cashbook.create"),
  ]);
  const canWrite = !viewContext?.isViewMode && writePermission;
  const { canDrawer, balance, balanceLabel } = drawer;
  if (process.env.VERCEL) {
    const finishedAt = performance.now();
    console.info("[quick-cashbook-read]", JSON.stringify({
      authorizationMs: Math.round(authorizedAt - startedAt),
      dataMs: Math.round(finishedAt - authorizedAt),
      totalMs: Math.round(finishedAt - startedAt),
    }));
  }
  return { today, page: currentPage, total, canWrite, closedDates, canDrawer, balance, balanceLabel,
    entries: entries.map(e => ({ id: e.id, entryDate: today, type: e.type, category: e.category ?? "", amount: Number(e.amount), paymentMethod: e.paymentMethod, note: e.note ?? "", customer: e.customer, canEdit: canWrite && (user.role === "ADMIN" || (!!user.staffId && e.staffId === user.staffId)) })),
  };
}

export async function searchQuickCashbookCustomers(storeId: string, rawQuery: string) {
  const user = await context(storeId);
  if (!(await checkPermission(user.role, user.staffId, "customer.read"))) {
    throw new AppError("FORBIDDEN", "沒有查看顧客的權限");
  }
  const query = rawQuery.trim().slice(0, 50);
  if (!query) return [];
  const phoneQuery = /^[0-9\s()+-]+$/.test(query) ? query.replace(/[^0-9]/g, "") : "";
  const baseWhere = {
    storeId,
    mergedIntoCustomerId: null,
    NOT: { user: { is: { status: "SUSPENDED" as const } } },
  };
  const select = { id: true, name: true, phone: true } as const;
  if (phoneQuery) return prisma.customer.findMany({
    where: { ...baseWhere, phone: { startsWith: phoneQuery } },
    select,
    orderBy: { name: "asc" },
    take: 8,
  });

  const prefix = await prisma.customer.findMany({
    where: { ...baseWhere, OR: [{ name: { startsWith: query } }, { lineName: { startsWith: query, mode: "insensitive" } }] },
    select,
    orderBy: { name: "asc" },
    take: 8,
  });
  if (prefix.length >= 8 || query.length < 2) return prefix;
  const fallback = await prisma.customer.findMany({
    where: {
      ...baseWhere,
      id: { notIn: prefix.map((customer) => customer.id) },
      OR: [{ name: { contains: query } }, { lineName: { contains: query, mode: "insensitive" } }],
    },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 8 - prefix.length,
  });
  return [...prefix, ...fallback];
}

export async function saveQuickCashbook(storeId: string, id: string | null, form: FormData) {
  try {
    const user = await context(storeId, true);
    if (id) {
      const entry = await prisma.cashbookEntry.findFirst({ where: { id, storeId } });
      if (entry && entry.entryDate.toISOString().slice(0, 10) !== toLocalDateStr()) throw new AppError("BUSINESS_RULE", "日期已變更，請到完整現金管理編輯原紀錄");
      if (!entry || (user.role !== "ADMIN" && (!user.staffId || entry.staffId !== user.staffId))) throw new AppError("FORBIDDEN", "無法編輯這筆紀錄");
    }
    const type = form.get("type");
    if (type !== "INCOME" && type !== "EXPENSE") throw new AppError("VALIDATION", "請選擇收入或支出");
    const customerId = type === "INCOME" ? String(form.get("customerId") ?? "") : "";
    const data = { entryDate: toLocalDateStr(), type: type as "INCOME" | "EXPENSE", amount: Number(form.get("amount")), category: String(form.get("category") ?? ""), paymentMethod: form.get("paymentMethod") as "CASH" | "OTHER", note: String(form.get("note") ?? ""), confirmClosedCashbookChange: form.get("confirmClosedCashbookChange") === "on" };
    return id
      ? await updateCashbookEntry(id, { ...data, customerId: customerId || null })
      : await createCashbookEntry({ ...data, customerId: customerId || undefined });
  } catch (e) { return handleActionError(e); }
}

export async function deleteQuickCashbook(storeId: string, id: string) {
  try {
    const user = await context(storeId, true);
    const entry = await prisma.cashbookEntry.findFirst({ where: { id, storeId } });
    if (!entry || (user.role !== "ADMIN" && (!user.staffId || entry.staffId !== user.staffId))) throw new AppError("FORBIDDEN", "無法刪除這筆紀錄");
    return await deleteCashbookEntry(id);
  } catch (e) { return handleActionError(e); }
}
