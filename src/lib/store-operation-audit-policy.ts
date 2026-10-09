import { auditActionLabel, auditTargetLabel } from "@/lib/audit-presentation";

/** Positive, target-specific business action list. New actions stay private until reviewed. */
export const STORE_AUDIT_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  Booking: ["CREATE", "UPDATE", "CANCEL", "COMPLETE", "NO_SHOW", "REVERT", "BOOKING_NOTE_UPDATED"],
  SpaBooking: ["CREATE", "UPDATE", "CANCEL", "COMPLETE", "NO_SHOW", "REVERT"],
  SpaBookingGroup: ["CREATE", "UPDATE", "CANCEL", "COMPLETE"],
  CourseBooking: ["CREATE", "UPDATE", "CANCEL", "CANCELLED", "RESERVED", "ATTENDED", "CHECKED_IN", "NO_SHOW", "STUDENT_LEAVE", "UPDATE_NOTE"],
  CourseSession: ["CREATE", "UPDATE", "CANCEL"],
  CourseWaitlist: ["CREATE", "CANCEL", "AUTO_PROMOTE", "CAPACITY_AUTO_PROMOTE", "MANUAL_PROMOTE"],
  Customer: ["CREATE", "UPDATE", "SERVICE_NOTE_UPDATED", "COURSE_BULK_ASSIGN", "COURSE_CUSTOMER_ATTRIBUTION", "CUSTOMER_LABEL_SET", "CREATE_RENTAL_CUSTOMER"],
  CustomerLabel: ["CREATE", "UPDATE", "DELETE", "CUSTOMER_LABEL_MANAGE"],
  CashbookEntry: ["CREATE", "UPDATE", "DELETE"],
  Transaction: ["CREATE", "UPDATE_PAYMENT_METHOD", "UPDATE_OWNER_STAFF", "VOID", "REFUND", "UPDATE_NOTE"],
  InventoryOrder: ["CREATE", "UPDATE", "CANCEL", "COMPLETE", "INVENTORY_WRITE"],
  InventoryProduct: ["CREATE", "UPDATE", "INVENTORY_WRITE"],
  InventorySupplier: ["CREATE", "UPDATE", "INVENTORY_WRITE"],
  InventoryPayment: ["CREATE", "UPDATE", "VOID", "INVENTORY_WRITE"],
  InventoryStockCount: ["CREATE", "UPDATE", "COMPLETE", "INVENTORY_WRITE"],
};

export const STORE_AUDIT_ACTOR_ROLES = ["OWNER", "MANAGER", "STAFF", "PARTNER", "CUSTOMER"] as const;

export function isStoreAuditTarget(targetType: string): boolean {
  return Object.hasOwn(STORE_AUDIT_ACTIONS, targetType);
}

const NUMBER_FIELDS = new Set(["amount", "total", "paid", "price", "quantity", "capacity", "remaining", "remainingPoints", "usedCount"]);
const STATUS_VALUES = new Set(["RESERVED", "ATTENDED", "CHECKED_IN", "CANCELLED", "CANCELED", "CONFIRMED", "COMPLETED", "NO_SHOW", "STUDENT_LEAVE", "ACTIVE", "INACTIVE", "PENDING", "PAID", "UNPAID", "VOID", "DRAFT", "CASH", "CARD", "TRANSFER"]);
/** No arbitrary strings/nesting: notes, identity, IP, sessions and security fields never pass. */
export function storeAuditSnapshot(value: unknown): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (NUMBER_FIELDS.has(key) && typeof item === "number" && Number.isFinite(item)) result[key] = item;
    if ((key === "status" || key === "paymentMethod") && typeof item === "string" && STATUS_VALUES.has(item)) result[key] = item;
  }
  return result;
}

type StoreAuditSource = {
  id: string; targetType: string; action: string; createdAt: Date;
  actorNameSnapshot: string | null; actor: { name: string; role: string };
  actorRoleSnapshot: string | null; module: string | null;
  beforeJson: unknown; afterJson: unknown;
};
export function toStoreAuditItem(item: StoreAuditSource) {
  if (!STORE_AUDIT_ACTIONS[item.targetType]?.includes(item.action)
      || !STORE_AUDIT_ACTOR_ROLES.some(role => role === item.actorRoleSnapshot) || item.actor.role === "ADMIN" || item.module === "SYSTEM") return null;
  return {
    id: item.id,
    action: item.action,
    summary: `${auditActionLabel(item.action)} · ${auditTargetLabel(item.targetType)}`,
    targetLabel: auditTargetLabel(item.targetType),
    module: item.module,
    createdAt: item.createdAt.toISOString(),
    actorNameSnapshot: item.actorNameSnapshot,
    actor: { name: item.actor.name, role: item.actorRoleSnapshot ?? item.actor.role },
    beforeJson: Object.keys(storeAuditSnapshot(item.beforeJson)).length ? storeAuditSnapshot(item.beforeJson) : null,
    afterJson: Object.keys(storeAuditSnapshot(item.afterJson)).length ? storeAuditSnapshot(item.afterJson) : null,
  };
}
export type StoreOperationAuditItem = NonNullable<ReturnType<typeof toStoreAuditItem>>;
