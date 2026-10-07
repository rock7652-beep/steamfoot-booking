import { redactAuditValue } from "./audit-redact";

export const auditTargetLabels: Record<string, string> = {
  Booking: "蒸足預約", SpaBooking: "服務預約", SpaBookingGroup: "同行服務預約", CourseBooking: "課程預約",
  CourseSession: "課程堂次", CourseTemplate: "課程設定", CourseWaitlist: "候補名單", CourseWaitlistSetting: "候補設定",
  Customer: "顧客資料", CustomerPlanWallet: "顧客方案", Staff: "人員資料", StaffPermission: "人員權限",
  CourseCompensation: "課程拆帳設定", CourseTeacherCompensationSetting: "老師拆帳設定", CourseTeacherFinanceScope: "老師帳務範圍",
  CashbookEntry: "現金收支", Transaction: "收款單", CashDrawerSession: "現金結帳", Store: "店家資料", StoreView: "店家檢視",
  BusinessHours: "營業時段", CustomerLabel: "顧客標籤", User: "帳號資料", CustomerIdentityLink: "會員綁定",
  CentralMemberLinkReviewRequest: "會員綁定申請", LineRebindRequest: "LINE 換綁申請", TrialApplication: "試用申請",
  DataExport: "資料匯出", DigitalButlerConversation: "顧客對話", DigitalButlerFlow: "數位管家流程", MessengerPage: "粉絲專頁設定",
  InventoryOrder: "進銷貨單", InventoryProduct: "商品", InventorySupplier: "供應商", InventoryPayment: "單據收付款", InventoryStockCount: "庫存盤點",
};
const actions: Record<string, string> = {
  CREATE: "新增", UPDATE: "修改", DELETE: "刪除", CANCEL: "取消預約", CANCELLED: "取消預約", COMPLETE: "完成服務",
  NO_SHOW: "標記未到", REVERT: "恢復待到店", RESERVED: "恢復待點名", ATTENDED: "標記出席", CHECKED_IN: "報到", STUDENT_LEAVE: "記錄學員請假",
  ACTIVATE: "啟用人員", DEACTIVATE: "停用人員", ENABLE: "開啟", DISABLE: "關閉", PASSWORD_RESET: "重設登入密碼",
  VIEW_CROSS_STORE: "申請切換跨店檢視", HQ_VIEW_STORE: "申請切換店家檢視", HQ_VIEW_ALL_STORES: "申請返回總部全部店家",
  BOOKING_NOTE_UPDATED: "修改預約備註", SERVICE_NOTE_UPDATED: "修改顧客服務備註", ADJUST_CHECKOUT_METHOD: "調整結帳方式",
  EDIT_EXPIRY: "修改方案到期日", EXTEND_EXPIRY: "延長方案期限", MANUAL_USED_BACKFILL: "補登已使用堂數", PAPER_MIGRATION: "匯入紙本方案",
  AUTO_PROMOTE: "自動遞補候補", CAPACITY_AUTO_PROMOTE: "調整名額後自動遞補", MANUAL_PROMOTE: "人工遞補候補", ENROLL_SERIES: "加入連續課程名單",
  COURSE_BULK_ASSIGN: "批次調整顧客所屬教練", COURSE_CUSTOMER_ATTRIBUTION: "調整顧客歸屬", CUSTOMER_LABEL_MANAGE: "調整顧客標籤設定", CUSTOMER_LABEL_SET: "調整顧客標籤",
  UPDATE_NOTE: "修改備註", UPDATE_PAYMENT_METHOD: "修改付款方式", UPDATE_OWNER_STAFF: "調整收款歸屬人員", VOID: "作廢收款", REFUND: "退款",
  UPDATE_ORGANIZATION_PARENT: "調整母子店關係", UPDATE_ORGANIZATION_CAPACITY: "調整展店上限", UPDATE_CATALOG_ORDER: "調整店家排列順序",
  COPY_SERVICE_HOURS_TO_DATES: "複製營業時段", UNDO_COPY_SERVICE_HOURS_TO_DATES: "撤回營業時段複製", ARCHIVE: "封存店家", RESTORE: "還原店家",
  CREATE_RENTAL_CUSTOMER: "新增租借顧客", SEND_LINE_TEST_REMINDER: "傳送 LINE 測試提醒", SEND_MESSENGER_UTILITY_TEST_REMINDER: "傳送 Messenger 測試提醒",
  LOGIN_METHOD_PHONE_REPLACED: "更換登入手機", ACTIVATE_NOTIFICATION_PREBIND: "啟用通知綁定", INVENTORY_WRITE: "更新進銷存資料",
  APPROVED: "核准申請", REJECTED: "拒絕申請", EXPORT: "匯出資料", JOIN: "加入名單", REOPEN: "重新開啟",
  EXECUTE_LINE_REBIND: "重新綁定 LINE", EXECUTE_LIFF_LOGIN_REBIND: "重新綁定會員登入", EXECUTE_LIFF_LOGIN_FIRST_CAPTURE: "首次綁定會員登入",
  MERGE_DUPLICATE_CUSTOMER: "合併重複顧客", MERGE_CENTRAL_USER: "合併會員帳號", CENTRAL_MEMBER_CLAIM: "認領會員資料", CENTRAL_MEMBER_STORE_REGISTER: "建立門市會員關係",
  AUTO_MIGRATE_RECENT_LIFF_LOGIN_IDENTITY: "自動整理會員登入綁定", DIGITAL_BUTLER_LEAD_COLLECTION_PUBLISH: "發布顧客名單收集流程",
  MESSENGER_CONVERSATION_ENDED_BY_ADMIN: "總部結束顧客對話", MESSENGER_CONVERSATION_END_DENIED: "結束對話遭拒絕",
  MESSENGER_CONVERSATION_READONLY_DIAGNOSED: "查詢顧客對話狀況", MESSENGER_GRAPH_READONLY_DIAGNOSED: "查詢粉絲專頁連線狀況",
  MESSENGER_PAGE_REPAIR_DIAGNOSIS_STARTED: "開始檢查粉絲專頁", MESSENGER_PAGE_REPAIR_DIAGNOSIS_SUCCEEDED: "粉絲專頁檢查成功", MESSENGER_PAGE_REPAIR_DIAGNOSIS_FAILED: "粉絲專頁檢查失敗",
  MESSENGER_PAGE_SUBSCRIPTION_WRITE_STARTED: "開始設定粉絲專頁訂閱", MESSENGER_PAGE_SUBSCRIPTION_WRITE_SUCCEEDED: "粉絲專頁訂閱設定成功", MESSENGER_PAGE_SUBSCRIPTION_WRITE_FAILED: "粉絲專頁訂閱設定失敗",
  MESSENGER_PAGE_TOKEN_FINGERPRINT_DIAGNOSED: "查詢粉絲專頁授權狀況", ZHUBEI_MESSENGER_V13_PUBLISHED: "發布竹北顧客對話流程",
};
export const auditRoleLabel = (role: string | null | undefined) => (({ ADMIN: "總部", OWNER: "老闆", MANAGER: "店長", STAFF: "門市人員", PARTNER: "門市人員（舊帳號）", CUSTOMER: "顧客" } as Record<string, string>)[role ?? ""] ?? "未記錄身分");
export const auditActionLabel = (action: string) => actions[action] ?? "資料異動（舊紀錄未提供動作說明）";
export const auditTargetLabel = (targetType: string) => auditTargetLabels[targetType] ?? "資料（舊紀錄未提供類型說明）";

