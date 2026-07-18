/**
 * Transaction presentation helpers.
 *
 * A cancelled payment represents the same terminal, non-revenue state as a
 * voided transaction in every staff-facing transaction view. Keep this
 * display-only rule separate from transaction state transitions and reports.
 */
export function isVoidedTransaction(transaction: {
  status: string;
  paymentStatus: string;
}): boolean {
  return transaction.status === "VOIDED" || transaction.paymentStatus === "CANCELLED";
}

export function transactionStatusLabel(transaction: {
  status: string;
  paymentStatus: string;
}): string | null {
  return isVoidedTransaction(transaction) ? "已作廢" : null;
}
