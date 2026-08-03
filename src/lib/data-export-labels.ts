export const dataExportTypes = ["customers", "transactions", "bookings", "wallets"] as const;
export type DataExportType = (typeof dataExportTypes)[number];

export const DATA_EXPORT_TYPE_LABELS: Record<DataExportType, string> = {
  customers: "顧客資料",
  transactions: "營收與交易明細",
  bookings: "預約與服務紀錄",
  wallets: "方案與堂數明細",
};

/** Customer-facing workbook columns. Store is retained for cross-store operations and auditability. */
export const DATA_EXPORT_HEADERS: Record<DataExportType, readonly string[]> = {
  customers: ["姓名", "電話", "Email", "所屬店別", "直屬店長／顧問", "首次到訪", "最近消費", "建立時間"],
  transactions: ["日期", "顧客", "所屬店別", "消費項目", "付款方式", "現金", "匯款", "LINE Pay", "信用卡", "其他", "未付款", "實收金額", "交易狀態"],
  bookings: ["日期", "時段", "顧客", "所屬店別", "服務類型", "預約狀態", "人數", "服務人員"],
  wallets: ["顧客", "所屬店別", "方案名稱", "購買金額", "總堂數", "剩餘堂數", "方案狀態", "開始日", "到期日"],
};

type StatusOption = { value: string; label: string };

/** Every selectable status is intentionally listed here, alongside its Prisma enum. */
export const DATA_EXPORT_STATUS_OPTIONS: Record<DataExportType, readonly StatusOption[]> = {
  customers: [
    { value: "LEAD", label: "名單" },
    { value: "TRIAL", label: "已體驗" },
    { value: "ACTIVE", label: "使用中" },
    { value: "INACTIVE", label: "暫停使用" },
  ],
  transactions: [
    { value: "SUCCESS", label: "已完成" },
    { value: "CANCELLED", label: "已取消" },
    { value: "REFUNDED", label: "已退款" },
    { value: "VOIDED", label: "已作廢" },
  ],
  bookings: [
    { value: "PENDING", label: "待服務" },
    { value: "CONFIRMED", label: "已確認" },
    { value: "COMPLETED", label: "已完成" },
    { value: "CANCELLED", label: "已取消" },
    { value: "NO_SHOW", label: "未到" },
  ],
  wallets: [
    { value: "ACTIVE", label: "使用中" },
    { value: "USED_UP", label: "已用完" },
    { value: "EXPIRED", label: "已過期" },
    { value: "CANCELLED", label: "已取消" },
  ],
};

function labelFrom(options: readonly StatusOption[], value: string | null | undefined): string {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label ?? "未分類";
}

export function isDataExportStatus(type: DataExportType, value: string): boolean {
  return DATA_EXPORT_STATUS_OPTIONS[type].some((option) => option.value === value);
}

export function formatCustomerStage(value: string | null | undefined): string {
  return labelFrom(DATA_EXPORT_STATUS_OPTIONS.customers, value);
}

export function formatTransactionStatus(value: string | null | undefined): string {
  return labelFrom(DATA_EXPORT_STATUS_OPTIONS.transactions, value);
}

export function formatBookingStatus(value: string | null | undefined): string {
  return labelFrom(DATA_EXPORT_STATUS_OPTIONS.bookings, value);
}

export function formatWalletStatus(value: string | null | undefined): string {
  return labelFrom(DATA_EXPORT_STATUS_OPTIONS.wallets, value);
}

export function formatTransactionType(value: string | null | undefined): string {
  return ({
    TRIAL_PURCHASE: "體驗購買",
    SINGLE_PURCHASE: "單次消費",
    PACKAGE_PURCHASE: "方案購買",
    SESSION_DEDUCTION: "方案扣堂",
    SUPPLEMENT: "補差額",
    REFUND: "退款",
    ADJUSTMENT: "手動調整",
    MANUAL_USED_BACKFILL: "補登已使用堂數",
    PAPER_MIGRATION: "舊資料轉入",
  } as Record<string, string>)[value ?? ""] ?? "未分類";
}

export function formatBookingType(value: string | null | undefined): string {
  return ({
    FIRST_TRIAL: "首次體驗",
    SINGLE: "單次服務",
    PACKAGE_SESSION: "方案扣堂",
  } as Record<string, string>)[value ?? ""] ?? "未分類";
}

export function formatPaymentMethod(value: string | null | undefined): string {
  return ({
    CASH: "現金",
    TRANSFER: "匯款",
    LINE_PAY: "LINE Pay",
    CREDIT_CARD: "信用卡",
    OTHER: "其他",
    UNPAID: "未付款",
  } as Record<string, string>)[value ?? ""] ?? "未分類";
}

const PAYMENT_METHOD_COLUMNS = ["CASH", "TRANSFER", "LINE_PAY", "CREDIT_CARD", "OTHER", "UNPAID"] as const;

export function buildTransactionExportRow(input: {
  date: string;
  customerName: string;
  storeName: string;
  transactionType: string;
  paymentMethod: string;
  netAmount: number;
  status: string;
  paymentSplits: Array<{ paymentMethod: string; amount: number }>;
}): Array<string | number> {
  // A transaction remains one workbook row. Split amounts are summed by method,
  // so a malformed duplicate split cannot produce duplicate transaction rows.
  const payments = input.paymentSplits.length > 0
    ? input.paymentSplits
    : [{ paymentMethod: input.paymentMethod, amount: input.netAmount }];
  const amounts = new Map<string, number>();
  for (const payment of payments) {
    amounts.set(payment.paymentMethod, (amounts.get(payment.paymentMethod) ?? 0) + payment.amount);
  }

  return [
    input.date,
    input.customerName,
    input.storeName,
    formatTransactionType(input.transactionType),
    payments.length > 1 ? "混合付款" : formatPaymentMethod(payments[0]?.paymentMethod),
    ...PAYMENT_METHOD_COLUMNS.map((method) => amounts.get(method) ?? 0),
    input.netAmount,
    formatTransactionStatus(input.status),
  ];
}
