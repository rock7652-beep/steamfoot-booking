import { createCashbookEntry } from "@/server/actions/cashbook";

/** Shared form adapter; authorization, date locks and request deduplication stay in the action. */
export async function createCashDrawerCashbookEntry(form: FormData) {
  const type = form.get("type");
  if (type !== "INCOME" && type !== "EXPENSE") {
    return { success: false as const, error: "此入口僅能新增收入或支出（提領請使用提領功能）" };
  }
  return createCashbookEntry({
    requestId: String(form.get("requestId") || "") || undefined,
    entryDate: String(form.get("entryDate") ?? ""),
    type,
    category: String(form.get("category") || "") || undefined,
    amount: Number(form.get("amount")),
    paymentMethod: form.get("paymentMethod") as "CASH" | "OTHER",
    staffId: String(form.get("staffId") || "") || undefined,
    customerId: String(form.get("customerId") || "") || undefined,
    note: String(form.get("note") || "") || undefined,
    confirmClosedCashbookChange: form.get("confirmClosedCashbookChange") === "on",
  });
}