const fields: Record<string, string> = {
  name: "名稱", customerName: "顧客姓名", actorName: "操作人員", partyName: "交易對象", serviceNameSnapshot: "服務名稱", nameSnapshot: "課程名稱",
  serviceNote: "服務備註", method: "付款方式", usedCount: "已使用堂數", totalCount: "總堂數", expireAt: "到期日",
  notes: "備註", note: "備註", reason: "原因", status: "狀態", bookingStatus: "預約狀態", bookingType: "預約類型", bookingKind: "預約類型",
  entryDate: "收支日期", bookingDate: "預約日期", date: "日期", startsAt: "開始時間", endsAt: "結束時間", startTime: "開始時段", endTime: "結束時段", slotTime: "預約時段",
  type: "類型", kind: "單據類型", category: "分類", amount: "金額", total: "總金額", paid: "已付金額", price: "價格", trialPrice: "體驗費用", freight: "運費",
  paymentMethod: "付款方式", role: "人員身分", checkedInAt: "報到時間", completedAt: "完成時間", cancelledAt: "取消時間", expiresAt: "到期日", expiryDate: "到期日", validUntil: "有效期限",
  usedSessions: "已使用堂數", totalSessions: "總堂數", remainingSessions: "剩餘堂數", used: "已使用堂數", remaining: "剩餘堂數", sessions: "堂數", pointCost: "使用點數", points: "點數", balance: "剩餘額度",
  people: "預約人數", attendedPeople: "到店人數", capacity: "名額", enabled: "是否開啟", active: "是否啟用", isTrial: "是否體驗", isMakeup: "是否補課",
  stock: "庫存", actual: "實際庫存", difference: "庫存差額", quantity: "數量", delivery: "交付方式", shippingNote: "寄送備註", internalNote: "內部備註",
  records: "資料明細", permissions: "人員權限", permissionKeys: "人員權限", granted: "允許操作", denied: "禁止操作", lines: "品項明細", before: "原本庫存", after: "調整後庫存",
  viewedStoreId: "檢視店家", ownStoreId: "原所屬店家", storeId: "店家", customerId: "顧客", staffId: "歸屬人員", assignedStaffId: "所屬教練", revenueStaffId: "營收歸屬人員", serviceStaffId: "服務人員",
  coachId: "老師／教練", roomId: "教室", servicePlanId: "方案", planId: "方案", customerPlanWalletId: "顧客方案", customerIds: "顧客名單", sessionIds: "課程堂次", ids: "排列名單",
  teacherAttendance: "老師出席狀態", teacherAttendanceReason: "老師出席備註", maxWaitlist: "候補上限", cutoffHours: "停止遞補時間（小時）", workOrderNumber: "工單編號",
};
const values: Record<string, string> = {
  ACTIVE: "啟用中", INACTIVE: "已停用", PENDING: "待到店", CONFIRMED: "已確認", COMPLETED: "已完成", CANCELLED: "已取消", NO_SHOW: "未到", RESERVED: "待點名", ATTENDED: "已出席", CHECKED_IN: "已報到", STUDENT_LEAVE: "學員請假", SCHEDULED: "待上課",
  CASH: "現金", TRANSFER: "轉帳", BANK_TRANSFER: "銀行轉帳", CARD: "方案扣點", CREDIT_CARD: "信用卡", OTHER: "其他", INCOME: "收入", EXPENSE: "支出", SALE: "銷貨", PURCHASE: "進貨",
  FIRST_TRIAL: "首次體驗", SINGLE: "單次付費", PACKAGE_SESSION: "方案扣堂", TRIAL: "體驗", ENABLED: "開啟", DISABLED: "關閉", DEDUCTED: "已扣堂", NOT_DEDUCTED: "未扣堂", __all__: "總部全部店家",
};
export type AuditReferences = Record<string, string>;
export type PresentedAudit = { action: string; targetType: string; summary?: string | null; beforeJson?: unknown; afterJson?: unknown };
export function auditRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Never fall back to internal identifiers, enum keys or raw JSON in the UI. */
export function auditText(value: string): string {
  return value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "（資料編號已省略）")
    .replace(/\bc[a-z0-9]{20,}\b/g, "（資料編號已省略）")
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, "（舊紀錄未提供中文說明）");
}
export function auditSummary(item: PresentedAudit, target?: string) {
  if (item.targetType === "StaffPermission" && item.action === "UPDATE") {
    const name = target?.replace(/^人員權限 · /, "").replace(/（目前資料）$/, "");
    return name && !name.includes("未保存") ? `調整${name}的權限${target?.endsWith("（目前資料）") ? "（目前姓名）" : ""}` : `調整人員權限${target ? "（人員未記錄）" : ""}`;
  }
  const savedSummary = item.summary && /[\u3400-\u9fff]/.test(item.summary) && !item.summary.includes(item.targetType) && !item.summary.includes(item.action) ? auditText(item.summary) : null;
  if (item.action === "HQ_VIEW_ALL_STORES") return savedSummary ?? auditActionLabel(item.action);
  if (!target) return savedSummary ?? `${auditActionLabel(item.action)} · ${auditTargetLabel(item.targetType)}`;
  if (target.includes("舊紀錄未保存辨識內容")) return `${savedSummary ?? `${auditActionLabel(item.action)}${auditTargetLabel(item.targetType)}`}（資料未記錄）`;
  const subject = target.replace(`${auditTargetLabel(item.targetType)} · `, "");
  const operation = savedSummary ?? (
    ["CREATE", "UPDATE", "DELETE"].includes(item.action) ? `${auditActionLabel(item.action)}${auditTargetLabel(item.targetType)}` :
    ["CANCEL", "CANCELLED"].includes(item.action) && item.targetType === "CourseBooking" ? "取消課程預約" : auditActionLabel(item.action)
  );
  // Existing summaries can already name the record (e.g. an HQ switch).
  const parts = subject.split(" · ");
  const name = (item.targetType === "InventoryOrder" && ["銷貨", "進貨"].includes(parts[0]) ? parts[1] ?? "" : parts[0]).replace(/（目前資料）$/, "");
  if (name && operation.includes(name)) return operation;
  return `${operation}：${subject}`;
}
export function auditValue(key: string, value: unknown, references: AuditReferences = {}, depth = 0): string {
  if (value === null || value === undefined || value === "") return "未記錄";
  if (value === "[已隱藏]" || /password|secret|token|authorization|cookie|otp|verificationcode/i.test(key)) return "敏感資料已隱藏";
  if (depth > 4) return "詳細內容未提供白話說明";
  if (Array.isArray(value)) {
    if (!value.length) return "無";
    if (/^(permissions|permissionKeys|granted|denied)$/.test(key)) {
      const known = value.filter(v => typeof v === "string" && references[`permission:${v}`]).map(v => references[`permission:${v}`]);
      const missing = value.length - known.length;
      return [...known, ...(missing ? [`${missing} 項權限未保存中文說明`] : [])].join("、");
    }
    return value.map(v => auditValue(key.replace(/Ids$/, "Id"), v, references, depth + 1)).join("、");
  }
  if (/^(permissions|permissionKeys|granted|denied)$/.test(key) && typeof value === "string") return references[`permission:${value}`] ?? "權限說明未記錄";
  if (/Id$/.test(key)) return value === "__all__" ? values.__all__ : references[`${key}:${value}`] ?? "有關聯資料（舊紀錄未保存名稱）";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") {
    if (key === "permissions") return Object.entries(auditRecord(value)).map(([code, enabled]) => `${references[`permission:${code}`] ?? "權限說明未記錄"}：${enabled === true ? "允許" : "不允許"}`).join("；") || "無";
    return Object.entries(auditRecord(redactAuditValue(value))).filter(([k]) => fields[k]).map(([k,v]) => `${fields[k]}：${auditValue(k,v,references,depth+1)}`).join("；") || "內容已記錄，舊紀錄未提供欄位說明";
  }
  if (typeof value === "number" || /^(amount|total|paid|price|trialPrice|freight)$/.test(key) && Number.isFinite(Number(value))) return /^(amount|total|paid|price|trialPrice|freight)$/.test(key) ? `NT$ ${Number(value).toLocaleString("zh-TW")}` : String(value);
  const text = String(value);
  if (key === "paymentMethod" && text === "CARD") return "刷卡";
  if (key === "role") return auditRoleLabel(text);
  if (values[text]) return values[text];
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
  }
  if (/^[A-Z][A-Z_0-9]+$/.test(text) || /^(permissions|permissionKeys|granted|denied)$/.test(key)) return "已記錄設定（舊紀錄未提供中文說明）";
  return auditText(text);
}
export function auditChanges(before: unknown, after: unknown, references: AuditReferences = {}) {
  const previous = auditRecord(redactAuditValue(Array.isArray(before) ? { records: before } : before)), next = auditRecord(redactAuditValue(Array.isArray(after) ? { records: after } : after));
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  const permissionKeys = ["permissions", "permissionKeys", "granted", "denied"];
  const changes: { label: string; before: string; after: string }[] = [];
  let missing = false;
  if (keys.some(key => permissionKeys.includes(key))) {
    const oldPermissions = permissionSnapshot(previous), newPermissions = permissionSnapshot(next);
    if (oldPermissions && newPermissions) {
      const added = [...newPermissions].filter(code => !oldPermissions.has(code));
      const removed = [...oldPermissions].filter(code => !newPermissions.has(code));
      if (added.length) changes.push({label:"新增權限",before:"",after:auditValue("permissions",added,references)});
      if (removed.length) changes.push({label:"取消權限",before:"",after:auditValue("permissions",removed,references)});
    } else missing = true;
  }
  for (const key of keys.filter(key => !permissionKeys.includes(key))) {
    if (key === "storeId" && keys.some(k => permissionKeys.includes(k)) && previous.storeId === undefined) continue;
    // Empty legacy arrays contain no useful change evidence.
    if (key === "records" && [previous[key],next[key]].every(v => v == null || Array.isArray(v) && !v.length)) continue;
    if (!fields[key]) { missing = true; continue; }
    changes.push({label:fields[key],before:auditValue(key,previous[key],references),after:auditValue(key,next[key],references)});
  }
  if (missing) changes.push({label:"",before:"",after:changes.length ? "部分異動內容未保存" : "未保存異動內容"});
  return changes;
}
function permissionSnapshot(snapshot: Record<string, unknown>): Set<string> | null {
  const value = snapshot.permissions ?? snapshot.permissionKeys ?? snapshot.granted;
  if (Array.isArray(value) && value.every(v => typeof v === "string")) return new Set(value);
  if (value && typeof value === "object" && Object.values(value).every(v => typeof v === "boolean")) return new Set(Object.entries(value).filter(([,enabled])=>enabled).map(([code])=>code));
  return null;
}
export function auditSnapshotTarget(item: PresentedAudit) {
  const snapshot = { ...auditRecord(item.beforeJson), ...auditRecord(item.afterJson) };
  const name = snapshot.customerName ?? snapshot.partyName ?? snapshot.name ?? snapshot.serviceNameSnapshot ?? snapshot.nameSnapshot;
  return typeof name === "string" && name.trim() ? `${auditTargetLabel(item.targetType)} · ${auditText(name)}` : null;
}
