"use server";

import { prisma } from "@/lib/db";
import { requirePermission, checkPermission, requireWritablePermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { getManagerReadFilter } from "@/lib/manager-visibility";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError, handleActionError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { getCashDrawerView, listClosedBusinessDates } from "@/server/queries/cash-drawer";
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
  const user = await context(storeId);
  const today = toLocalDateStr();
  const date = new Date(today + "T00:00:00Z");
  const scope = getManagerReadFilter(user.role, user.staffId, "staffId", storeId);
  const where = { ...scope, storeId, entryDate: date };
  const viewContext = await resolveStoreViewContextFromCookie(user);
  const canWrite = !viewContext?.isViewMode && await checkPermission(user.role, user.staffId, "cashbook.create");
  const canDrawer = await checkPermission(user.role, user.staffId, "cashDrawer.read") && await hasStoreFeature(storeId, FEATURES.CASH_DRAWER);
  const currentPage = Number.isInteger(page) && page > 0 ? page : 1;
  const [entries, total, view, closedDates] = await Promise.all([
    prisma.cashbookEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (currentPage - 1) * 20, take: 20 }),
    prisma.cashbookEntry.count({ where }),
    canDrawer ? getCashDrawerView(storeId, date) : null,
    listClosedBusinessDates(storeId, today, today),
  ]);
  let balance: number | null = null;
  let balanceLabel = "今日尚未開店點錢";
  if (view?.state === "OPENED_TODAY") {
    const amount = view.liveTotals?.expectedClosingCash ?? view.session.closingActualCash;
    balance = amount == null ? null : Number(amount);
    balanceLabel = view.liveTotals ? "預估抽屜現金" : "關店實點現金";
  } else if (view?.state === "WARNING_LAST_OPEN") balanceLabel = "上次抽屜尚未關帳";
  else if (view?.state === "EMPTY") balanceLabel = "現金抽屜尚未啟用";
  return { today, page: currentPage, total, canWrite, closedDates, canDrawer, balance, balanceLabel,
    entries: entries.map(e => ({ id: e.id, entryDate: today, type: e.type, category: e.category ?? "", amount: Number(e.amount), paymentMethod: e.paymentMethod, note: e.note ?? "", canEdit: canWrite && (user.role === "ADMIN" || (!!user.staffId && e.staffId === user.staffId)) })),
  };
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
    const data = { entryDate: toLocalDateStr(), type: type as "INCOME" | "EXPENSE", amount: Number(form.get("amount")), category: String(form.get("category") ?? ""), paymentMethod: form.get("paymentMethod") as "CASH" | "OTHER", note: String(form.get("note") ?? ""), confirmClosedCashbookChange: form.get("confirmClosedCashbookChange") === "on" };
    return id ? await updateCashbookEntry(id, data) : await createCashbookEntry(data);
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
