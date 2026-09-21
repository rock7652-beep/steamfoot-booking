import "server-only";
import type { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";
import { courseCustomerStaffScope } from "./course-home";
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
export async function courseHomeAccess(user: User, storeId: string) {
    const [bookings, create, attendance, customers, updateCustomers, revenue, confirm, cash, blocked, planStatus] = await Promise.all([
        checkPermission(user.role, user.staffId, "booking.read"), checkPermission(user.role, user.staffId, "booking.create"), checkPermission(user.role, user.staffId, "booking.update"),
        checkPermission(user.role, user.staffId, "customer.read"), checkPermission(user.role, user.staffId, "customer.update"), checkPermission(user.role, user.staffId, "transaction.read"), checkPermission(user.role, user.staffId, "wallet.create"), checkPermission(user.role, user.staffId, "cashDrawer.read"), isStoreSubscriptionWriteBlocked(storeId),
        checkPermission(user.role, user.staffId, "wallet.read"),
    ]);
    const writable = !blocked && (user.role === "ADMIN" || user.storeId === storeId);
    return { bookings, create: create && bookings && writable, customers, planStatus, revenue, cash, staffScope: courseCustomerStaffScope(user, storeId), todos: { payments: revenue && confirm && writable, attendance: bookings && attendance && writable, followUp: customers && updateCustomers && writable, staffScope: courseCustomerStaffScope(user, storeId) } };
}
