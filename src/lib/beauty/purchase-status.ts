/** Unknown statuses must not be presented as a completed payment. */
export function beautyPurchaseStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return '待核帳';
    case 'CONFIRMED': return '已核帳';
    case 'VOIDED': return '已作廢';
    default: return '狀態待確認';
  }
}
