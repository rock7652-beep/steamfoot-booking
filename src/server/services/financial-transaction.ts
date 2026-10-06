import type { Prisma } from "@prisma/client";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { lockCashDay } from "./cash-day";

const cashTypes = ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT", "REFUND"];

/** Cash writes share the drawer version guard; non-cash, pending and point
 * deductions do not affect the physical drawer. Explicitly pin the date so a
 * midnight transition cannot lock one day and write into the next. */
export async function createFinancialTransaction(tx: Prisma.TransactionClient, args: Prisma.TransactionCreateArgs) {
  const data = args.data;
  const transactionDate = data.transactionDate ? new Date(data.transactionDate) : new Date();
  const splits = data.paymentSplits?.create;
  const parts = splits ? (Array.isArray(splits) ? splits : [splits]) : null;
  const hasCash = parts ? parts.some(part => part.paymentMethod === "CASH" && Number(part.amount) !== 0)
    : (data.paymentMethod ?? "CASH") === "CASH" && Number(data.amount) !== 0;
  if (data.storeId && hasCash && cashTypes.includes(data.transactionType)
    && (data.status ?? "SUCCESS") === "SUCCESS"
    && ["SUCCESS", "CONFIRMED"].includes(data.paymentStatus ?? "SUCCESS")) {
    await lockCashDay(tx, data.storeId, parseTaiwanDateToDbDate(toLocalDateStr(transactionDate)));
  }
  return tx.transaction.create({ ...args, data: { ...data, transactionDate } });
}

export async function lockExistingTransactionCash(tx: Prisma.TransactionClient, entry: {
  storeId: string; transactionDate: Date; transactionType: string;
  paymentMethod: string; paymentStatus: string; status: string; amount: unknown;
  paymentSplits?: Array<{ paymentMethod: string; amount: unknown }>;
}, nextMethod?: string) {
  const hasCash = entry.paymentSplits?.length
    ? entry.paymentSplits.some(part => part.paymentMethod === "CASH" && Number(part.amount) !== 0)
    : entry.paymentMethod === "CASH" && Number(entry.amount) !== 0;
  if ((hasCash || nextMethod === "CASH") && cashTypes.includes(entry.transactionType)
    && entry.status === "SUCCESS" && ["SUCCESS", "CONFIRMED"].includes(entry.paymentStatus)) {
    await lockCashDay(tx, entry.storeId, parseTaiwanDateToDbDate(toLocalDateStr(entry.transactionDate)));
  }
}
